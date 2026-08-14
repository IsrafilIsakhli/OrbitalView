export function NewsSourceBadge({ source }: { source: string }) {
  const initials = source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toLocaleUpperCase())
    .join("");
  return (
    <span className="news-source-badge">
      <i aria-hidden>{initials || "SN"}</i>
      <span>{source}</span>
    </span>
  );
}
