import {
  ArrowLeft24Regular,
  ArrowUpRight24Regular,
  CalendarLtr20Regular,
  LocalLanguage20Regular,
  News24Regular,
  Person20Regular,
} from "@fluentui/react-icons";
import { openExternalUrl } from "@/shared/security/externalUrl";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { formatDateTime } from "@/shared/i18n/formatters";

import { useSpaceNewsDetail } from "../api/useSpaceNews";
import { newsArticleHost, safeNewsArticleUrl } from "../domain/news";
import { NewsErrorState } from "./NewsErrorState";
import { NewsImage } from "./NewsImage";
import { NewsLoadingState } from "./NewsLoadingState";
import { NewsMissionRelations } from "./NewsMissionRelations";
import { NewsSourceBadge } from "./NewsSourceBadge";
import { NewsTranslationStatus } from "./NewsTranslationStatus";

interface SpaceNewsDetailWorkspaceProps {
  newsId: string;
  onBack: () => void;
  onOpenEvent: (id: string) => void;
  onOpenLaunch: (id: string) => void;
}

export function SpaceNewsDetailWorkspace({ newsId, onBack, onOpenEvent, onOpenLaunch }: SpaceNewsDetailWorkspaceProps) {
  const { i18n, t } = useTranslation("news");
  const detail = useSpaceNewsDetail(newsId);
  const [showOriginal, setShowOriginal] = useState(false);

  if (detail.isLoading && !detail.data) return <NewsLoadingState />;
  if (detail.isError || !detail.data) return <NewsErrorState onRetry={() => void detail.refetch()} />;

  const item = detail.data;
  const title = showOriginal ? item.titleOriginal : item.title;
  const summary = showOriginal ? item.summaryOriginal : item.summary;
  const published = formatDateTime(item.publishedAtUnixMs, i18n.resolvedLanguage, "utc-local");
  const updated = formatDateTime(item.sourceUpdatedAtUnixMs, i18n.resolvedLanguage, "utc-only");
  const articleUrl = safeNewsArticleUrl(item.articleUrl);
  const articleHost = newsArticleHost(item.articleUrl);

  return (
    <article className="space-news-detail">
      <header className="space-news-detail__toolbar">
        <div>
          <button className="secondary-button" onClick={onBack} type="button"><ArrowLeft24Regular aria-hidden />{t("actions.back")}</button>
          <span>{t("detail.briefingId", { id: item.id })}</span>
        </div>
        {item.translationState === "cached" && (
          <button aria-pressed={showOriginal} className="secondary-button" onClick={() => setShowOriginal((value) => !value)} type="button">
            <LocalLanguage20Regular aria-hidden />{showOriginal ? t("actions.localized") : t("actions.original")}
          </button>
        )}
      </header>

      <div className="space-news-detail__hero glass-surface">
        <div className="space-news-detail__image">
          <NewsImage alt={title} cachedPath={item.imageCachePath} eager imageAvailable={item.imageUrlAvailable} newsId={item.id} />
        </div>
        <div className="space-news-detail__headline">
          <div className="space-news-detail__badges">
            <NewsSourceBadge source={item.source} />
            <span className="space-news-card__type">{t(`types.${item.contentType}`)}</span>
            <NewsTranslationStatus state={showOriginal ? "original" : item.translationState} />
          </div>
          <div className="space-news-detail__provenance">
            <time dateTime={new Date(item.publishedAtUnixMs).toISOString()}>{published.primary}</time>
            {articleHost && <span>{articleHost}</span>}
          </div>
          <h1>{title}</h1>
          <p>{summary}</p>
          {articleUrl && (
            <button className="primary-button" onClick={() => void openExternalUrl(articleUrl).catch(() => undefined)} type="button">
              {t("actions.readFull")}<ArrowUpRight24Regular aria-hidden />
            </button>
          )}
          <small className="space-news-detail__external-note">{t("detail.externalNotice")}</small>
        </div>
      </div>

      <div className="space-news-detail__grid">
        <section className="space-news-detail__metadata glass-surface">
          <p className="eyebrow">{t("detail.sourceData")}</p>
          <dl>
            <div><dt><News24Regular aria-hidden />{t("detail.publisher")}</dt><dd>{item.source}</dd></div>
            <div><dt><CalendarLtr20Regular aria-hidden />{t("detail.published")}</dt><dd>{published.primary}{published.local && <small>{published.local}</small>}</dd></div>
            <div><dt><CalendarLtr20Regular aria-hidden />{t("detail.updated")}</dt><dd>{updated.primary}</dd></div>
            <div><dt><Person20Regular aria-hidden />{t("detail.authors")}</dt><dd>{item.authors.length > 0 ? item.authors.join(", ") : t("detail.unavailable")}</dd></div>
          </dl>
        </section>
        <section className="space-news-detail__relations glass-surface">
          <p className="eyebrow">{t("detail.related")}</p>
          {item.relations.length > 0 ? (
            <NewsMissionRelations onOpenEvent={onOpenEvent} onOpenLaunch={onOpenLaunch} relations={item.relations} />
          ) : <p>{t("detail.noRelations")}</p>}
        </section>
      </div>
    </article>
  );
}
