import { SkyBox } from "cesium";

/** Quiet, deterministic background; stars are decorative, not a sky catalog. */
export function createStarSkyBox(starCount: number): SkyBox {
  const faces = ["positiveX", "negativeX", "positiveY", "negativeY", "positiveZ", "negativeZ"] as const;
  let seed = 731;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const sources = Object.fromEntries(faces.map((face) => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext("2d");
    if (context) {
      context.fillStyle = "#010308";
      context.fillRect(0, 0, 512, 512);
      for (let index = 0; index < Math.ceil(starCount / 6); index++) {
        const x = 2 + random() * 508;
        const y = 2 + random() * 508;
        context.fillStyle = `rgba(204,224,244,${0.3 + random() * 0.4})`;
        context.beginPath();
        context.arc(x, y, 0.45 + random() * 0.35, 0, Math.PI * 2);
        context.fill();
      }
    }
    return [face, canvas];
  })) as Record<typeof faces[number], HTMLCanvasElement>;
  return new SkyBox({ sources });
}
