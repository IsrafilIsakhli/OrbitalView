import { News24Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";

import { formatNumber } from "@/shared/i18n/formatters";

interface SpaceNewsHeaderProps {
  itemCount: number;
  loadedCount: number;
  source: string;
}

export function SpaceNewsHeader({
  itemCount,
  loadedCount,
  source,
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
        <div><strong>{source}</strong></div>
        <div className="space-news-header__counts">
          <span><small>{t("metrics.loaded")}</small><strong>{formatNumber(loadedCount, i18n.resolvedLanguage)}</strong></span>
          <span><small>{t("metrics.archive")}</small><strong>{formatNumber(itemCount, i18n.resolvedLanguage)}</strong></span>
        </div>
      </div>
    </header>
  );
}
