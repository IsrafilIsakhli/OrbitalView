import { useTranslation } from "react-i18next";

import type { DataFreshness } from "@/shared/data/freshness";
import { formatDateTime } from "@/shared/i18n/formatters";

export function FreshnessStamp({ freshness, locale, timestampUnixMs }: { freshness: DataFreshness; locale: string; timestampUnixMs: number | null }) {
  const { t } = useTranslation("common");
  return <span className="freshness-stamp" data-status={freshness}><i />{t(`freshness.${freshness}`)}{timestampUnixMs !== null && <time>{formatDateTime(timestampUnixMs, locale, "utc-only").primary}</time>}</span>;
}
