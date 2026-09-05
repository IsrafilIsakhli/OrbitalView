import { Camera, Cartesian3, Ellipsoid, GeographicProjection, HeadingPitchRange, Matrix4, type Scene } from "cesium";
import { describe, expect, it } from "vitest";
import { FollowCameraFrame } from "./FollowCameraFrame";

function setup() {
  const scene = {
    canvas: {clientWidth:1440,clientHeight:900}, drawingBufferWidth:1440, drawingBufferHeight:900,
    mapProjection: new GeographicProjection(), ellipsoid: Ellipsoid.WGS84,
  } as unknown as Scene;
  const camera = new Camera(scene);
  const target = Cartesian3.fromDegrees(30,40,420_000);
  camera.lookAt(target, new HeadingPitchRange(0.2,-0.5,800_000));
  camera.lookAtTransform(Matrix4.IDENTITY);
  return {camera,target,frame:new FollowCameraFrame()};
}

describe("Follow camera reference frame", () => {
  it("binds without a visible camera jump", () => {
    const {camera,target,frame}=setup();
    const position=Cartesian3.clone(camera.positionWC), direction=Cartesian3.clone(camera.directionWC);
    frame.begin(camera,target);
    expect(Cartesian3.distance(camera.positionWC,position)).toBeLessThan(1e-7);
    expect(Cartesian3.distance(camera.directionWC,direction)).toBeLessThan(1e-10);
  });
  it("preserves wheel zoom and drag orientation over many target updates", () => {
    const {camera,target,frame}=setup();
    frame.begin(camera,target);
    camera.zoomIn(250_000);
    camera.rotateRight(0.25);
    const position=Cartesian3.clone(camera.position), direction=Cartesian3.clone(camera.direction);
    for(let step=1;step<=240;step++) frame.update(camera,Cartesian3.fromDegrees(30+step/1000,40+step/2000,420_000));
    expect(Cartesian3.distance(camera.position,position)).toBeLessThan(1e-7);
    expect(Cartesian3.distance(camera.direction,direction)).toBeLessThan(1e-10);
    expect(Math.abs(Cartesian3.dot(camera.direction,camera.up))).toBeLessThan(1e-10);
  });
  it("unbinds without jumping and can bind a different real target", () => {
    const {camera,target,frame}=setup();
    frame.begin(camera,target);
    const position=Cartesian3.clone(camera.positionWC);
    frame.clear(); camera.lookAtTransform(Matrix4.IDENTITY);
    expect(Cartesian3.distance(camera.positionWC,position)).toBeLessThan(1e-7);
    frame.begin(camera,Cartesian3.fromDegrees(-75,20,550_000));
    expect(Cartesian3.distance(camera.positionWC,position)).toBeLessThan(1e-7);
  });
  it("cannot orbit the tracked camera through Earth or known terrain", () => {
    const {camera,target,frame}=setup();
    const unchangedTarget=Cartesian3.clone(target);
    frame.begin(camera,target);
    Cartesian3.clone(new Cartesian3(0,0,-600_000),camera.position);
    frame.update(camera,target,9_000);
    expect(camera.positionCartographic.height).toBeGreaterThan(8_999.999);
    expect(target).toEqual(unchangedTarget);
  });
});
