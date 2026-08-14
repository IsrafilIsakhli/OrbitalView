import { useEffect, useRef } from "react";

import type { ConstellationPoint } from "../domain/analysis";

interface ConstellationCanvasProps {
  ariaLabel: string;
  mode: "scatter" | "polar";
  onSelect: (satelliteId: string) => void;
  points: ConstellationPoint[];
  selectedId: string | null;
}

const categoryColors: Record<string, string> = {
  communications: "#9a8cff",
  debris: "#ff737d",
  navigation: "#ffca70",
  other: "#75869c",
  "rocket-body": "#ff9a56",
  science: "#6ee7c7",
  starlink: "#72dcff",
  station: "#f5fbff",
  weather: "#79c7ff",
};

export function ConstellationCanvas({ ariaLabel, mode, onSelect, points, selectedId }: ConstellationCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const plottedRef = useRef<Array<{ id: string; x: number; y: number }>>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const render = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(rect.width * ratio));
      canvas.height = Math.max(1, Math.floor(rect.height * ratio));
      const context = canvas.getContext("2d");
      if (!context) return;
      context.scale(ratio, ratio);
      context.clearRect(0, 0, rect.width, rect.height);
      context.fillStyle = "rgba(4, 10, 17, .88)";
      context.fillRect(0, 0, rect.width, rect.height);
      context.strokeStyle = "rgba(134, 190, 226, .11)";
      context.fillStyle = "#73869b";
      context.font = "10px Cascadia Mono, monospace";
      const plotted: Array<{ id: string; x: number; y: number }> = [];
      if (mode === "scatter") drawScatter(context, rect.width, rect.height, points, selectedId, plotted);
      else drawPolar(context, rect.width, rect.height, points, selectedId, plotted);
      plottedRef.current = plotted;
    };
    const observer = new ResizeObserver(render);
    observer.observe(canvas);
    render();
    return () => observer.disconnect();
  }, [mode, points, selectedId]);

  return (
    <canvas
      aria-label={ariaLabel}
      className="analysis-constellation-canvas"
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        let closest: { distance: number; id: string } | null = null;
        for (const point of plottedRef.current) {
          const distance = Math.hypot(point.x - x, point.y - y);
          if (distance <= 12 && (!closest || distance < closest.distance)) {
            closest = { distance, id: point.id };
          }
        }
        if (closest) onSelect(closest.id);
      }}
      ref={canvasRef}
      role="img"
      tabIndex={0}
    />
  );
}

function drawScatter(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  points: ConstellationPoint[],
  selectedId: string | null,
  plotted: Array<{ id: string; x: number; y: number }>,
) {
  const padding = 34;
  const maxAltitude = Math.max(2_000, ...points.map((point) => point.altitudeKm));
  for (let tick = 0; tick <= 4; tick += 1) {
    const y = padding + (height - padding * 2) * tick / 4;
    context.beginPath(); context.moveTo(padding, y); context.lineTo(width - padding, y); context.stroke();
    context.fillText(`${Math.round(maxAltitude * (1 - tick / 4))} km`, 4, y + 3);
  }
  for (const point of points) {
    const x = padding + (width - padding * 2) * Math.min(180, Math.abs(point.inclinationDegrees)) / 180;
    const y = height - padding - (height - padding * 2) * Math.min(maxAltitude, point.altitudeKm) / maxAltitude;
    plotted.push({ id: point.id, x, y });
    context.fillStyle = categoryColors[point.category] ?? "#75869c";
    context.globalAlpha = point.id === selectedId ? 1 : 0.44;
    context.beginPath();
    context.arc(x, y, point.id === selectedId ? 5 : 1.4, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;
  context.fillStyle = "#73869b";
  context.fillText("0°", padding, height - 8);
  context.fillText("180°", width - padding - 28, height - 8);
}

function drawPolar(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  points: ConstellationPoint[],
  selectedId: string | null,
  plotted: Array<{ id: string; x: number; y: number }>,
) {
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.max(20, Math.min(width, height) / 2 - 24);
  for (const scale of [0.25, 0.5, 0.75, 1]) {
    context.beginPath(); context.arc(centerX, centerY, radius * scale, 0, Math.PI * 2); context.stroke();
  }
  for (const point of points) {
    const angle = (point.rightAscensionDegrees - 90) * Math.PI / 180;
    const radial = radius * Math.min(1, Math.abs(point.inclinationDegrees) / 180);
    const x = centerX + Math.cos(angle) * radial;
    const y = centerY + Math.sin(angle) * radial;
    plotted.push({ id: point.id, x, y });
    context.fillStyle = categoryColors[point.category] ?? "#75869c";
    context.globalAlpha = point.id === selectedId ? 1 : 0.36;
    context.fillRect(x - (point.id === selectedId ? 3 : 1), y - (point.id === selectedId ? 3 : 1), point.id === selectedId ? 6 : 2, point.id === selectedId ? 6 : 2);
  }
  context.globalAlpha = 1;
}
