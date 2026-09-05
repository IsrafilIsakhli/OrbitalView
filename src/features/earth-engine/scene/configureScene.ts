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
  scene.light = new SunLight({ intensity: 1.05 });
  globe.show = true;

  if (scene.skyBox) {
    scene.skyBox.show = true;
  }
  if (scene.skyAtmosphere) {
    scene.skyAtmosphere.show = true;
    scene.skyAtmosphere.atmosphereLightIntensity = 8.5;
    scene.skyAtmosphere.atmosphereMieAnisotropy = 0.76;
    scene.skyAtmosphere.brightnessShift = -0.05;
    scene.skyAtmosphere.saturationShift = -0.04;
    scene.skyAtmosphere.hueShift = 0;
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
  globe.atmosphereLightIntensity = 7.4;
  globe.atmosphereMieAnisotropy = 0.76;
  globe.atmosphereBrightnessShift = -0.03;
  globe.atmosphereSaturationShift = -0.05;
  globe.atmosphereHueShift = 0;
  globe.depthTestAgainstTerrain = true;
  // Cesium measures these from Earth's centre, not camera altitude. Keeping
  // the entire transition below the surface preserves sunlight at every zoom.
  // Reversed, orbital-scale distances made zooming out relight the night side.
  globe.lightingFadeOutDistance = 0;
  globe.lightingFadeInDistance = 1;
  globe.nightFadeOutDistance = 0;
  globe.nightFadeInDistance = 1;
  globe.loadingDescendantLimit = 12;
  globe.preloadAncestors = true;
  globe.preloadSiblings = false;
  globe.showWaterEffect = false;

  scene.fog.density = 0.00036;
  scene.fog.heightScalar = 0.001;
  scene.fog.visualDensityScalar = 0.16;
  scene.fog.screenSpaceErrorFactor = 2.2;
  scene.fog.minimumBrightness = 0.1;
}
