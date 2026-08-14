interface EarthObjectTooltipProps {
  accent: "launch" | "rocket" | "satellite" | "station";
  facts: string[];
  label: string;
  position: { x: number; y: number };
  title: string;
}

export function EarthObjectTooltip({
  accent,
  facts,
  label,
  position,
  title,
}: EarthObjectTooltipProps) {
  return (
    <div
      aria-hidden
      className="earth-object-tooltip glass-surface"
      data-accent={accent}
      style={{ left: position.x, top: position.y }}
    >
      <small>{label}</small>
      <strong>{title}</strong>
      <span>{facts.filter(Boolean).join(" · ")}</span>
    </div>
  );
}
