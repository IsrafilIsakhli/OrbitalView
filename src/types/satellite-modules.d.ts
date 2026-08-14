declare module "@satellite/bulk" {
  export { BulkPropagator } from "satellite.js";
}

declare module "@satellite/ecf-calculator" {
  export { EcfPositionCalculator } from "satellite.js";
}

declare module "@satellite/eci-calculator" {
  export { EciBaseCalculator } from "satellite.js";
}

declare module "@satellite/geodetic-calculator" {
  export { GeodeticPositionCalculator } from "satellite.js";
}

declare module "@satellite/gmst-calculator" {
  export { GmstCalculator } from "satellite.js";
}

declare module "@satellite/io" {
  export { json2satrec } from "satellite.js";
}

declare module "@satellite/propagation" {
  export { gstime, propagate } from "satellite.js";
}

declare module "@satellite/runtime" {
  import type { createSingleThreadRuntime } from "satellite.js";

  type SingleThreadRuntime = Awaited<
    ReturnType<typeof createSingleThreadRuntime>
  >;

  export function createSingleThreadRuntimeFromModule(
    wasmModule: SingleThreadRuntime["module"],
  ): Promise<SingleThreadRuntime>;
}

declare module "@satellite/transforms" {
  export {
    degreesToRadians,
    ecfToLookAngles,
    eciToEcf,
    eciToGeodetic,
  } from "satellite.js";
}

declare module "@satellite/wasm-module" {
  import type { createSingleThreadRuntime } from "satellite.js";

  type SingleThreadRuntime = Awaited<
    ReturnType<typeof createSingleThreadRuntime>
  >;

  export default function createWasmModule(): Promise<
    SingleThreadRuntime["module"]
  >;
}
