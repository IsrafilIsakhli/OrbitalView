import type {
  EarthEngineLayer,
  EarthLayerContext,
  EarthLayerSlot,
} from "../contracts/layers";

export class EarthLayerRegistry {
  private readonly layers = new Map<string, EarthEngineLayer>();
  private mounted = false;
  private active = true;
  private sceneVisible = true;
  private readonly slotVisibility = new Map<EarthLayerSlot, boolean>();
  private quality: Parameters<NonNullable<EarthEngineLayer["setQuality"]>>[0] = "balanced";

  constructor(private readonly context: EarthLayerContext) {}

  async mount(): Promise<void> {
    if (this.mounted) {
      return;
    }

    this.mounted = true;
    for (const layer of this.layers.values()) {
      await layer.mount(this.context);
    }
  }

  async register(layer: EarthEngineLayer): Promise<() => void> {
    if (this.layers.has(layer.id)) {
      throw new Error(`Earth layer already registered: ${layer.id}`);
    }

    this.layers.set(layer.id, layer);
    layer.setActive?.(this.active && this.sceneVisible);
    layer.setQuality?.(this.quality);
    if (this.mounted) {
      await layer.mount(this.context);
    }
    if (!this.sceneVisible || this.slotVisibility.has(layer.slot)) {
      layer.setVisible(this.sceneVisible && (this.slotVisibility.get(layer.slot) ?? true));
    }

    return () => this.unregister(layer.id);
  }

  setSlotVisible(slot: EarthLayerSlot, visible: boolean): void {
    this.slotVisibility.set(slot, visible);
    for (const layer of this.layers.values()) {
      if (layer.slot === slot) {
        layer.setVisible(visible && this.sceneVisible);
      }
    }
    this.context.requestRender();
  }

  setActive(active: boolean): void {
    this.active = active;
    for (const layer of this.layers.values()) layer.setActive?.(active && this.sceneVisible);
    if (active) this.context.requestRender();
  }

  setSceneVisible(visible: boolean): void {
    this.sceneVisible = visible;
    for (const layer of this.layers.values()) {
      layer.setVisible(visible && (this.slotVisibility.get(layer.slot) ?? true));
      layer.setActive?.(visible && this.active);
    }
    this.context.requestRender();
  }

  setQuality(quality: Parameters<NonNullable<EarthEngineLayer["setQuality"]>>[0]): void {
    this.quality = quality;
    for (const layer of this.layers.values()) {
      layer.setQuality?.(quality);
    }
    this.context.requestRender();
  }

  tick(deltaSeconds: number): void {
    if (!this.active || !this.sceneVisible) return;
    for (const layer of this.layers.values()) {
      layer.tick?.(deltaSeconds);
    }
  }

  unregister(id: string): void {
    const layer = this.layers.get(id);
    if (!layer) {
      return;
    }

    if (this.mounted) {
      layer.unmount();
    }
    this.layers.delete(id);
  }

  dispose(): void {
    if (this.mounted) {
      for (const layer of this.layers.values()) {
        layer.unmount();
      }
    }
    this.layers.clear();
    this.mounted = false;
  }
}
