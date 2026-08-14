import {
  Globe24Regular,
  LocalLanguage24Regular,
  News24Regular,
  Rocket24Regular,
} from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";

import { formatNumber } from "@/shared/i18n/formatters";

import type { NewsFeedSummary } from "../domain/news";

export function SpaceNewsOverview({ summary }: { summary: NewsFeedSummary }) {
  const { i18n, t } = useTranslation("news");
  const metrics = [
    { icon: News24Regular, key: "loaded", value: summary.loadedCount },
    { icon: Globe24Regular, key: "sources", value: summary.sourceCount },
    { icon: LocalLanguage24Regular, key: "translated", value: summary.translatedCount },
    { icon: Rocket24Regular, key: "linked", value: summary.linkedCount },
  ] as const;
  return (
    <section aria-label={t("overview.label")} className="space-news-overview glass-surface">
      {metrics.map(({ icon: Icon, key, value }) => (
        <div key={key}>
          <span><Icon aria-hidden /></span>
          <p><small>{t(`overview.${key}`)}</small><strong>{formatNumber(value, i18n.resolvedLanguage)}</strong></p>
        </div>
      ))}
    </section>
  );
}
