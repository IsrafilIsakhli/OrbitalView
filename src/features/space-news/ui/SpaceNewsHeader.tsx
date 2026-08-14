import { ArrowSync24Regular, News24Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";

import { DataFreshnessBadge } from "@/features/control-center/ui/DataFreshnessBadge";
import { formatDateTime, formatNumber } from "@/shared/i18n/formatters";

interface SpaceNewsHeaderProps {
  fetchedAt: number | null;
  itemCount: number;
  loadedCount: number;
  onRefresh: () => void;
  refreshing: boolean;
  source: string;
  stale: boolean;
}

export function SpaceNewsHeader({
  fetchedAt,
  itemCount,
  loadedCount,
  onRefresh,
  refreshing,
  source,
  stale,
}: SpaceNewsHeaderProps) {
  const { i18n, t } = useTranslation("news");
  return (
    <header className="space-news-header">
      <div className="space-news-header__identity">
        <span><News24Regular aria-hidden /></span>
        <div>
          <p className="eyebrow">{t("eyebrow")}</p>
          <h1>{t("title")}</h1>
          <p>{t("subtitle")}</p>
        </div>
      </div>
      <div className="space-news-header__status glass-surface">
        <div>
          <DataFreshnessBadge
            status={refreshing ? "refreshing" : stale ? "stale" : "healthy"}
            timestampUnixMs={fetchedAt}
          />
          <strong>{source}</strong>
        </div>
        <div className="space-news-header__counts">
          <span><small>{t("metrics.loaded")}</small><strong>{formatNumber(loadedCount, i18n.resolvedLanguage)}</strong></span>
          <span><small>{t("metrics.archive")}</small><strong>{formatNumber(itemCount, i18n.resolvedLanguage)}</strong></span>
        </div>
        <time dateTime={fetchedAt ? new Date(fetchedAt).toISOString() : undefined}>
          {fetchedAt
            ? formatDateTime(fetchedAt, i18n.resolvedLanguage, "utc-only", { year: undefined }).primary
            : t("metrics.never")}
        </time>
        <button disabled={refreshing} onClick={onRefresh} type="button">
          <ArrowSync24Regular aria-hidden />{t("actions.refresh")}
        </button>
      </div>
    </header>
  );
}
