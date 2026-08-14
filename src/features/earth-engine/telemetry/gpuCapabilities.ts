import type { Scene } from "cesium";

import type { GpuCapabilities, MemorySnapshot } from "../contracts/earth-engine";

interface NavigatorWithDeviceMemory extends Navigator {
  deviceMemory?: number;
}

interface PerformanceWithMemory extends Performance {
  memory?: {
    jsHeapSizeLimit: number;
    totalJSHeapSize: number;
    usedJSHeapSize: number;
  };
}

interface CesiumRenderingContext {
  readonly _gl: WebGLRenderingContext | WebGL2RenderingContext;
  readonly antialias: boolean;
  readonly webgl2: boolean;
}

export const webGlContextAttributes = {
  alpha: false,
  antialias: true,
  failIfMajorPerformanceCaveat: false,
  powerPreference: "high-performance",
  preserveDrawingBuffer: false,
} as const satisfies WebGLContextAttributes;

function readRendererInfo(
  gl: WebGLRenderingContext | WebGL2RenderingContext,
): Pick<GpuCapabilities, "renderer" | "vendor"> {
  const extension = gl.getExtension("WEBGL_debug_renderer_info") as
    | {
        UNMASKED_RENDERER_WEBGL: number;
        UNMASKED_VENDOR_WEBGL: number;
      }
    | null;

  if (!extension) {
    return {
      renderer: String(gl.getParameter(gl.RENDERER)),
      vendor: String(gl.getParameter(gl.VENDOR)),
    };
  }

  return {
    renderer: String(gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)),
    vendor: String(gl.getParameter(extension.UNMASKED_VENDOR_WEBGL)),
  };
}

export function inspectGpuCapabilities(
  scene: Scene,
): GpuCapabilities {
  const { context } = scene as unknown as {
    context: CesiumRenderingContext;
  };
  const gl = context._gl;
  const rendererInfo = readRendererInfo(gl);
  return {
    antialias: context.antialias,
    api: context.webgl2 ? "WebGL 2" : "WebGL 1",
    maxMsaaSamples: context.webgl2
      ? Number(
          (gl as WebGL2RenderingContext).getParameter(
            (gl as WebGL2RenderingContext).MAX_SAMPLES,
          ),
        )
      : 1,
    maxTextureSize: Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)),
    ...rendererInfo,
  };
}

export function readDeviceMemoryGb(): number | undefined {
  return (navigator as NavigatorWithDeviceMemory).deviceMemory;
}

export function readMemorySnapshot(): MemorySnapshot | null {
  const memory = (performance as PerformanceWithMemory).memory;
  if (!memory) {
    return null;
  }

  const toMegabytes = (bytes: number) =>
    Math.round((bytes / 1024 / 1024) * 10) / 10;

  return {
    heapLimitMb: toMegabytes(memory.jsHeapSizeLimit),
    totalHeapMb: toMegabytes(memory.totalJSHeapSize),
    usedHeapMb: toMegabytes(memory.usedJSHeapSize),
  };
}
