import { Color, SunLight, type CesiumWidget } from "cesium";

const NASA_LROC_MOON_TEXTURE = "/assets/celestial/nasa-lroc-moon-2k.jpg";

export function configureScene(widget: CesiumWidget): void {
  const { scene } = widget;
  const { globe } = scene;

  scene.backgroundColor = Color.fromCssColorString("#030712");
  scene.highDynamicRange = scene.highDynamicRangeSupported;
  scene.gamma = 1.04;
  scene.logarithmicDepthBuffer = true;
  scene.sunBloom = false;
  scene.light = new SunLight({ intensity: 1.18 });
  globe.show = true;

  if (scene.skyBox) {
    scene.skyBox.show = true;
  }
  if (scene.skyAtmosphere) {
    scene.skyAtmosphere.show = true;
    scene.skyAtmosphere.atmosphereLightIntensity = 9.5;
    scene.skyAtmosphere.atmosphereMieAnisotropy = 0.79;
    scene.skyAtmosphere.brightnessShift = -0.1;
    scene.skyAtmosphere.saturationShift = -0.06;
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
  globe.enableLighting = true;
  globe.dynamicAtmosphereLighting = true;
  globe.dynamicAtmosphereLightingFromSun = true;
  globe.showGroundAtmosphere = true;
  globe.atmosphereLightIntensity = 7.8;
  globe.atmosphereMieAnisotropy = 0.78;
  globe.atmosphereBrightnessShift = -0.11;
  globe.atmosphereSaturationShift = -0.07;
  globe.depthTestAgainstTerrain = true;
  globe.lightingFadeInDistance = 12_000_000;
  globe.lightingFadeOutDistance = 65_000_000;
  globe.nightFadeInDistance = 9_000_000;
  globe.nightFadeOutDistance = 75_000_000;
  globe.preloadAncestors = true;
  globe.preloadSiblings = false;
  globe.showWaterEffect = false;

  scene.fog.density = 0.00042;
  scene.fog.heightScalar = 0.001;
  scene.fog.visualDensityScalar = 0.18;
  scene.fog.screenSpaceErrorFactor = 1.8;
  scene.fog.minimumBrightness = 0.09;
}
