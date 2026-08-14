import { useEffect, useRef } from "react";

import type { DynamicsSample } from "../domain/analysis";

export function OrbitSchematicCanvas({
  ariaLabel,
  samples,
  selectedIndex,
}: {
  ariaLabel: string;
  samples: DynamicsSample[];
  selectedIndex: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || samples.length < 2) return;
    const render = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(rect.width * ratio));
      canvas.height = Math.max(1, Math.floor(rect.height * ratio));
      const context = canvas.getContext("2d");
      if (!context) return;
      context.scale(ratio, ratio);
      context.clearRect(0, 0, rect.width, rect.height);
      context.fillStyle = "rgba(4,10,17,.88)";
      context.fillRect(0, 0, rect.width, rect.height);
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const maxRadius = Math.max(...samples.map((sample) => sample.radiusKm));
      const scale = Math.max(1, Math.min(rect.width, rect.height) * 0.43 / maxRadius);
      context.fillStyle = "#0b5e8d";
      context.beginPath();
      context.arc(centerX, centerY, 6_378.135 * scale, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = "#79e6ff";
      context.lineWidth = 1.4;
      context.beginPath();
      samples.forEach((sample, index) => {
        const angle = index / Math.max(1, samples.length - 1) * Math.PI * 2 - Math.PI / 2;
        const x = centerX + Math.cos(angle) * sample.radiusKm * scale;
        const y = centerY + Math.sin(angle) * sample.radiusKm * scale;
        if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
      });
      context.stroke();
      const selected = samples[Math.min(samples.length - 1, Math.max(0, selectedIndex))];
      if (selected) {
        const angle = Math.min(samples.length - 1, Math.max(0, selectedIndex)) / Math.max(1, samples.length - 1) * Math.PI * 2 - Math.PI / 2;
        context.fillStyle = "#ffca70";
        context.beginPath();
        context.arc(centerX + Math.cos(angle) * selected.radiusKm * scale, centerY + Math.sin(angle) * selected.radiusKm * scale, 4, 0, Math.PI * 2);
        context.fill();
      }
    };
    const observer = new ResizeObserver(render);
    observer.observe(canvas);
    render();
    return () => observer.disconnect();
  }, [samples, selectedIndex]);
  return <canvas aria-label={ariaLabel} className="analysis-constellation-canvas" ref={canvasRef} role="img" />;
}
