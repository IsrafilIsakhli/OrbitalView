import { describe, expect, it } from "vitest";

import {
  balanceNewsSources,
  newsArticleHost,
  newsContentTypes,
  safeNewsArticleUrl,
  summarizeNewsFeed,
  translationStates,
  type NewsItem,
} from "./news";

function item(id: string, source: string): NewsItem {
  return {
    articleUrl: `https://example.com/${id}`,
    authors: [],
    contentType: "article",
    featured: false,
    id,
    imageCachePath: null,
    imageUrlAvailable: false,
    publishedAtUnixMs: 0,
    relations: [],
    source,
    sourceUpdatedAtUnixMs: 0,
    summary: id,
    summaryOriginal: id,
    title: id,
    titleOriginal: id,
    translationState: "original",
  };
}

describe("space news domain", () => {
  it("keeps provider content and translation states bounded", () => {
    expect(newsContentTypes).toEqual(["article", "blog", "report"]);
    expect(translationStates).toContain("pending");
    expect(translationStates).toContain("original");
  });

  it("only accepts HTTPS article destinations", () => {
    expect(safeNewsArticleUrl("https://example.com/story")).toBe("https://example.com/story");
    expect(safeNewsArticleUrl("http://example.com/story")).toBeNull();
    expect(safeNewsArticleUrl("javascript:alert(1)")).toBeNull();
    expect(newsArticleHost("https://www.example.com/story")).toBe("example.com");
    expect(newsArticleHost("http://example.com/story")).toBeNull();
  });

  it("summarizes only real loaded feed properties", () => {
    const translated = {
      ...item("translated", "SpaceNews"),
      imageUrlAvailable: true,
      relations: [{ externalId: "launch-1", provider: "ll2", relationType: "launch" as const }],
      translationState: "cached" as const,
    };
    const summary = summarizeNewsFeed([translated, item("original", "NASA")]);
    expect(summary).toEqual({
      imageCount: 1,
      linkedCount: 1,
      loadedCount: 2,
      sourceCount: 2,
      translatedCount: 1,
    });
  });

  it("limits consecutive source dominance without inventing or dropping items", () => {
    const input = [item("a1", "A"), item("a2", "A"), item("a3", "A"), item("b1", "B")];
    const output = balanceNewsSources(input);

    expect(output.map(({ id }) => id)).toEqual(["a1", "a2", "b1", "a3"]);
    expect(new Set(output.map(({ id }) => id))).toEqual(new Set(input.map(({ id }) => id)));
    expect(input.map(({ id }) => id)).toEqual(["a1", "a2", "a3", "b1"]);
  });
});
