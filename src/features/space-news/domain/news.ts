export const newsContentTypes = ["article", "blog", "report"] as const;
export type NewsContentType = (typeof newsContentTypes)[number];

export const translationStates = ["original", "cached", "pending", "failed"] as const;
export type NewsTranslationState = (typeof translationStates)[number];

export type NewsRelationType = "launch" | "event";

export interface NewsRelation {
  externalId: string;
  provider: string;
  relationType: NewsRelationType;
}

export interface NewsItem {
  articleUrl: string;
  authors: string[];
  contentType: NewsContentType;
  featured: boolean;
  id: string;
  imageCachePath: string | null;
  imageUrlAvailable: boolean;
  publishedAtUnixMs: number;
  relations: NewsRelation[];
  source: string;
  sourceUpdatedAtUnixMs: number;
  summary: string;
  summaryOriginal: string;
  title: string;
  titleOriginal: string;
  translationState: NewsTranslationState;
}

export interface NewsFeedFilters {
  contentTypes?: NewsContentType[];
  featured?: boolean;
  limit?: number;
  offset?: number;
  search?: string;
  sources?: string[];
}

export interface NewsFeed {
  availableSources: string[];
  fetchedAtUnixMs: number | null;
  items: NewsItem[];
  limit: number;
  offset: number;
  source: string;
  stale: boolean;
  totalCount: number;
}

export interface NewsFeedSummary {
  imageCount: number;
  linkedCount: number;
  loadedCount: number;
  sourceCount: number;
  translatedCount: number;
}

export function safeNewsArticleUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function newsArticleHost(value: string): string | null {
  const safeUrl = safeNewsArticleUrl(value);
  if (!safeUrl) return null;
  return new URL(safeUrl).hostname.replace(/^www\./i, "");
}

export function summarizeNewsFeed(items: readonly NewsItem[]): NewsFeedSummary {
  return {
    imageCount: items.filter((item) => item.imageUrlAvailable || item.imageCachePath).length,
    linkedCount: items.filter((item) => item.relations.length > 0).length,
    loadedCount: items.length,
    sourceCount: new Set(items.map((item) => item.source)).size,
    translatedCount: items.filter((item) => item.translationState === "cached").length,
  };
}

/**
 * Keeps the provider's chronological order while preventing one prolific source
 * from occupying more than two adjacent feed positions when alternatives exist.
 */
export function balanceNewsSources(items: readonly NewsItem[]): NewsItem[] {
  const remaining = [...items];
  const balanced: NewsItem[] = [];

  while (remaining.length > 0) {
    const previous = balanced[balanced.length - 1];
    const beforePrevious = balanced[balanced.length - 2];
    const repeatedSource = previous?.source && previous.source === beforePrevious?.source
      ? previous.source
      : null;
    const nextIndex = repeatedSource
      ? remaining.findIndex((item) => item.source !== repeatedSource)
      : 0;
    const selectedIndex = nextIndex >= 0 ? nextIndex : 0;
    const [selected] = remaining.splice(selectedIndex, 1);
    if (selected) balanced.push(selected);
  }

  return balanced;
}
