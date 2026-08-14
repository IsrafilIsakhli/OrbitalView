import { resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

const tauriDevHost = process.env.TAURI_DEV_HOST;
const orbitalTargetOs = process.env.ORBITAL_TARGET_OS ?? process.platform;
const cesiumSource = "node_modules/cesium/Build/Cesium";
const cesiumBaseUrl = "cesiumStatic";
const satelliteSource = fileURLToPath(
  new URL("./node_modules/satellite.js/", import.meta.url),
);

const satelliteModule = (path: string) => resolve(satelliteSource, path);

export default defineConfig({
  build: {
    chunkSizeWarningLimit: 6_000,
    rollupOptions: {
      output: {
        manualChunks: {
          "cesium-engine": ["cesium"],
          "fluent-icons": ["@fluentui/react-icons"],
          localization: ["i18next", "react-i18next"],
          motion: ["motion"],
          "react-vendor": ["react", "react-dom"],
          state: ["@tanstack/react-query", "zustand", "zod"],
        },
      },
    },
  },
  clearScreen: false,
  define: {
    __ORBITAL_TARGET_OS__: JSON.stringify(orbitalTargetOs),
    CESIUM_BASE_URL: JSON.stringify(`/${cesiumBaseUrl}/`),
  },
  plugins: [
    react(),
    viteStaticCopy({
      targets: ["ThirdParty", "Workers", "Assets", "Widgets"].map(
        (directory) => ({
          dest: cesiumBaseUrl,
          rename: { stripBase: 4 },
          src: `${cesiumSource}/${directory}`,
        }),
      ),
    }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@satellite/bulk": satelliteModule("dist/wasm/bulk-propagator.js"),
      "@satellite/ecf-calculator": satelliteModule(
        "dist/wasm/calculators/ecf-position-calculator.js",
      ),
      "@satellite/eci-calculator": satelliteModule(
        "dist/wasm/calculators/eci-base-calculator.js",
      ),
      "@satellite/geodetic-calculator": satelliteModule(
        "dist/wasm/calculators/geodetic-position-calculator.js",
      ),
      "@satellite/gmst-calculator": satelliteModule(
        "dist/wasm/calculators/gmst-calculator.js",
      ),
      "@satellite/io": satelliteModule("dist/io.js"),
      "@satellite/propagation": satelliteModule("dist/propagation.js"),
      "@satellite/runtime": satelliteModule(
        "dist/wasm/runtimes/single-thread-runtime.js",
      ),
      "@satellite/transforms": satelliteModule("dist/transforms.js"),
      "@satellite/wasm-module": satelliteModule(
        "wasm-build/base-release/index.js",
      ),
      "node:module": fileURLToPath(
        new URL("./src/platform/browserNodeModule.ts", import.meta.url),
      ),
    },
  },
  server: {
    host: tauriDevHost || false,
    port: 1420,
    strictPort: true,
    hmr: tauriDevHost
      ? {
          host: tauriDevHost,
          port: 1421,
          protocol: "ws",
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  worker: {
    format: "es",
  },
});
