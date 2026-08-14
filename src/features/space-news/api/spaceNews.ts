import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { z } from "zod";

import type { SupportedLocale } from "@/shared/i18n/locales";

import {
  newsContentTypes,
  translationStates,
  type NewsFeed,
  type NewsFeedFilters,
  type NewsItem,
  type NewsRelationType,
} from "../domain/news";

const relationSchema = z.object({
  externalId: z.string().min(1),
  provider: z.string().min(1),
  relationType: z.enum(["launch", "event"]),
});

const itemSchema = z.object({
  articleUrl: z.string().url(),
  authors: z.array(z.string()),
  contentType: z.enum(newsContentTypes),
  featured: z.boolean(),
  id: z.string().min(1),
  imageCachePath: z.string().nullable(),
  imageUrlAvailable: z.boolean(),
  publishedAtUnixMs: z.number().int().nonnegative(),
  relations: z.array(relationSchema),
  source: z.string().min(1),
  sourceUpdatedAtUnixMs: z.number().int().nonnegative(),
  summary: z.string(),
  summaryOriginal: z.string(),
  title: z.string().min(1),
  titleOriginal: z.string().min(1),
  translationState: z.enum(translationStates),
});

const feedSchema = z.object({
  availableSources: z.array(z.string()),
  fetchedAtUnixMs: z.number().int().nonnegative().nullable(),
  items: z.array(itemSchema),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
  source: z.string().min(1),
  stale: z.boolean(),
  totalCount: z.number().int().nonnegative(),
});

const imageSchema = z.object({ cachedPath: z.string().min(1) });

export async function fetchSpaceNews(
  locale: SupportedLocale,
  filters: NewsFeedFilters = {},
): Promise<NewsFeed> {
  return feedSchema.parse(await invoke("space_news_feed", {
    request: {
      contentTypes: filters.contentTypes,
      featured: filters.featured,
      limit: filters.limit ?? 30,
      locale,
      offset: filters.offset ?? 0,
      search: filters.search,
      sources: filters.sources,
    },
  }));
}

export async function fetchSpaceNewsDetail(
  newsId: string,
  locale: SupportedLocale,
): Promise<NewsItem> {
  return itemSchema.parse(await invoke("space_news_detail", { locale, newsId }));
}

export async function searchSpaceNews(
  query: string,
  locale: SupportedLocale,
  limit = 6,
): Promise<NewsItem[]> {
  const response = feedSchema.parse(await invoke("search_space_news", { limit, locale, query }));
  return response.items;
}

export async function fetchSpaceNewsForRelation(
  relationType: NewsRelationType,
  externalId: string,
  locale: SupportedLocale,
  limit = 6,
): Promise<NewsFeed> {
  return feedSchema.parse(await invoke("space_news_for_relation", {
    externalId,
    limit,
    locale,
    relationType,
  }));
}

export async function resolveNewsImage(newsId: string): Promise<string> {
  const response = imageSchema.parse(await invoke("space_news_image", { newsId }));
  return convertFileSrc(response.cachedPath);
}

export async function clearSpaceNewsTranslations(): Promise<void> {
  await invoke("clear_space_news_translations");
}
