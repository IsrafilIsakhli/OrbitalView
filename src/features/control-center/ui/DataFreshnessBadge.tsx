import clsx from "clsx";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { formatRelativeTime } from "@/shared/i18n/formatters";

import type { ProviderHealthStatus } from "../api/controlCenter";

interface DataFreshnessBadgeProps {
  status: ProviderHealthStatus;
  timestampUnixMs?: number | null | undefined;
}

export function DataFreshnessBadge({ status, timestampUnixMs }: DataFreshnessBadgeProps) {
  const { i18n, t } = useTranslation("common");
  const [renderedAt] = useState(() => Date.now());
  const relative = timestampUnixMs
    ? formatRelativeTime(timestampUnixMs, renderedAt, i18n.resolvedLanguage)
    : null;
  return (
    <span className={clsx("data-freshness", `data-freshness--${status}`)}>
      <i aria-hidden />
      {t(`operationsStatus.${status}`)}
      {relative && <small>{relative}</small>}
    </span>
  );
}
