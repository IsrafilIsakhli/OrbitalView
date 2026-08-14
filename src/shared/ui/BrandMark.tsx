import { useId } from "react";

interface BrandMarkProps {
  className?: string;
  decorative?: boolean;
  label?: string;
}

export function BrandMark({
  className,
  decorative = true,
  label,
}: BrandMarkProps) {
  const gradientId = useId();

  return (
    <svg
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : label}
      className={className}
      fill="none"
      role={decorative ? undefined : "img"}
      viewBox="0 0 40 40"
    >
      <defs>
        <linearGradient id={gradientId} x1="7" x2="34" y1="31" y2="8">
          <stop stopColor="#168FFF" />
          <stop offset="1" stopColor="#74E5FF" />
        </linearGradient>
      </defs>
      <circle cx="20" cy="20" r="9.5" stroke={`url(#${gradientId})`} strokeWidth="2.6" />
      <path
        d="M4.9 25.2c3.9 5.4 14.4 5.2 23.5-.5 9.1-5.8 13.3-14.9 9.4-20.3"
        stroke={`url(#${gradientId})`}
        strokeLinecap="round"
        strokeWidth="2.2"
      />
      <circle cx="33.1" cy="8.2" fill="#D9FAFF" r="2.8" />
    </svg>
  );
}
