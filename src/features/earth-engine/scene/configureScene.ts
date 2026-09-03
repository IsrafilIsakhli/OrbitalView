import { Color, SunLight, type CesiumWidget } from "cesium";

const NASA_LROC_MOON_TEXTURE = "/assets/celestial/nasa-lroc-moon-2k.jpg";

export function configureScene(widget: CesiumWidget): void {
  const { scene } = widget;
  const { globe } = scene;

  scene.backgroundColor = Color.fromCssColorString("#01050d");
  scene.highDynamicRange = scene.highDynamicRangeSupported;
  scene.gamma = 1.01;
  scene.logarithmicDepthBuffer = true;
  scene.sunBloom = false;
  scene.light = new SunLight({ intensity: 1.12 });
  globe.show = true;

  if (scene.skyBox) {
    scene.skyBox.show = true;
  }
  if (scene.skyAtmosphere) {
    scene.skyAtmosphere.show = true;
    scene.skyAtmosphere.atmosphereLightIntensity = 8.6;
    scene.skyAtmosphere.atmosphereMieAnisotropy = 0.76;
    scene.skyAtmosphere.brightnessShift = -0.08;
    scene.skyAtmosphere.saturationShift = -0.04;
  }
  if (scene.sun) {
    scene.sun.show = true;
    scene.sun.glowFactor = 0.72;
  }
  if (scene.moon) {
    scene.moon.show = true;
    scene.moon.onlySunLighting = true;
    scene.moon.textureUrl = NASA_LROC_MOON_TEXTURE;
  }

  // Web Mercator imagery cannot sample the exact poles. A neutral ice tone
  // keeps Cesium's tiny uncovered caps visually continuous with polar ice.
  globe.baseColor = Color.fromCssColorString("#dce8ef");
  globe.backFaceCulling = true;
  globe.enableLighting = true;
  globe.dynamicAtmosphereLighting = true;
  globe.dynamicAtmosphereLightingFromSun = true;
  globe.showGroundAtmosphere = true;
  globe.atmosphereLightIntensity = 7.2;
  globe.atmosphereMieAnisotropy = 0.76;
  globe.atmosphereBrightnessShift = -0.09;
  globe.atmosphereSaturationShift = -0.05;
  globe.depthTestAgainstTerrain = true;
  globe.lightingFadeInDistance = 12_000_000;
  globe.lightingFadeOutDistance = 65_000_000;
  globe.nightFadeInDistance = 9_000_000;
  globe.nightFadeOutDistance = 75_000_000;
  globe.loadingDescendantLimit = 12;
  globe.preloadAncestors = true;
  globe.preloadSiblings = false;
  globe.showWaterEffect = false;

  scene.fog.density = 0.00036;
  scene.fog.heightScalar = 0.001;
  scene.fog.visualDensityScalar = 0.14;
  scene.fog.screenSpaceErrorFactor = 2.2;
  scene.fog.minimumBrightness = 0.08;
}
