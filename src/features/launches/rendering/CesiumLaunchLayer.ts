import {
  BillboardCollection,
  BoundingSphere,
  Cartesian2,
  Cartesian3,
  Color,
  DistanceDisplayCondition,
  HeadingPitchRange,
  HeightReference,
  HorizontalOrigin,
  LabelCollection,
  NearFarScalar,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  VerticalOrigin,
  type Billboard,
  type Label,
} from "cesium";

import type { EarthEngineLayer, EarthLayerContext } from "@/features/earth-engine/contracts/layers";
import type { GraphicsQuality } from "@/features/settings/model/preferences";

import type { LaunchRecord } from "../domain/launch";
import {
  createLaunchSites,
  findLaunchSite,
  type LaunchSiteRecord,
} from "../domain/launchSite";

export interface LaunchLayerSnapshot {
  hoverScreenPosition: { x: number; y: number } | null;
  hoveredSiteId: string | null;
  renderedSiteCount: number;
  selectedId: string | null;
  selectedSiteId: string | null;
  totalLaunchCount: number;
}

interface LaunchPickId {
  kind: "launch-site";
  siteId: string;
}

const QUALITY_LIMITS: Record<GraphicsQuality, number> = {
  eco: 18,
  balanced: 36,
  high: 64,
};

const LAUNCH_PAD_IMAGE = svgDataUri(`
  <svg xmlns="http://www.w3.org/2000/svg" width="34" height="40" viewBox="0 0 34 40">
    <path d="M17 2 31 17 17 32 3 17Z" fill="#07111f" fill-opacity=".88" stroke="#f2b25d" stroke-width="2"/>
    <path d="M13 22V11h8v11M10 23h14M12 27h10" fill="none" stroke="#fff3dc" stroke-width="1.7" stroke-linecap="round"/>
    <path d="M17 32v6" stroke="#f2b25d" stroke-width="2"/>
  </svg>`);
const GO_LAUNCH_PAD_IMAGE = svgDataUri(`
  <svg xmlns="http://www.w3.org/2000/svg" width="34" height="40" viewBox="0 0 34 40">
    <path d="M17 2 31 17 17 32 3 17Z" fill="#07111f" fill-opacity=".88" stroke="#f2b25d" stroke-width="2"/>
    <path d="M13 22V11h8v11M10 23h14M12 27h10" fill="none" stroke="#fff3dc" stroke-width="1.7" stroke-linecap="round"/>
    <circle cx="27" cy="7" r="4" fill="#72e19a" stroke="#07111f" stroke-width="1.5"/>
    <path d="M17 32v6" stroke="#f2b25d" stroke-width="2"/>
  </svg>`);
const SELECTED_RING_IMAGE = svgDataUri(`
  <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
    <circle cx="24" cy="24" r="19" fill="none" stroke="#f2b25d" stroke-opacity=".72" stroke-width="1.5" stroke-dasharray="3 4"/>
    <circle cx="24" cy="24" r="22" fill="none" stroke="#f2b25d" stroke-opacity=".18" stroke-width="2"/>
  </svg>`);

export class CesiumLaunchLayer implements EarthEngineLayer {
  readonly id = "upcoming-launch-sites";
  readonly slot = "launch" as const;

  private billboards: BillboardCollection | null = null;
  private clickHandler: ScreenSpaceEventHandler | null = null;
  private context: EarthLayerContext | null = null;
  private labels: LabelCollection | null = null;
  private launches: readonly LaunchRecord[] = [];
  private sites: LaunchSiteRecord[] = [];
  private readonly listeners = new Set<() => void>();
  private quality: GraphicsQuality = "balanced";
  private rendered: Array<{
    marker: Billboard;
    ring: Billboard;
    site: LaunchSiteRecord;
  }> = [];
  private selectionLabel: Label | null = null;
  private selectionLabelSiteId: string | null = null;
  private snapshot: LaunchLayerSnapshot = {
    hoverScreenPosition: null,
    hoveredSiteId: null,
    renderedSiteCount: 0,
    selectedId: null,
    selectedSiteId: null,
    totalLaunchCount: 0,
  };
  private visible = true;
  private lastHoverAt = 0;

  getSnapshot = (): LaunchLayerSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  mount(context: EarthLayerContext): void {
    this.context = context;
    this.billboards = new BillboardCollection({ scene: context.scene });
    this.labels = new LabelCollection({ scene: context.scene });
    context.scene.primitives.add(this.billboards);
    context.scene.primitives.add(this.labels);
    this.clickHandler = new ScreenSpaceEventHandler(context.scene.canvas);
    this.clickHandler.setInputAction(
      (event: { position: Cartesian2 }) => this.handlePick(event.position),
      ScreenSpaceEventType.LEFT_CLICK,
    );
    this.clickHandler.setInputAction(
      (event: { endPosition: Cartesian2 }) => this.handleHover(event.endPosition),
      ScreenSpaceEventType.MOUSE_MOVE,
    );
    this.rebuild();
  }

  setLaunches(launches: readonly LaunchRecord[]): void {
    const previouslySelectedId = this.snapshot.selectedId;
    this.launches = launches;
    this.sites = createLaunchSites(launches);
    const selectedLaunch = previouslySelectedId
      ? launches.find((launch) => launch.id === previouslySelectedId)
      : null;
    const selectedSite = selectedLaunch
      ? findLaunchSite(this.sites, selectedLaunch.id)
      : null;
    const selectionBecameUnavailable = previouslySelectedId !== null &&
      (!selectedLaunch || !selectedSite);
    this.update({
      selectedId: selectedSite ? (selectedLaunch?.id ?? null) : null,
      selectedSiteId: selectedSite?.id ?? null,
      totalLaunchCount: launches.length,
    });
    this.rebuild();
    if (selectionBecameUnavailable) {
      this.context?.cameraController.returnToDefaultEarth();
    }
  }

  selectLaunch(
    id: string | null,
    flyTo = false,
    restoreCamera = true,
  ): void {
    const hadSelection = this.snapshot.selectedId !== null;
    const launch = id ? this.launches.find((candidate) => candidate.id === id) : null;
    const site = launch ? findLaunchSite(this.sites, launch.id) : null;
    this.update({
      selectedId: launch?.id ?? null,
      selectedSiteId: site?.id ?? null,
    });
    this.refreshSelection();
    if (flyTo && site) this.focusSite(site, 1.35);
    if (!launch && hadSelection && restoreCamera) {
      this.context?.cameraController.returnToDefaultEarth();
    }
  }

  selectSite(id: string | null, flyTo = false): void {
    const site = id ? this.sites.find((candidate) => candidate.id === id) : null;
    this.selectLaunch(site?.nextLaunch.id ?? null, flyTo);
  }

  focusSelected(): void {
    const site = this.sites.find(
      (candidate) => candidate.id === this.snapshot.selectedSiteId,
    );
    if (site) this.focusSite(site, 1.1);
  }

  setQuality(quality: GraphicsQuality): void {
    if (quality === this.quality) return;
    this.quality = quality;
    this.rebuild();
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    if (this.billboards) this.billboards.show = visible;
    if (this.labels) this.labels.show = visible;
    this.context?.requestRender();
  }

  unmount(): void {
    this.clickHandler?.destroy();
    this.clickHandler = null;
    if (this.context) {
      if (this.billboards) this.context.scene.primitives.remove(this.billboards);
      if (this.labels) this.context.scene.primitives.remove(this.labels);
    }
    this.context = null;
    this.billboards = null;
    this.labels = null;
    this.selectionLabel = null;
    this.rendered = [];
    this.listeners.clear();
  }

  private rebuild(): void {
    if (!this.billboards) return;
    this.billboards.removeAll();
    this.labels?.removeAll();
    this.selectionLabel = null;
    this.selectionLabelSiteId = null;
    const sites = this.sites.slice(0, QUALITY_LIMITS[this.quality]);
    this.rendered = sites.map((site) => {
      const position = Cartesian3.fromDegrees(site.longitude, site.latitude, 0);
      const ring = this.billboards!.add({
        disableDepthTestDistance: 0,
        distanceDisplayCondition: new DistanceDisplayCondition(0, 48_000_000),
        heightReference: HeightReference.CLAMP_TO_TERRAIN,
        image: SELECTED_RING_IMAGE,
        pixelOffset: new Cartesian2(0, -8),
        position,
        scale: 1,
        scaleByDistance: new NearFarScalar(700_000, 1.12, 42_000_000, 0.66),
        show: false,
      });
      const marker = this.billboards!.add({
        disableDepthTestDistance: 0,
        distanceDisplayCondition: new DistanceDisplayCondition(0, 48_000_000),
        heightReference: HeightReference.CLAMP_TO_TERRAIN,
        id: { kind: "launch-site", siteId: site.id } satisfies LaunchPickId,
        image: isGo(site.nextLaunch) ? GO_LAUNCH_PAD_IMAGE : LAUNCH_PAD_IMAGE,
        pixelOffset: new Cartesian2(0, -10),
        position,
        scale: 0.6,
        scaleByDistance: new NearFarScalar(700_000, 1.08, 42_000_000, 0.54),
        translucencyByDistance: new NearFarScalar(700_000, 0.92, 48_000_000, 0.34),
      });
      return { marker, ring, site };
    });
    this.billboards.show = this.visible;
    this.update({ renderedSiteCount: this.rendered.length });
    this.refreshSelection();
  }

  private refreshSelection(): void {
    const selectedSiteId = this.snapshot.selectedSiteId;
    for (const rendered of this.rendered) {
      const selected = rendered.site.id === selectedSiteId;
      const hovered = rendered.site.id === this.snapshot.hoveredSiteId;
      rendered.marker.scale = selected ? 0.96 : hovered ? 0.76 : 0.6;
      rendered.ring.show = this.visible && selected;
    }
    if (!this.labels) return;
    if (!selectedSiteId) {
      if (this.selectionLabel) this.labels.remove(this.selectionLabel);
      this.selectionLabel = null;
      this.selectionLabelSiteId = null;
      this.context?.requestRender();
      return;
    }
    const selected = this.rendered.find(({ site }) => site.id === selectedSiteId);
    if (!selected) return;
    if (this.selectionLabelSiteId !== selectedSiteId) {
      if (this.selectionLabel) this.labels.remove(this.selectionLabel);
      this.selectionLabel = this.labels.add({
        backgroundColor: Color.fromCssColorString("#07111f").withAlpha(0.92),
        disableDepthTestDistance: 0,
        distanceDisplayCondition: new DistanceDisplayCondition(0, 28_000_000),
        fillColor: Color.fromCssColorString("#fff4df"),
        font: "600 12px 'Segoe UI Variable', sans-serif",
        heightReference: HeightReference.CLAMP_TO_TERRAIN,
        horizontalOrigin: HorizontalOrigin.CENTER,
        pixelOffset: new Cartesian2(0, -34),
        position: selected.marker.position,
        scaleByDistance: new NearFarScalar(800_000, 1.08, 25_000_000, 0.72),
        showBackground: true,
        text: selected.site.name,
        verticalOrigin: VerticalOrigin.BOTTOM,
      });
      this.selectionLabelSiteId = selectedSiteId;
    }
    this.labels.show = this.visible;
    this.context?.requestRender();
  }

  private focusSite(site: LaunchSiteRecord, duration: number): void {
    if (!this.context) return;
    const position = Cartesian3.fromDegrees(site.longitude, site.latitude, 0);
    const width = this.context.scene.canvas.clientWidth;
    const range = width >= 1_180 ? 1_420_000 : 1_180_000;
    this.context.cameraController.focusBoundingSphere(
      new BoundingSphere(position, 25_000),
      {
        complete: () => {
          if (this.context && width >= 1_180) {
            this.context.scene.camera.moveRight(range * 0.16);
            this.context.requestRender();
          }
        },
        duration,
        offset: new HeadingPitchRange(-0.28, -0.5, range),
      },
    );
  }

  private handlePick(position: Cartesian2): void {
    const picked = this.context?.scene.pick(position) as { id?: unknown } | undefined;
    const pickedId = picked?.id;
    if (!isLaunchPickId(pickedId)) return;
    this.selectSite(pickedId.siteId, true);
  }

  private handleHover(position: Cartesian2): void {
    const now = performance.now();
    if (now - this.lastHoverAt < 48) return;
    this.lastHoverAt = now;
    const picked = this.context?.scene.pick(position) as { id?: unknown } | undefined;
    const pickedId = picked?.id;
    if (!isLaunchPickId(pickedId)) {
      if (this.snapshot.hoveredSiteId !== null) {
        this.update({ hoverScreenPosition: null, hoveredSiteId: null });
        this.refreshSelection();
      }
      return;
    }
    this.update({
      hoverScreenPosition: { x: position.x, y: position.y },
      hoveredSiteId: pickedId.siteId,
    });
    this.refreshSelection();
  }

  private update(patch: Partial<LaunchLayerSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }
}

function svgDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.trim())}`;
}

function isLaunchPickId(value: unknown): value is LaunchPickId {
  return typeof value === "object" && value !== null &&
    "kind" in value && value.kind === "launch-site" &&
    "siteId" in value && typeof value.siteId === "string";
}

function isGo(launch: LaunchRecord): boolean {
  return `${launch.statusAbbreviation ?? ""} ${launch.statusName ?? ""}`
    .toLocaleLowerCase()
    .includes("go");
}
