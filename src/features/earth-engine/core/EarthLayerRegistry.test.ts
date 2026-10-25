import { describe, expect, it, vi } from "vitest";

import type { EarthEngineLayer, EarthLayerContext } from "../contracts/layers";
import { EarthLayerRegistry } from "./EarthLayerRegistry";

function createLayer(id: string, slot: EarthEngineLayer["slot"] = "satellite") {
  return {
    id,
    mount: vi.fn(),
    setQuality: vi.fn(),
    setVisible: vi.fn(),
    slot,
    tick: vi.fn(),
    unmount: vi.fn(),
  } satisfies EarthEngineLayer;
}

describe("EarthLayerRegistry", () => {
  it("suspends Earth layers for celestial views and restores each user's visibility", async () => {
    const registry = new EarthLayerRegistry({ requestRender: vi.fn() } as unknown as EarthLayerContext);
    const satellites = { ...createLayer("satellites"), setActive: vi.fn() };
    const launches = { ...createLayer("launches", "launch"), setActive: vi.fn() };
    await registry.register(satellites);
    await registry.register(launches);
    await registry.mount();
    registry.setSlotVisible("launch", false);
    registry.setSceneVisible(false);
    registry.tick(0.016);
    expect(satellites.setActive).toHaveBeenLastCalledWith(false);
    expect(satellites.tick).not.toHaveBeenCalled();
    registry.setActive(false);
    registry.setSceneVisible(true);
    expect(satellites.setActive).toHaveBeenLastCalledWith(false);
    expect(satellites.setVisible).toHaveBeenLastCalledWith(true);
    expect(launches.setVisible).toHaveBeenLastCalledWith(false);
    registry.setActive(true);
    registry.tick(0.016);
    expect(satellites.tick).toHaveBeenCalledOnce();
    registry.dispose();
  });
  it("mounts registered layers and releases them deterministically", async () => {
    const context = {
      requestRender: vi.fn(),
    } as unknown as EarthLayerContext;
    const layer = createLayer("future-satellites");
    const registry = new EarthLayerRegistry(context);

    await registry.register(layer);
    await registry.mount();
    registry.tick(0.016);
    registry.dispose();

    expect(layer.mount).toHaveBeenCalledOnce();
    expect(layer.tick).toHaveBeenCalledWith(0.016);
    expect(layer.unmount).toHaveBeenCalledOnce();
  });

  it("controls a future layer slot without coupling to its implementation", async () => {
    const context = {
      requestRender: vi.fn(),
    } as unknown as EarthLayerContext;
    const satelliteLayer = createLayer("satellites", "satellite");
    const weatherLayer = createLayer("weather", "weather");
    const registry = new EarthLayerRegistry(context);

    await registry.register(satelliteLayer);
    await registry.register(weatherLayer);
    registry.setSlotVisible("satellite", false);

    expect(satelliteLayer.setVisible).toHaveBeenCalledWith(false);
    expect(weatherLayer.setVisible).not.toHaveBeenCalled();
    expect(context.requestRender).toHaveBeenCalledOnce();
  });
});
