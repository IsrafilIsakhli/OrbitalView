import { ArcGISTiledElevationTerrainProvider, EllipsoidTerrainProvider, Event, type CesiumWidget, type ImageryLayer } from "cesium";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SurfaceProviderCoordinator } from "./SurfaceProviderCoordinator";

afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();});

async function setup() {
  vi.useFakeTimers();
  const terrain = new EllipsoidTerrainProvider();
  vi.spyOn(ArcGISTiledElevationTerrainProvider,"fromUrl").mockResolvedValue(terrain);
  const camera={moveStart:new Event(),moveEnd:new Event(),changed:new Event(),positionCartographic:{height:20_000_000,latitude:0}};
  const widget={camera,terrainProvider:new EllipsoidTerrainProvider(),scene:{requestRender:vi.fn(),globe:{showWaterEffect:false}},imageryLayers:{contains:()=>false}};
  const coordinator=new SurfaceProviderCoordinator(widget as unknown as CesiumWidget,vi.fn(),{show:true} as ImageryLayer);
  await (coordinator as unknown as {loadTerrain:()=>Promise<void>}).loadTerrain();
  return {camera,widget,terrain,coordinator};
}

describe("Terrain handoff after navigation settles",()=>{
  it("does not invalidate the terrain quadtree during zoom or a focus flight",async()=>{
    const {camera,widget,terrain,coordinator}=await setup();
    const initial=widget.terrainProvider;
    camera.moveStart.raiseEvent();camera.positionCartographic.height=100_000;
    camera.changed.raiseEvent();vi.advanceTimersByTime(5000);
    expect(widget.terrainProvider).toBe(initial);
    camera.moveEnd.raiseEvent();vi.advanceTimersByTime(399);
    expect(widget.terrainProvider).toBe(initial);
    vi.advanceTimersByTime(1);expect(widget.terrainProvider).toBe(terrain);
    camera.moveStart.raiseEvent();camera.positionCartographic.height=40_000_000;
    camera.moveEnd.raiseEvent();vi.advanceTimersByTime(400);
    expect(widget.terrainProvider).toBe(terrain);
    coordinator.dispose();
  });
  it("coalesces settle events and cancels a pending handoff on renewed input or dispose",async()=>{
    const {camera,widget,coordinator}=await setup();
    const initial=widget.terrainProvider;
    camera.positionCartographic.height=100_000;
    camera.moveEnd.raiseEvent();vi.advanceTimersByTime(200);camera.moveEnd.raiseEvent();
    vi.advanceTimersByTime(250);expect(widget.terrainProvider).toBe(initial);
    camera.moveStart.raiseEvent();vi.advanceTimersByTime(1000);expect(widget.terrainProvider).toBe(initial);
    camera.moveEnd.raiseEvent();coordinator.dispose();vi.advanceTimersByTime(1000);
    expect(widget.terrainProvider).toBe(initial);
    expect(camera.moveEnd.numberOfListeners).toBe(0);expect(camera.moveStart.numberOfListeners).toBe(0);
  });
});
