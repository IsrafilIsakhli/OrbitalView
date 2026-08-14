import { ArrowRight20Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";

import { formatCompactDate } from "@/shared/i18n/formatters";

import type { NewsItem } from "../domain/news";
import { NewsImage } from "./NewsImage";
import { NewsMissionRelations } from "./NewsMissionRelations";
import { NewsSourceBadge } from "./NewsSourceBadge";
import { NewsTranslationStatus } from "./NewsTranslationStatus";

interface SpaceNewsCardProps {
  item: NewsItem;
  onOpen: (id: string) => void;
  prominent?: boolean;
}

export function SpaceNewsCard({ item, onOpen, prominent = false }: SpaceNewsCardProps) {
  const { i18n, t } = useTranslation("news");
  return (
    <article className="space-news-card glass-surface" data-featured={prominent} data-provider-featured={item.featured}>
      <button aria-label={t("actions.openStory", { title: item.title })} className="space-news-card__visual" onClick={() => onOpen(item.id)} type="button">
        <NewsImage
          alt={item.title}
          cachedPath={item.imageCachePath}
          eager={prominent}
          imageAvailable={item.imageUrlAvailable}
          newsId={item.id}
        />
        <span className="space-news-card__type">{t(`types.${item.contentType}`)}</span>
        {item.featured && <span className="space-news-card__featured">{t("badges.featured")}</span>}
      </button>
      <div className="space-news-card__body">
        <div className="space-news-card__meta">
          <NewsSourceBadge source={item.source} />
          <time dateTime={new Date(item.publishedAtUnixMs).toISOString()}>
            {formatCompactDate(item.publishedAtUnixMs, i18n.resolvedLanguage)}
          </time>
        </div>
        {prominent && <span className="space-news-card__eyebrow">{t("briefing.latest")}</span>}
        <h2><button onClick={() => onOpen(item.id)} type="button">{item.title}</button></h2>
        <p>{item.summary}</p>
        <NewsMissionRelations compact relations={item.relations} />
        <footer>
          <NewsTranslationStatus state={item.translationState} />
          <button onClick={() => onOpen(item.id)} type="button">
            {t("actions.details")}<ArrowRight20Regular aria-hidden />
          </button>
        </footer>
      </div>
    </article>
  );
}
