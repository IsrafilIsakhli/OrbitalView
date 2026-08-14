import {
  BoundingSphere,
  Cartesian2,
  Cartesian3,
  Color,
  DistanceDisplayCondition,
  Ellipsoid,
  GeometryInstance,
  GroundPolylineGeometry,
  GroundPolylinePrimitive,
  HeadingPitchRange,
  HorizontalOrigin,
  LabelCollection,
  LabelStyle,
  Material,
  Matrix4,
  NearFarScalar,
  Occluder,
  PointPrimitiveCollection,
  PolylineCollection,
  PolylineMaterialAppearance,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  VerticalOrigin,
  type Label,
  type PointPrimitive,
} from "cesium";

import type { EarthEngineLayer, EarthLayerContext } from "@/features/earth-engine/contracts/layers";
import { qualityProfiles } from "@/features/earth-engine/quality/qualityProfiles";
import type { GraphicsQuality } from "@/features/settings/model/preferences";

import {
  countSatelliteCategories,
  type SatelliteCategory,
  type SatelliteCategoryCounts,
  type SatelliteRecord,
} from "../domain/satellite";
import type { OrbitWorkerRequest, OrbitWorkerResponse } from "../worker/messages";
import {
  resolveVisualTier,
  selectSatellitePresentation,
  type SatellitePresentationMode,
  type SatelliteVisualTier,
} from "./satelliteVisualLod";

export type SatelliteLayerStatus = "idle" | "loading" | "ready" | "error";

export interface SatelliteTelemetry {
  altitudeKm: number;
  latitudeDegrees: number | null;
  longitudeDegrees: number | null;
  timestampIso: string;
  velocityKmPerSecond: number;
}

export interface SatelliteLayerSnapshot {
  categoryCounts: SatelliteCategoryCounts;
  categoryVisibility: Record<SatelliteCategory, boolean>;
  focusedCategory: SatelliteCategory | null;
  followSelected: boolean;
  groundTrackVisible: boolean;
  hoverScreenPosition: { x: number; y: number } | null;
  hoveredId: string | null;
  hoveredTelemetry: SatelliteTelemetry | null;
  lastUpdatedAt: string | null;
  orbitVisible: boolean;
  presentationMode: SatellitePresentationMode;
  primitiveCount: number;
  renderedCount: number;
  rocketBodyCount: number;
  selectedId: string | null;
  selectedOccluded: boolean;
  selectedTelemetry: SatelliteTelemetry | null;
  semanticMarkerCount: number;
  showcaseOrbitCount: number;
  signalCount: number;
  status: SatelliteLayerStatus;
  totalCount: number;
  validCount: number;
}

export const initialSatelliteLayerSnapshot: SatelliteLayerSnapshot = {
  categoryCounts: countSatelliteCategories([]),
  categoryVisibility: {
    communications: true,
    debris: true,
    navigation: true,
    other: true,
    "rocket-body": true,
    science: true,
    starlink: true,
    station: true,
    weather: true,
  },
  focusedCategory: null,
  followSelected: false,
  groundTrackVisible: true,
  hoverScreenPosition: null,
  hoveredId: null,
  hoveredTelemetry: null,
  lastUpdatedAt: null,
  orbitVisible: true,
  presentationMode: "overview",
  primitiveCount: 0,
  renderedCount: 0,
  rocketBodyCount: 0,
  selectedId: null,
  selectedOccluded: false,
  selectedTelemetry: null,
  semanticMarkerCount: 0,
  showcaseOrbitCount: 0,
  signalCount: 0,
  status: "idle",
  totalCount: 0,
  validCount: 0,
};

const CATEGORY_COLORS: Record<SatelliteCategory, Color> = {
  station: Color.fromCssColorString("#79f2a6"),
  "rocket-body": Color.fromCssColorString("#ffad62"),
  debris: Color.fromCssColorString("#ff7185"),
  starlink: Color.fromCssColorString("#62d6ff"),
  navigation: Color.fromCssColorString("#ffca6b"),
  weather: Color.fromCssColorString("#9ed7ff"),
  science: Color.fromCssColorString("#7fe6c7"),
  communications: Color.fromCssColorString("#b4a2ff"),
  other: Color.fromCssColorString("#8db8df"),
};

const ALL_CATEGORIES_VISIBLE: Record<SatelliteCategory, boolean> = {
  communications: true,
  debris: true,
  navigation: true,
  other: true,
  "rocket-body": true,
  science: true,
  starlink: true,
  station: true,
  weather: true,
};

interface SatellitePickId {
  kind: "satellite";
  satelliteId: string;
}

export class CesiumSatelliteLayer implements EarthEngineLayer {
  readonly id = "live-satellites";
  readonly slot = "satellite" as const;

  private catalog: readonly SatelliteRecord[] = [];
  private clickHandler: ScreenSpaceEventHandler | null = null;
  private context: EarthLayerContext | null = null;
  private directionLines: PolylineCollection | null = null;
  private groundTrackPrimitive: GroundPolylinePrimitive | null = null;
  private hoverOrbitLines: PolylineCollection | null = null;
  private hoverPoints: PointPrimitiveCollection | null = null;
  private hoverVisualId: string | null = null;
  private indexById = new Map<string, number>();
  private labels: LabelCollection | null = null;
  private latestErrors: Int8Array | null = null;
  private latestPositions: Float64Array | null = null;
  private latestTelemetry: Float64Array | null = null;
  private readonly listeners = new Set<() => void>();
  private orbitLines: PolylineCollection | null = null;
  private points: PointPrimitiveCollection | null = null;
  private quality: GraphicsQuality = "balanced";
  private renderedIndices: number[] = [];
  private renderedPoints: PointPrimitive[] = [];
  private semanticIndices: number[] = [];
  private semanticPoints: PointPrimitiveCollection | null = null;
  private semanticPrimitives: PointPrimitive[] = [];
  private showcaseIndices: number[] = [];
  private showcaseLines: PolylineCollection | null = null;
  private selectionPoints: PointPrimitiveCollection | null = null;
  private selectionVisualId: string | null = null;
  private selectedCore: PointPrimitive | null = null;
  private selectedLabel: Label | null = null;
  private selectedRing: PointPrimitive | null = null;
  private symbols: LabelCollection | null = null;
  private symbolIndices: number[] = [];
  private symbolLabels: Label[] = [];
  private trailLines: PolylineCollection | null = null;
  private cameraChangeListener: (() => void) | null = null;
  private snapshot: SatelliteLayerSnapshot = initialSatelliteLayerSnapshot;
  private visible = true;
  private visualTier: SatelliteVisualTier = "global";
  private worker: Worker | null = null;
  private lastHoverAt = 0;
  private hoverOrbitTimer: ReturnType<typeof setTimeout> | null = null;
  private followPosition: Cartesian3 | null = null;
  private followTarget: Cartesian3 | null = null;
  private previousFollowTarget: Cartesian3 | null = null;

  getSnapshot = (): SatelliteLayerSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  mount(context: EarthLayerContext): void {
    this.context = context;
    this.points = new PointPrimitiveCollection();
    this.semanticPoints = new PointPrimitiveCollection();
    this.hoverPoints = new PointPrimitiveCollection();
    this.selectionPoints = new PointPrimitiveCollection();
    this.labels = new LabelCollection();
    this.symbols = new LabelCollection();
    this.orbitLines = new PolylineCollection();
    this.hoverOrbitLines = new PolylineCollection();
    this.trailLines = new PolylineCollection();
    this.directionLines = new PolylineCollection();
    this.showcaseLines = new PolylineCollection();
    context.scene.primitives.add(this.points);
    context.scene.primitives.add(this.showcaseLines);
    context.scene.primitives.add(this.hoverOrbitLines);
    context.scene.primitives.add(this.trailLines);
    context.scene.primitives.add(this.directionLines);
    context.scene.primitives.add(this.semanticPoints);
    context.scene.primitives.add(this.symbols);
    context.scene.primitives.add(this.hoverPoints);
    context.scene.primitives.add(this.orbitLines);
    context.scene.primitives.add(this.selectionPoints);
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
    this.cameraChangeListener = context.scene.camera.changed.addEventListener(
      this.handleCameraChange,
    );
    this.rebuildSignals();
    if (this.catalog.length > 0) this.startWorker();
  }

  setCatalog(catalog: readonly SatelliteRecord[]): void {
    const previouslySelectedId = this.snapshot.selectedId;
    this.catalog = catalog;
    this.indexById = new Map(catalog.map((satellite, index) => [satellite.id, index]));
    const selectedId = previouslySelectedId && this.indexById.has(previouslySelectedId)
      ? previouslySelectedId
      : null;
    const selectionBecameUnavailable = previouslySelectedId !== null && selectedId === null;
    if (selectionBecameUnavailable) this.setFollowSelected(false);
    this.latestErrors = null;
    this.latestPositions = null;
    this.latestTelemetry = null;
    this.hoverVisualId = null;
    this.update({
      categoryCounts: countSatelliteCategories(catalog),
      focusedCategory: null,
      lastUpdatedAt: null,
      presentationMode: "overview",
      primitiveCount: 0,
      renderedCount: 0,
      rocketBodyCount: catalog.filter(
        (satellite) => satellite.category === "rocket-body",
      ).length,
      selectedId,
      selectedOccluded: false,
      selectedTelemetry: null,
      semanticMarkerCount: 0,
      showcaseOrbitCount: 0,
      signalCount: 0,
      status: catalog.length > 0 ? "loading" : "idle",
      totalCount: catalog.length,
      validCount: 0,
    });
    if (selectionBecameUnavailable) this.refreshSelectionVisuals();
    this.rebuildSignals();
    this.startWorker();
    if (selectionBecameUnavailable) {
      this.clearSelectedGeometry();
      this.context?.cameraController.returnToDefaultEarth();
    }
  }

  selectSatellite(id: string | null, restoreCamera = true): void {
    const hadSelection = this.snapshot.selectedId !== null;
    const index = id === null
      ? -1
      : (this.indexById.get(id) ?? -1);
    const selectedId = index >= 0 ? id : null;
    if (selectedId === null) {
      this.setFollowSelected(false);
      this.clearSelectedGeometry();
    } else {
      this.clearHover();
    }
    this.update({ selectedId, selectedOccluded: false, selectedTelemetry: null });
    this.worker?.postMessage({
      index: selectedId === null ? null : index,
      sampleCount: qualityProfiles[this.quality].orbitSampleCount,
      type: "select",
    } satisfies OrbitWorkerRequest);
    this.refreshSelectionVisuals();
    this.updatePresentationStyles();
    if (selectedId === null && hadSelection && restoreCamera) {
      this.context?.cameraController.returnToDefaultEarth();
    }
  }

  focusSelected(): void {
    const position = this.selectedPosition();
    if (!position || !this.context) return;
    this.setFollowSelected(false);
    const selectedIndex = this.snapshot.selectedId
      ? this.indexById.get(this.snapshot.selectedId)
      : undefined;
    const selected = selectedIndex === undefined ? undefined : this.catalog[selectedIndex];
    const canvas = this.context.scene.canvas;
    const inspectorAllowance = canvas.clientWidth >= 1_180 ? 1.18 : 1;
    const range = (selected?.category === "station" ? 680_000 : 920_000) *
      inspectorAllowance;
    this.context.cameraController.focusBoundingSphere(
      new BoundingSphere(position, 90_000),
      {
        complete: () => {
          if (this.context && this.context.scene.canvas.clientWidth >= 1_180) {
            this.context.scene.camera.moveRight(range * 0.16);
            this.context.requestRender();
          }
        },
        duration: 1.25,
        offset: new HeadingPitchRange(-0.22, -0.4, range),
      },
    );
  }

  focusCategory(category: SatelliteCategory | null): void {
    const visibility = category && !this.snapshot.categoryVisibility[category]
      ? { ...this.snapshot.categoryVisibility, [category]: true }
      : this.snapshot.categoryVisibility;
    this.update({
      categoryVisibility: visibility,
      focusedCategory: category,
      presentationMode: category ? "category" : "overview",
    });
    this.refreshSemanticPresentation();
    this.updatePresentationStyles();
    this.applyFrame();
    this.requestShowcaseOrbits();
  }

  setFollowSelected(enabled: boolean): void {
    const next = enabled && this.snapshot.selectedId !== null;
    if (this.snapshot.followSelected === next) return;
    this.update({ followSelected: next });
    if (!next && this.context) {
      this.followPosition = null;
      this.followTarget = null;
      this.previousFollowTarget = null;
      this.context.scene.camera.lookAtTransform(Matrix4.IDENTITY);
    } else if (next) {
      const selected = this.selectedPosition();
      this.followTarget = selected ? Cartesian3.clone(selected) : null;
      this.followPosition = selected ? Cartesian3.clone(selected) : null;
    }
  }

  setOrbitVisible(visible: boolean): void {
    this.update({ orbitVisible: visible });
    if (this.orbitLines) this.orbitLines.show = this.visible && visible;
    if (this.showcaseLines) this.showcaseLines.show = this.visible && visible;
    if (this.hoverOrbitLines) this.hoverOrbitLines.show = this.visible && visible;
    if (this.trailLines) this.trailLines.show = this.visible && visible;
    if (this.directionLines) this.directionLines.show = this.visible && visible;
    this.context?.requestRender();
  }

  setGroundTrackVisible(visible: boolean): void {
    this.update({ groundTrackVisible: visible });
    if (this.groundTrackPrimitive) {
      this.groundTrackPrimitive.show = this.visible && visible;
    }
    this.context?.requestRender();
  }

  setCategoryVisible(category: SatelliteCategory, visible: boolean): void {
    if (this.snapshot.categoryVisibility[category] === visible) return;
    const selectedIndex = this.snapshot.selectedId
      ? this.indexById.get(this.snapshot.selectedId)
      : undefined;
    const selected = selectedIndex === undefined ? undefined : this.catalog[selectedIndex];
    if (!visible && selected?.category === category) this.selectSatellite(null);
    const focusedCategory = !visible && this.snapshot.focusedCategory === category
      ? null
      : this.snapshot.focusedCategory;
    this.update({
      categoryVisibility: {
        ...this.snapshot.categoryVisibility,
        [category]: visible,
      },
      focusedCategory,
      presentationMode: focusedCategory ? "category" : "overview",
    });
    this.refreshSemanticPresentation();
    this.updatePresentationStyles();
    this.requestShowcaseOrbits();
    this.applyFrame();
  }

  setQuality(quality: GraphicsQuality): void {
    if (quality === this.quality) return;
    this.quality = quality;
    this.rebuildSignals();
    if (this.snapshot.selectedId) {
      const index = this.indexById.get(this.snapshot.selectedId) ?? -1;
      this.worker?.postMessage({
        index: index >= 0 ? index : null,
        sampleCount: qualityProfiles[this.quality].orbitSampleCount,
        type: "select",
      } satisfies OrbitWorkerRequest);
    }
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    if (this.points) this.points.show = visible;
    if (this.semanticPoints) this.semanticPoints.show = visible;
    if (this.hoverPoints) this.hoverPoints.show = visible;
    if (this.labels) this.labels.show = visible;
    if (this.symbols) this.symbols.show = visible;
    if (this.orbitLines) this.orbitLines.show = visible && this.snapshot.orbitVisible;
    if (this.hoverOrbitLines) this.hoverOrbitLines.show = visible && this.snapshot.orbitVisible;
    if (this.groundTrackPrimitive) {
      this.groundTrackPrimitive.show = visible && this.snapshot.groundTrackVisible;
    }
    if (this.trailLines) this.trailLines.show = visible && this.snapshot.orbitVisible;
    if (this.directionLines) this.directionLines.show = visible && this.snapshot.orbitVisible;
    if (this.showcaseLines) this.showcaseLines.show = visible && this.snapshot.orbitVisible;
    if (this.selectionPoints) this.selectionPoints.show = visible;
    this.context?.requestRender();
  }

  setActive(active: boolean): void {
    this.worker?.postMessage({ active, type: "set-active" } satisfies OrbitWorkerRequest);
    if (active) this.context?.requestRender();
  }

  tick(deltaSeconds: number): void {
    if (!this.snapshot.followSelected || !this.followTarget || !this.context) return;
    if (!this.followPosition) this.followPosition = Cartesian3.clone(this.followTarget);
    const blend = 1 - Math.exp(-Math.max(0, deltaSeconds) * 5.5);
    Cartesian3.lerp(this.followPosition, this.followTarget, blend, this.followPosition);
    const selectedIndex = this.snapshot.selectedId
      ? this.indexById.get(this.snapshot.selectedId)
      : undefined;
    const satellite = selectedIndex === undefined ? undefined : this.catalog[selectedIndex];
    const tangent = this.previousFollowTarget
      ? Cartesian3.subtract(this.followTarget, this.previousFollowTarget, new Cartesian3())
      : Cartesian3.ZERO;
    const heading = Cartesian3.magnitudeSquared(tangent) > 1
      ? Math.atan2(tangent.y, tangent.x)
      : 0;
    this.context.scene.camera.lookAt(
      this.followPosition,
      new HeadingPitchRange(
        heading,
        -0.44,
        satellite?.category === "station" ? 680_000 : 920_000,
      ),
    );
    if (this.context.scene.canvas.clientWidth >= 1_180) {
      this.context.scene.camera.moveRight(
        (satellite?.category === "station" ? 680_000 : 920_000) * 0.16,
      );
    }
  }

  unmount(): void {
    this.clearHover();
    this.stopWorker();
    this.clickHandler?.destroy();
    this.clickHandler = null;
    this.removeGroundTrack();
    if (this.context) {
      const primitives = this.context.scene.primitives;
      for (const primitive of [
        this.points,
        this.semanticPoints,
        this.hoverPoints,
        this.labels,
        this.symbols,
        this.orbitLines,
        this.hoverOrbitLines,
        this.trailLines,
        this.directionLines,
        this.showcaseLines,
        this.selectionPoints,
      ]) {
        if (primitive) primitives.remove(primitive);
      }
    }
    this.cameraChangeListener?.();
    this.cameraChangeListener = null;
    this.context = null;
    this.points = null;
    this.semanticPoints = null;
    this.hoverPoints = null;
    this.labels = null;
    this.symbols = null;
    this.orbitLines = null;
    this.hoverOrbitLines = null;
    this.trailLines = null;
    this.directionLines = null;
    this.showcaseLines = null;
    this.selectionPoints = null;
    this.renderedIndices = [];
    this.renderedPoints = [];
    this.semanticIndices = [];
    this.semanticPrimitives = [];
    this.symbolIndices = [];
    this.symbolLabels = [];
    this.showcaseIndices = [];
    this.listeners.clear();
  }

  private rebuildSignals(): void {
    if (!this.points) return;
    this.points.removeAll();
    const presentation = selectSatellitePresentation(
      this.catalog,
      this.quality,
      ALL_CATEGORIES_VISIBLE,
      null,
    );
    this.renderedIndices = presentation.signalIndices;
    this.renderedPoints = this.renderedIndices.map((catalogIndex) => {
      const satellite = this.catalog[catalogIndex];
      const category = satellite?.category ?? "other";
      return this.points!.add({
        color: CATEGORY_COLORS[category].withAlpha(signalAlpha(category, null)),
        distanceDisplayCondition: new DistanceDisplayCondition(
          0,
          maximumDisplayDistance(category),
        ),
        id: {
          kind: "satellite",
          satelliteId: satellite?.id ?? "",
        } satisfies SatellitePickId,
        outlineWidth: 0,
        pixelSize: signalSize(category),
        position: Cartesian3.ZERO,
        scaleByDistance: new NearFarScalar(450_000, 1.8, 95_000_000, 0.78),
        show: false,
        translucencyByDistance: new NearFarScalar(450_000, 0.92, 95_000_000, 0.3),
      });
    });
    this.points.show = this.visible;
    this.update({
      renderedCount: this.renderedPoints.length,
      signalCount: this.renderedPoints.length,
    });
    this.refreshSemanticPresentation();
    this.updatePresentationStyles();
    if (this.latestPositions && this.latestErrors) this.applyFrame();
    this.updateRenderTelemetry();
  }

  private refreshSemanticPresentation(): void {
    if (!this.semanticPoints || !this.symbols) return;
    const presentation = selectSatellitePresentation(
      this.catalog,
      this.quality,
      this.snapshot.categoryVisibility,
      this.snapshot.focusedCategory,
    );
    this.semanticIndices = presentation.semanticIndices;
    this.showcaseIndices = presentation.contextOrbitIndices.filter(
      (index) => this.catalog[index]?.id !== this.snapshot.selectedId,
    );
    this.semanticPoints.removeAll();
    this.semanticPrimitives = this.semanticIndices.map((catalogIndex) => {
      const satellite = this.catalog[catalogIndex];
      const category = satellite?.category ?? "other";
      return this.semanticPoints!.add({
        color: CATEGORY_COLORS[category].withAlpha(0.88),
        distanceDisplayCondition: new DistanceDisplayCondition(
          0,
          maximumDisplayDistance(category),
        ),
        id: {
          kind: "satellite",
          satelliteId: satellite?.id ?? "",
        } satisfies SatellitePickId,
        outlineColor: Color.WHITE.withAlpha(category === "station" ? 0.72 : 0.48),
        outlineWidth: category === "station" ? 1.8 : 0.5,
        pixelSize: semanticSize(category),
        position: Cartesian3.ZERO,
        scaleByDistance: new NearFarScalar(400_000, 1.35, 95_000_000, 0.72),
        show: false,
        translucencyByDistance: new NearFarScalar(400_000, 1, 95_000_000, 0.48),
      });
    });
    this.rebuildSymbols();
    this.update({ semanticMarkerCount: this.semanticPrimitives.length });
    this.updateRenderTelemetry();
  }

  private rebuildSymbols(): void {
    if (!this.symbols) return;
    this.symbols.removeAll();
    const limit = qualityProfiles[this.quality].labelLimit;
    this.symbolIndices = this.semanticIndices.filter((index) => {
      const category = this.catalog[index]?.category;
      return category === "station" || category === "rocket-body";
    }).slice(0, limit);
    this.symbolLabels = this.symbolIndices.map((catalogIndex) => {
      const satellite = this.catalog[catalogIndex]!;
      const color = CATEGORY_COLORS[satellite.category];
      return this.symbols!.add({
        distanceDisplayCondition: new DistanceDisplayCondition(0, 80_000_000),
        fillColor: Color.WHITE,
        font: satellite.category === "station"
          ? "700 15px 'Segoe UI Symbol', sans-serif"
          : "700 11px 'Segoe UI Symbol', sans-serif",
        id: { kind: "satellite", satelliteId: satellite.id } satisfies SatellitePickId,
        outlineColor: color,
        outlineWidth: 3,
        pixelOffset: new Cartesian2(0, -7),
        position: Cartesian3.ZERO,
        scaleByDistance: new NearFarScalar(500_000, 1.2, 80_000_000, 0.68),
        show: false,
        style: LabelStyle.FILL_AND_OUTLINE,
        text: satellite.category === "station" ? "✦" : "▲",
        translucencyByDistance: new NearFarScalar(500_000, 1, 80_000_000, 0.45),
      });
    });
    this.symbols.show = this.visible;
  }

  private startWorker(): void {
    this.stopWorker();
    if (!this.context || this.catalog.length === 0) return;
    this.update({ status: "loading" });
    const worker = new Worker(
      new URL("../worker/orbit.worker.ts", import.meta.url),
      { name: "orbital-vision-sgp4", type: "module" },
    );
    worker.onmessage = (event: MessageEvent<OrbitWorkerResponse>) => {
      this.handleWorkerMessage(event.data);
    };
    worker.onerror = () => this.update({ status: "error" });
    this.worker = worker;
    worker.postMessage({
      records: this.catalog.map((satellite) => satellite.omm),
      type: "initialize",
    } satisfies OrbitWorkerRequest);
  }

  private stopWorker(): void {
    this.worker?.postMessage({ type: "dispose" } satisfies OrbitWorkerRequest);
    this.worker?.terminate();
    this.worker = null;
  }

  private handleWorkerMessage(message: OrbitWorkerResponse): void {
    if (message.type === "error") {
      this.update({ status: "error" });
      return;
    }
    if (message.type === "ready") {
      this.update({ status: "ready", totalCount: message.count });
      const selectedIndex = this.snapshot.selectedId
        ? this.indexById.get(this.snapshot.selectedId)
        : undefined;
      if (selectedIndex !== undefined) {
        this.worker?.postMessage({
          index: selectedIndex,
          sampleCount: qualityProfiles[this.quality].orbitSampleCount,
          type: "select",
        } satisfies OrbitWorkerRequest);
      }
      this.requestShowcaseOrbits();
      return;
    }
    if (message.type === "showcase-orbits") {
      this.applyShowcaseOrbits(message.orbits);
      return;
    }
    if (message.type === "preview-orbit") {
      this.applyPreviewOrbit(message.index, message.orbitPositionsMeters);
      return;
    }
    if (message.type === "orbit") {
      this.applyOrbit(
        message.index,
        message.orbitPositionsMeters,
        message.groundTrackPositionsMeters,
      );
      return;
    }
    this.latestErrors = message.errors;
    this.latestPositions = message.positionsMeters;
    this.latestTelemetry = message.telemetry;
    this.applyFrame();
    this.update({
      lastUpdatedAt: new Date(message.timestampUnixMs).toISOString(),
      status: "ready",
      validCount: message.validCount,
    });
  }

  private applyFrame(): void {
    if (!this.latestPositions || !this.latestErrors) return;
    for (let index = 0; index < this.renderedIndices.length; index += 1) {
      this.applyPositionToPoint(
        this.renderedIndices[index],
        this.renderedPoints[index],
        true,
      );
    }
    for (let index = 0; index < this.semanticIndices.length; index += 1) {
      this.applyPositionToPoint(
        this.semanticIndices[index],
        this.semanticPrimitives[index],
        true,
      );
    }
    for (let index = 0; index < this.symbolIndices.length; index += 1) {
      const catalogIndex = this.symbolIndices[index];
      const label = this.symbolLabels[index];
      if (catalogIndex === undefined || !label) continue;
      const position = this.updatePosition(catalogIndex, label.position);
      const satellite = this.catalog[catalogIndex];
      label.show = Boolean(
        position && satellite && this.visible &&
        this.snapshot.categoryVisibility[satellite.category] &&
        (this.visualTier !== "global" || satellite.category === "station"),
      );
      if (position) label.position = position;
    }
    this.refreshSelectionVisuals();
    this.refreshHoverVisuals();
    const selected = this.selectedPosition();
    if (selected) {
      this.previousFollowTarget = this.followTarget
        ? Cartesian3.clone(this.followTarget, this.previousFollowTarget ?? new Cartesian3())
        : null;
      this.followTarget = Cartesian3.clone(selected, this.followTarget ?? new Cartesian3());
    }
    this.context?.requestRender();
  }

  private applyPositionToPoint(
    catalogIndex: number | undefined,
    point: PointPrimitive | undefined,
    tierVisible: boolean,
  ): void {
    if (catalogIndex === undefined || !point) return;
    const satellite = this.catalog[catalogIndex];
    const position = this.updatePosition(catalogIndex, point.position);
    point.show = Boolean(
      position && satellite && tierVisible && this.visible &&
      this.snapshot.categoryVisibility[satellite.category],
    );
    if (position) point.position = position;
  }

  private refreshSelectionVisuals(): void {
    const selectedId = this.snapshot.selectedId;
    if (!selectedId || !this.labels || !this.selectionPoints) {
      if (this.selectionVisualId !== null) {
        this.labels?.removeAll();
        this.selectionPoints?.removeAll();
        this.selectionVisualId = null;
        this.selectedCore = null;
        this.selectedRing = null;
        this.selectedLabel = null;
      }
      return;
    }
    const index = this.indexById.get(selectedId) ?? -1;
    const satellite = this.catalog[index];
    const position = index >= 0 ? this.positionForIndex(index) : null;
    if (!satellite || !position) return;
    if (this.selectionVisualId !== selectedId) {
      this.labels.removeAll();
      this.selectionPoints.removeAll();
      const color = CATEGORY_COLORS[satellite.category];
      this.selectedRing = this.selectionPoints.add({
        color: color.withAlpha(0.2),
        id: { kind: "satellite", satelliteId: selectedId } satisfies SatellitePickId,
        pixelSize: satellite.category === "station" ? 30 : 26,
        position,
        scaleByDistance: new NearFarScalar(400_000, 1.25, 90_000_000, 0.86),
      });
      this.selectedCore = this.selectionPoints.add({
        color: Color.WHITE,
        id: { kind: "satellite", satelliteId: selectedId } satisfies SatellitePickId,
        outlineColor: color,
        outlineWidth: 3.5,
        pixelSize: satellite.category === "station" ? 15 : 12,
        position,
        scaleByDistance: new NearFarScalar(400_000, 1.25, 90_000_000, 0.94),
      });
      this.selectedLabel = this.labels.add({
        backgroundColor: Color.fromCssColorString("#07111f").withAlpha(0.9),
        distanceDisplayCondition: new DistanceDisplayCondition(0, 100_000_000),
        fillColor: Color.WHITE,
        font: "600 13px 'Segoe UI Variable', sans-serif",
        horizontalOrigin: HorizontalOrigin.CENTER,
        pixelOffset: new Cartesian2(0, -19),
        position,
        scaleByDistance: new NearFarScalar(1_000_000, 1.12, 80_000_000, 0.72),
        showBackground: true,
        text: satellite.name,
        verticalOrigin: VerticalOrigin.BOTTOM,
      });
      this.selectionVisualId = selectedId;
      this.updateRenderTelemetry();
    }
    if (this.selectedRing) this.selectedRing.position = Cartesian3.clone(position, this.selectedRing.position);
    if (this.selectedCore) this.selectedCore.position = Cartesian3.clone(position, this.selectedCore.position);
    if (this.selectedLabel) this.selectedLabel.position = Cartesian3.clone(position, this.selectedLabel.position);
    this.updateSelectedTelemetry(index);
    this.updateSelectedOcclusion(position);
  }

  private refreshHoverVisuals(): void {
    const hoveredId = this.snapshot.selectedId ? null : this.snapshot.hoveredId;
    if (!this.hoverPoints) return;
    if (!hoveredId) {
      if (this.hoverVisualId !== null) {
        this.hoverPoints.removeAll();
        this.hoverVisualId = null;
      }
      return;
    }
    const index = this.indexById.get(hoveredId) ?? -1;
    const satellite = this.catalog[index];
    const position = index >= 0 ? this.positionForIndex(index) : null;
    if (!satellite || !position) return;
    if (this.hoverVisualId !== hoveredId) {
      this.hoverPoints.removeAll();
      const color = CATEGORY_COLORS[satellite.category];
      this.hoverPoints.add({
        color: color.withAlpha(0.2),
        id: { kind: "satellite", satelliteId: hoveredId } satisfies SatellitePickId,
        pixelSize: 18,
        position,
      });
      this.hoverPoints.add({
        color: Color.WHITE.withAlpha(0.96),
        id: { kind: "satellite", satelliteId: hoveredId } satisfies SatellitePickId,
        outlineColor: color,
        outlineWidth: 2.5,
        pixelSize: 8,
        position,
      });
      this.hoverVisualId = hoveredId;
    } else {
      for (let pointIndex = 0; pointIndex < this.hoverPoints.length; pointIndex += 1) {
        const point = this.hoverPoints.get(pointIndex);
        point.position = Cartesian3.clone(position, point.position);
      }
    }
  }

  private handleCameraChange = (): void => {
    if (!this.context) return;
    const nextTier = resolveVisualTier(
      Cartesian3.magnitude(this.context.scene.camera.positionWC),
      this.visualTier,
    );
    if (nextTier !== this.visualTier) {
      this.visualTier = nextTier;
      this.updatePresentationStyles();
      this.applyFrame();
    }
    const selected = this.selectedPosition();
    if (selected) this.updateSelectedOcclusion(selected);
    this.context.requestRender();
  };

  private updatePresentationStyles(): void {
    const focused = this.snapshot.focusedCategory;
    for (let index = 0; index < this.renderedIndices.length; index += 1) {
      const satellite = this.catalog[this.renderedIndices[index] ?? -1];
      const point = this.renderedPoints[index];
      if (!satellite || !point) continue;
      point.color = CATEGORY_COLORS[satellite.category].withAlpha(
        signalAlpha(satellite.category, focused),
      );
      point.pixelSize = signalSize(satellite.category);
      point.show = this.visible && this.snapshot.categoryVisibility[satellite.category];
    }
    for (let index = 0; index < this.semanticIndices.length; index += 1) {
      const satellite = this.catalog[this.semanticIndices[index] ?? -1];
      const point = this.semanticPrimitives[index];
      if (!satellite || !point) continue;
      point.show = this.visible && this.snapshot.categoryVisibility[satellite.category];
    }
    this.context?.requestRender();
    this.updateRenderTelemetry();
  }

  private updateSelectedTelemetry(index: number): void {
    const telemetry = this.telemetryForIndex(index);
    if (telemetry !== this.snapshot.selectedTelemetry) {
      this.update({ selectedTelemetry: telemetry });
    }
  }

  private updateSelectedOcclusion(position: Cartesian3): void {
    if (!this.context) return;
    const occluder = new Occluder(
      new BoundingSphere(Cartesian3.ZERO, Ellipsoid.WGS84.maximumRadius),
      this.context.scene.camera.positionWC,
    );
    const selectedOccluded = !occluder.isPointVisible(position);
    if (selectedOccluded !== this.snapshot.selectedOccluded) {
      this.update({ selectedOccluded });
    }
  }

  private applyOrbit(
    index: number,
    orbitCoordinates: Float64Array,
    groundTrackCoordinates: Float64Array,
  ): void {
    const selectedId = this.snapshot.selectedId;
    if (!selectedId || this.catalog[index]?.id !== selectedId || !this.orbitLines) return;
    const positions = cartesianPositions(orbitCoordinates);
    const groundPositions = cartesianPositions(groundTrackCoordinates);
    this.orbitLines.removeAll();
    this.trailLines?.removeAll();
    this.directionLines?.removeAll();
    this.removeGroundTrack();
    if (positions.length > 1) {
      const satellite = this.catalog[index];
      const color = CATEGORY_COLORS[satellite?.category ?? "other"];
      this.orbitLines.add({
        material: Material.fromType("Color", { color: color.withAlpha(0.74) }),
        positions,
        width: 1.55,
      });
      const center = Math.floor(positions.length / 2);
      const trailPositions = positions.slice(Math.max(0, center - 24), center + 1);
      if (trailPositions.length > 1 && this.trailLines) {
        this.trailLines.add({
          material: Material.fromType("Color", { color: color.withAlpha(0.46) }),
          positions: trailPositions,
          width: 2.15,
        });
      }
      const directionPositions = positions.slice(center, Math.min(positions.length, center + 6));
      if (directionPositions.length > 1 && this.directionLines) {
        this.directionLines.add({
          material: Material.fromType("PolylineArrow", {
            color: Color.WHITE.withAlpha(0.74),
          }),
          positions: directionPositions,
          width: 4.2,
        });
      }
      if (groundPositions.length > 1) this.createGroundTrack(groundPositions);
    }
    this.orbitLines.show = this.visible && this.snapshot.orbitVisible;
    if (this.trailLines) this.trailLines.show = this.visible && this.snapshot.orbitVisible;
    if (this.directionLines) this.directionLines.show = this.visible && this.snapshot.orbitVisible;
    this.context?.requestRender();
  }

  private createGroundTrack(positions: Cartesian3[]): void {
    if (!this.context) return;
    this.groundTrackPrimitive = new GroundPolylinePrimitive({
      allowPicking: false,
      appearance: new PolylineMaterialAppearance({
        material: Material.fromType("PolylineDash", {
          color: Color.fromCssColorString("#7ce7ff").withAlpha(0.5),
          dashLength: 20,
        }),
      }),
      geometryInstances: new GeometryInstance({
        geometry: new GroundPolylineGeometry({
          granularity: 20_000,
          positions,
          width: 1.2,
        }),
      }),
      show: this.visible && this.snapshot.groundTrackVisible,
    });
    this.context.scene.groundPrimitives.add(this.groundTrackPrimitive);
  }

  private removeGroundTrack(): void {
    if (this.context && this.groundTrackPrimitive) {
      this.context.scene.groundPrimitives.remove(this.groundTrackPrimitive);
    }
    this.groundTrackPrimitive = null;
  }

  private clearSelectedGeometry(): void {
    this.orbitLines?.removeAll();
    this.trailLines?.removeAll();
    this.directionLines?.removeAll();
    this.removeGroundTrack();
  }

  private requestShowcaseOrbits(): void {
    if (!this.worker) return;
    if (this.showcaseIndices.length === 0 || !this.snapshot.orbitVisible) {
      this.showcaseLines?.removeAll();
      this.update({ showcaseOrbitCount: 0 });
      return;
    }
    this.worker.postMessage({
      indices: this.showcaseIndices,
      sampleCount: qualityProfiles[this.quality].orbitSampleCount,
      type: "showcase",
    } satisfies OrbitWorkerRequest);
  }

  private applyShowcaseOrbits(
    orbits: Array<{
      index: number;
      orbitPositionsMeters: Float64Array;
      referenceTimestampUnixMs: number;
    }>,
  ): void {
    if (!this.showcaseLines) return;
    this.showcaseLines.removeAll();
    let rendered = 0;
    for (const orbit of orbits) {
      const satellite = this.catalog[orbit.index];
      if (!satellite || !this.snapshot.categoryVisibility[satellite.category]) continue;
      const positions = cartesianPositions(orbit.orbitPositionsMeters);
      if (positions.length < 2) continue;
      const color = CATEGORY_COLORS[satellite.category];
      this.showcaseLines.add({
        material: Material.fromType("Color", {
          color: color.withAlpha(satellite.category === "station" ? 0.3 : 0.15),
        }),
        positions,
        width: satellite.category === "station" ? 1.05 : 0.72,
      });
      rendered += 1;
    }
    this.showcaseLines.show = this.visible && this.snapshot.orbitVisible;
    this.update({ showcaseOrbitCount: rendered });
    this.updateRenderTelemetry();
    this.context?.requestRender();
  }

  private applyPreviewOrbit(index: number, coordinates: Float64Array): void {
    const hoveredId = this.snapshot.hoveredId;
    const satellite = this.catalog[index];
    if (!hoveredId || satellite?.id !== hoveredId || this.snapshot.selectedId || !this.hoverOrbitLines) {
      return;
    }
    const positions = cartesianPositions(coordinates);
    this.hoverOrbitLines.removeAll();
    if (positions.length > 1) {
      this.hoverOrbitLines.add({
        material: Material.fromType("Color", {
          color: CATEGORY_COLORS[satellite.category].withAlpha(0.3),
        }),
        positions,
        width: 1.05,
      });
    }
    this.hoverOrbitLines.show = this.visible && this.snapshot.orbitVisible;
    this.context?.requestRender();
  }

  private handlePick(position: Cartesian2): void {
    const picked = this.context?.scene.pick(position) as { id?: unknown } | undefined;
    const pickedId = picked?.id;
    if (!isSatellitePickId(pickedId)) return;
    this.selectSatellite(pickedId.satelliteId);
    this.focusSelected();
  }

  private handleHover(position: Cartesian2): void {
    const now = performance.now();
    if (now - this.lastHoverAt < 48) return;
    this.lastHoverAt = now;
    const picked = this.context?.scene.pick(position) as { id?: unknown } | undefined;
    const pickedId = picked?.id;
    if (!isSatellitePickId(pickedId)) {
      if (this.snapshot.hoveredId !== null) this.clearHover();
      return;
    }
    const index = this.indexById.get(pickedId.satelliteId) ?? -1;
    const hoverChanged = this.snapshot.hoveredId !== pickedId.satelliteId;
    this.update({
      hoverScreenPosition: { x: position.x, y: position.y },
      hoveredId: pickedId.satelliteId,
      hoveredTelemetry: index >= 0 ? this.telemetryForIndex(index) : null,
    });
    this.refreshHoverVisuals();
    if (hoverChanged && index >= 0) this.scheduleHoverOrbit(index);
  }

  private scheduleHoverOrbit(index: number): void {
    this.clearHoverOrbit();
    if (this.snapshot.selectedId !== null || !this.snapshot.orbitVisible) return;
    this.hoverOrbitTimer = setTimeout(() => {
      this.hoverOrbitTimer = null;
      this.worker?.postMessage({ index, type: "preview" } satisfies OrbitWorkerRequest);
    }, 120);
  }

  private clearHover(): void {
    this.clearHoverOrbit();
    this.hoverPoints?.removeAll();
    this.hoverVisualId = null;
    if (this.snapshot.hoveredId !== null) {
      this.update({
        hoverScreenPosition: null,
        hoveredId: null,
        hoveredTelemetry: null,
      });
    }
  }

  private clearHoverOrbit(): void {
    if (this.hoverOrbitTimer !== null) {
      clearTimeout(this.hoverOrbitTimer);
      this.hoverOrbitTimer = null;
    }
    this.hoverOrbitLines?.removeAll();
    this.context?.requestRender();
  }

  private selectedPosition(): Cartesian3 | null {
    const selectedId = this.snapshot.selectedId;
    if (!selectedId) return null;
    const index = this.indexById.get(selectedId) ?? -1;
    return index >= 0 ? this.positionForIndex(index) : null;
  }

  private positionForIndex(index: number): Cartesian3 | null {
    if (!this.latestPositions || this.latestErrors?.[index] !== 0) return null;
    const offset = index * 3;
    const x = this.latestPositions[offset];
    const y = this.latestPositions[offset + 1];
    const z = this.latestPositions[offset + 2];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
    return Cartesian3.fromElements(x!, y!, z!);
  }

  private updatePosition(index: number, destination: Cartesian3): Cartesian3 | null {
    if (!this.latestPositions || this.latestErrors?.[index] !== 0) return null;
    const offset = index * 3;
    const x = this.latestPositions[offset];
    const y = this.latestPositions[offset + 1];
    const z = this.latestPositions[offset + 2];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
    return Cartesian3.fromElements(x!, y!, z!, destination);
  }

  private telemetryForIndex(index: number): SatelliteTelemetry | null {
    if (!this.latestTelemetry) return null;
    const cartesian = this.positionForIndex(index);
    if (!cartesian) return null;
    const telemetryOffset = index * 2;
    const cartographic = this.context?.scene.globe.ellipsoid.cartesianToCartographic(cartesian);
    return {
      altitudeKm: this.latestTelemetry[telemetryOffset] ?? Number.NaN,
      latitudeDegrees: cartographic ? cartographic.latitude * (180 / Math.PI) : null,
      longitudeDegrees: cartographic ? cartographic.longitude * (180 / Math.PI) : null,
      timestampIso: this.snapshot.lastUpdatedAt ?? new Date().toISOString(),
      velocityKmPerSecond: this.latestTelemetry[telemetryOffset + 1] ?? Number.NaN,
    };
  }

  private update(patch: Partial<SatelliteLayerSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }

  private updateRenderTelemetry(): void {
    const primitiveCount =
      (this.points?.length ?? 0) +
      (this.semanticPoints?.length ?? 0) +
      (this.symbols?.length ?? 0) +
      (this.hoverPoints?.length ?? 0) +
      (this.selectionPoints?.length ?? 0) +
      (this.labels?.length ?? 0) +
      (this.orbitLines?.length ?? 0) +
      (this.hoverOrbitLines?.length ?? 0) +
      (this.trailLines?.length ?? 0) +
      (this.directionLines?.length ?? 0) +
      (this.showcaseLines?.length ?? 0) +
      (this.groundTrackPrimitive ? 1 : 0);
    if (primitiveCount !== this.snapshot.primitiveCount) {
      this.update({ primitiveCount });
    }
  }
}

function cartesianPositions(coordinates: Float64Array): Cartesian3[] {
  const positions: Cartesian3[] = [];
  for (let offset = 0; offset < coordinates.length; offset += 3) {
    const x = coordinates[offset];
    const y = coordinates[offset + 1];
    const z = coordinates[offset + 2];
    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
      positions.push(Cartesian3.fromElements(x!, y!, z!));
    }
  }
  return positions;
}

function isSatellitePickId(value: unknown): value is SatellitePickId {
  return typeof value === "object" && value !== null &&
    "kind" in value && value.kind === "satellite" &&
    "satelliteId" in value && typeof value.satelliteId === "string";
}

function signalSize(category: SatelliteCategory): number {
  if (category === "station") return 2.1;
  if (category === "navigation" || category === "weather" || category === "science") return 1.7;
  if (category === "rocket-body") return 1.45;
  if (category === "debris") return 1;
  if (category === "starlink" || category === "other") return 1.18;
  return 1.35;
}

function semanticSize(category: SatelliteCategory): number {
  if (category === "station") return 6;
  if (category === "navigation" || category === "weather" || category === "science") return 4.4;
  if (category === "rocket-body") return 4.8;
  if (category === "debris") return 2.8;
  return 3.5;
}

function signalAlpha(
  category: SatelliteCategory,
  focusedCategory: SatelliteCategory | null,
): number {
  if (focusedCategory) return category === focusedCategory ? 0.78 : 0.12;
  if (category === "station") return 0.84;
  if (category === "debris") return 0.38;
  if (category === "starlink" || category === "other") return 0.42;
  return 0.58;
}

function maximumDisplayDistance(category: SatelliteCategory): number {
  if (category === "station" || category === "rocket-body") return 220_000_000;
  if (category === "navigation" || category === "weather" || category === "science") {
    return 150_000_000;
  }
  if (category === "debris") return 58_000_000;
  return 105_000_000;
}
