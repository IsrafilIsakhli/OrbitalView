import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { usePreferencesStore } from "@/features/settings/model/preferences";

import type { NewsFeedFilters, NewsRelationType } from "../domain/news";
import {
  clearSpaceNewsTranslations,
  fetchSpaceNews,
  fetchSpaceNewsDetail,
  fetchSpaceNewsForRelation,
  resolveNewsImage,
  searchSpaceNews,
} from "./spaceNews";

export const spaceNewsQueryKey = ["space-news", "sfn-v4"] as const;

export function useSpaceNews(filters: NewsFeedFilters = {}) {
  const locale = usePreferencesStore((state) => state.locale);
  return useQuery({
    gcTime: 30 * 60_000,
    queryFn: () => fetchSpaceNews(locale, filters),
    queryKey: [...spaceNewsQueryKey, "feed", locale, filters],
    retry: 1,
    staleTime: 5 * 60_000,
  });
}

export function useSpaceNewsDetail(newsId: string | null) {
  const locale = usePreferencesStore((state) => state.locale);
  return useQuery({
    enabled: Boolean(newsId),
    queryFn: () => fetchSpaceNewsDetail(newsId!, locale),
    queryKey: [...spaceNewsQueryKey, "detail", locale, newsId],
    staleTime: 5 * 60_000,
  });
}

export function useSpaceNewsForRelation(
  relationType: NewsRelationType,
  externalId: string | null,
  limit = 6,
) {
  const locale = usePreferencesStore((state) => state.locale);
  return useQuery({
    enabled: Boolean(externalId),
    queryFn: () => fetchSpaceNewsForRelation(relationType, externalId!, locale, limit),
    queryKey: [...spaceNewsQueryKey, "relation", relationType, externalId, locale, limit],
    staleTime: 5 * 60_000,
  });
}

export function useSpaceNewsSearch(query: string, enabled = true) {
  const locale = usePreferencesStore((state) => state.locale);
  const normalizedQuery = query.trim();
  return useQuery({
    enabled: enabled && normalizedQuery.length >= 2,
    queryFn: () => searchSpaceNews(normalizedQuery, locale),
    queryKey: [...spaceNewsQueryKey, "search", locale, normalizedQuery],
    staleTime: 60_000,
  });
}

export function useNewsImage(newsId: string, enabled: boolean) {
  return useQuery({
    enabled,
    gcTime: 60 * 60_000,
    queryFn: () => resolveNewsImage(newsId),
    queryKey: [...spaceNewsQueryKey, "image", newsId],
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useClearSpaceNewsTranslations() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: clearSpaceNewsTranslations,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: spaceNewsQueryKey }),
  });
}
