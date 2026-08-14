import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { useRefreshProvider } from "@/features/control-center/api/useControlCenter";

import { useSpaceNews } from "../api/useSpaceNews";
import { balanceNewsSources, summarizeNewsFeed } from "../domain/news";
import { useNewsSelectionStore } from "../model/newsSelection";
import { NewsErrorState } from "./NewsErrorState";
import { NewsLoadingState } from "./NewsLoadingState";
import { SpaceNewsCard } from "./SpaceNewsCard";
import { SpaceNewsDetailWorkspace } from "./SpaceNewsDetailWorkspace";
import { SpaceNewsFilters, type NewsTypeFilter } from "./SpaceNewsFilters";
import { SpaceNewsHeader } from "./SpaceNewsHeader";
import { SpaceNewsOverview } from "./SpaceNewsOverview";

interface SpaceNewsDashboardProps {
  onOpenEvent: (id: string) => void;
  onOpenLaunch: (id: string) => void;
}

export function SpaceNewsDashboard({ onOpenEvent, onOpenLaunch }: SpaceNewsDashboardProps) {
  const { t } = useTranslation("news");
  const requestedNewsId = useNewsSelectionStore((state) => state.requestedNewsId);
  const clearRequestedNews = useNewsSelectionStore((state) => state.clearRequestedNews);
  const requestNews = useNewsSelectionStore((state) => state.requestNews);
  const activeType = useNewsSelectionStore((state) => state.activeType);
  const activeSource = useNewsSelectionStore((state) => state.activeSource);
  const search = useNewsSelectionStore((state) => state.search);
  const limit = useNewsSelectionStore((state) => state.limit);
  const scrollTop = useNewsSelectionStore((state) => state.scrollTop);
  const setViewState = useNewsSelectionStore((state) => state.setViewState);
  const [debouncedSearch, setDebouncedSearch] = useState(search.trim());
  const pageRef = useRef<HTMLElement>(null);
  const refresh = useRefreshProvider();

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedSearch(search.trim()), 150);
    return () => window.clearTimeout(handle);
  }, [search]);
  useEffect(() => {
    if (requestedNewsId) return;
    const page = pageRef.current;
    if (!page) return;
    page.scrollTop = scrollTop;
    return () => setViewState({ scrollTop: page.scrollTop });
  }, [requestedNewsId, scrollTop, setViewState]);
  useEffect(() => {
    if (!requestedNewsId) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) clearRequestedNews();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [clearRequestedNews, requestedNewsId]);

  const filters = useMemo(() => ({
    ...(activeType === "featured" ? { featured: true } : {}),
    ...(activeType !== "all" && activeType !== "featured" ? { contentTypes: [activeType] } : {}),
    ...(activeSource ? { sources: [activeSource] } : {}),
    ...(debouncedSearch.length >= 2 ? { search: debouncedSearch } : {}),
    limit,
  }), [activeSource, activeType, debouncedSearch, limit]);
  const feed = useSpaceNews(filters);
  const data = feed.data;
  const displayItems = useMemo(() => balanceNewsSources(data?.items ?? []), [data?.items]);
  const summary = useMemo(() => summarizeNewsFeed(displayItems), [displayItems]);

  if (requestedNewsId) {
    return <SpaceNewsDetailWorkspace key={requestedNewsId} newsId={requestedNewsId} onBack={clearRequestedNews} onOpenEvent={onOpenEvent} onOpenLaunch={onOpenLaunch} />;
  }

  const hero = displayItems.find((item) => item.featured) ?? displayItems[0] ?? null;
  const cards = displayItems.filter((item) => item.id !== hero?.id);

  return (
    <section className="space-news-page" ref={pageRef}>
      <SpaceNewsHeader
        fetchedAt={data?.fetchedAtUnixMs ?? null}
        itemCount={data?.totalCount ?? 0}
        loadedCount={data?.items.length ?? 0}
        onRefresh={() => refresh.mutate("spaceflightNews")}
        refreshing={refresh.isPending || feed.isFetching}
        source={data?.source ?? "Spaceflight News API v4"}
        stale={data?.stale ?? false}
      />
      <SpaceNewsFilters
        activeSource={activeSource}
        activeType={activeType}
        onSearchChange={(value) => setViewState({ search: value, limit: 30, scrollTop: 0 })}
        onSourceChange={(value) => setViewState({ activeSource: value, limit: 30, scrollTop: 0 })}
        onTypeChange={(value: NewsTypeFilter) => setViewState({ activeType: value, limit: 30, scrollTop: 0 })}
        search={search}
        sources={data?.availableSources ?? []}
      />
      {data && data.items.length > 0 && <SpaceNewsOverview summary={summary} />}
      {feed.isLoading && !data ? <NewsLoadingState /> : feed.isError && !data ? (
        <NewsErrorState onRetry={() => void feed.refetch()} />
      ) : !data || data.items.length === 0 ? <NewsErrorState empty /> : (
        <>
          {hero && <SpaceNewsCard item={hero} onOpen={requestNews} prominent />}
          <div className="space-news-grid">{cards.map((item) => <SpaceNewsCard item={item} key={item.id} onOpen={requestNews} />)}</div>
          {data.items.length < data.totalCount && (
            <button className="space-news-load-more secondary-button" onClick={() => setViewState({ limit: limit + 30 })} type="button">{t("actions.loadMore")}</button>
          )}
        </>
      )}
    </section>
  );
}
