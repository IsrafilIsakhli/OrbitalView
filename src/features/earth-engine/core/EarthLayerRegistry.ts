import type {
  EarthEngineLayer,
  EarthLayerContext,
  EarthLayerSlot,
} from "../contracts/layers";

export class EarthLayerRegistry {
  private readonly layers = new Map<string, EarthEngineLayer>();
  private mounted = false;
  private active = true;
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
    layer.setActive?.(this.active);
    layer.setQuality?.(this.quality);
    if (this.mounted) {
      await layer.mount(this.context);
    }

    return () => this.unregister(layer.id);
  }

  setSlotVisible(slot: EarthLayerSlot, visible: boolean): void {
    for (const layer of this.layers.values()) {
      if (layer.slot === slot) {
        layer.setVisible(visible);
      }
    }
    this.context.requestRender();
  }

  setActive(active: boolean): void {
    this.active = active;
    for (const layer of this.layers.values()) layer.setActive?.(active);
    if (active) this.context.requestRender();
  }

  setQuality(quality: Parameters<NonNullable<EarthEngineLayer["setQuality"]>>[0]): void {
    this.quality = quality;
    for (const layer of this.layers.values()) {
      layer.setQuality?.(quality);
    }
    this.context.requestRender();
  }

  tick(deltaSeconds: number): void {
    if (!this.active) return;
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
