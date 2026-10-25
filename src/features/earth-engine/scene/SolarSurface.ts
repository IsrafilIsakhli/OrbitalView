import { Cartesian3, EllipsoidGeometry, EllipsoidSurfaceAppearance, GeometryInstance, Material, Matrix3, Matrix4, Primitive, Simon1994PlanetaryPositions, Transforms, type JulianDate, type Scene } from "cesium";
import { celestialRadii } from "../camera/CelestialCameraFrame";

/** Illustrative photosphere at the real ephemeris position; not solar telemetry. */
export class SolarSurface {
  private readonly primitive: Primitive;
  private readonly material: Material;
  private readonly position = new Cartesian3();
  private readonly rotation = new Matrix3();
  private readonly transform = new Matrix4();

  constructor(private readonly scene: Scene) {
    this.material = new Material({ fabric: {
      type: "OrbitalSolarPhotosphere",
      source: `
        float granulation(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = fract(sin(dot(i, vec2(127.1,311.7))) * 43758.5453);
          float b = fract(sin(dot(i + vec2(1.0,0.0), vec2(127.1,311.7))) * 43758.5453);
          float c = fract(sin(dot(i + vec2(0.0,1.0), vec2(127.1,311.7))) * 43758.5453);
          float d = fract(sin(dot(i + vec2(1.0,1.0), vec2(127.1,311.7))) * 43758.5453);
          return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
        }
        czm_material czm_getMaterial(czm_materialInput inputMaterial) {
          czm_material m = czm_getDefaultMaterial(inputMaterial);
          float mu = max(0.0, dot(normalize(inputMaterial.normalEC), normalize(inputMaterial.positionToEyeEC)));
          float grains = granulation(inputMaterial.st * vec2(520.0,260.0));
          float cells = granulation(inputMaterial.st * vec2(90.0,45.0));
          vec3 color = mix(vec3(0.96,0.40,0.065), vec3(1.0,0.88,0.48), 0.52 + 0.3 * cells);
          m.diffuse = vec3(0.0);
          m.emission = color * (0.48 + 0.52 * pow(mu,0.4)) * (0.86 + 0.14 * grains);
          m.alpha = 1.0;
          return m;
        }
      `,
    }, translucent: false });
    this.primitive = new Primitive({
      allowPicking: false, asynchronous: false, show: false,
      geometryInstances: new GeometryInstance({ geometry: new EllipsoidGeometry({
        radii: new Cartesian3(celestialRadii.sun, celestialRadii.sun, celestialRadii.sun),
        slicePartitions: 96, stackPartitions: 48, vertexFormat: EllipsoidSurfaceAppearance.VERTEX_FORMAT,
      }) }),
      appearance: new EllipsoidSurfaceAppearance({ material: this.material, aboveGround: true, translucent: false, flat: true }),
    });
    scene.primitives.add(this.primitive);
  }

  setVisible(visible: boolean): void { this.primitive.show = visible; }

  tick(time: JulianDate): void {
    if (!this.primitive.show) return;
    Simon1994PlanetaryPositions.computeSunPositionInEarthInertialFrame(time, this.position);
    const rotation = Transforms.computeIcrfToFixedMatrix(time, this.rotation)
      ?? Transforms.computeTemeToPseudoFixedMatrix(time, this.rotation);
    Matrix3.multiplyByVector(rotation, this.position, this.position);
    Matrix4.fromRotationTranslation(rotation, this.position, this.transform);
    this.primitive.modelMatrix = this.transform;
  }

  dispose(): void {
    this.scene.primitives.remove(this.primitive);
    if (!this.material.isDestroyed()) this.material.destroy();
  }
}
