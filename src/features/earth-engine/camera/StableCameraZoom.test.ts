import { Camera, CameraEventType, Cartesian3, Ellipsoid, GeographicProjection, HeadingPitchRange, Matrix4, type Scene } from "cesium";
import { describe, expect, it, vi } from "vitest";
import { StableCameraZoom, wheelZoomImpulse } from "./StableCameraZoom";

function setup(tracked = false) {
  const canvas = document.createElement("canvas");
  Object.defineProperties(canvas, { clientWidth:{value:1440},clientHeight:{value:900} });
  const scene = {
    canvas, drawingBufferWidth:1440,drawingBufferHeight:900,
    mapProjection:new GeographicProjection(),ellipsoid:Ellipsoid.WGS84,
    screenSpaceCameraController:{enableInputs:true,zoomEventTypes:[]},requestRender:vi.fn(),
    globe:{getHeight:()=>0},
  } as unknown as Scene;
  const camera = new Camera(scene);
  if (tracked) camera.lookAt(Cartesian3.fromDegrees(30,40,420_000),new HeadingPitchRange(0,-0.8,900_000));
  else camera.setView({destination:Cartesian3.fromDegrees(30,40,20_000_000),orientation:{heading:0,pitch:-Math.PI/2,roll:0}});
  const zoom = new StableCameraZoom(scene,camera,canvas);
  const settle = () => { for(let i=0;i<100;i++)zoom.tick(1/60); };
  return {camera,canvas,scene,zoom,settle};
}

describe("Bounded Earth zoom",()=>{
  it("normalizes wheel units and caps both directions symmetrically",()=>{
    expect(wheelZoomImpulse(1,1,900)).toBe(wheelZoomImpulse(16,0,900));
    for(const delta of [120,1200,1e9])expect(wheelZoomImpulse(delta,0,900)).toBe(-wheelZoomImpulse(-delta,0,900));
    expect(wheelZoomImpulse(1,2,900)).toBe(0.65);
    expect(wheelZoomImpulse(NaN,0,900)).toBe(0);
  });
  it("never approaches solar distances on Earth, and can reverse immediately at the limit",()=>{
    const {camera,zoom,settle}=setup();
    for(let i=0;i<45;i++){zoom.zoom("out");settle();}
    expect(camera.positionCartographic.height).toBeLessThanOrEqual(100_000_000.01);
    const far=camera.positionCartographic.height;
    zoom.zoom("in");settle();expect(camera.positionCartographic.height).toBeLessThan(far);
    for(let i=0;i<50;i++){zoom.zoom("in");settle();}
    expect(camera.positionCartographic.height).toBeGreaterThanOrEqual(899.99);
    zoom.zoom("out");settle();expect(camera.positionCartographic.height).toBeGreaterThan(900);
    zoom.dispose();
  });
  it("preserves tracked target framing without crossing through its origin",()=>{
    const {camera,zoom,settle}=setup(true);
    const direction=Cartesian3.clone(camera.direction),transform=Matrix4.clone(camera.transform);
    for(let i=0;i<50;i++){zoom.zoom("in");settle();}
    expect(Cartesian3.magnitude(camera.position)).toBeGreaterThanOrEqual(899.99);
    for(let i=0;i<55;i++){zoom.zoom("out");settle();}
    expect(Cartesian3.magnitude(camera.position)).toBeLessThanOrEqual(100_000_000.01);
    expect(camera.direction).toEqual(direction);expect(camera.transform).toEqual(transform);
    zoom.dispose();
  });
  it("bounds the step after a stalled frame and cancels the old direction",()=>{
    const {camera,zoom}=setup();
    zoom.zoom("in");zoom.tick(10);
    expect(camera.positionCartographic.height).toBeGreaterThan(10_000_000);
    const height=camera.positionCartographic.height;
    zoom.zoom("out");zoom.tick(1/60);
    expect(camera.positionCartographic.height).toBeGreaterThan(height);
    zoom.cancel();const position=Cartesian3.clone(camera.position);zoom.tick(1);
    expect(camera.position).toEqual(position);zoom.dispose();
  });
  it("does not leave wheel handlers or a pending zoom after disposal",()=>{
    const {canvas,zoom,scene}=setup();
    canvas.dispatchEvent(new WheelEvent("wheel",{deltaY:120,cancelable:true}));
    expect(zoom.moving).toBe(true);zoom.dispose();
    canvas.dispatchEvent(new WheelEvent("wheel",{deltaY:120}));
    expect(zoom.moving).toBe(false);
    expect(scene.screenSpaceCameraController.zoomEventTypes).not.toContain(CameraEventType.WHEEL);
  });
  it("leaves celestial presets with native wheel and pinch controls",()=>{
    const {scene,zoom}=setup();zoom.setEnabled(false);zoom.zoom("in");
    expect(zoom.moving).toBe(false);
    expect(scene.screenSpaceCameraController.zoomEventTypes).toContain(CameraEventType.WHEEL);
    expect(scene.screenSpaceCameraController.zoomEventTypes).toContain(CameraEventType.PINCH);
    zoom.dispose();
  });
});
