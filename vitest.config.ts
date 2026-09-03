import { resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const satelliteSource = fileURLToPath(
  new URL("./node_modules/satellite.js/", import.meta.url),
);

const satelliteModule = (path: string) => resolve(satelliteSource, path);

export default defineConfig({
  define: {
    __ORBITAL_TARGET_OS__: JSON.stringify("win32"),
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@satellite/io": satelliteModule("dist/io.js"),
      "@satellite/propagation": satelliteModule("dist/propagation.js"),
      "@satellite/transforms": satelliteModule("dist/transforms.js"),
    },
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: true,
    coverage: {
      enabled: false,
    },
  },
});
