import { Search20Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";

import type { NewsContentType } from "../domain/news";

export type NewsTypeFilter = "all" | "featured" | NewsContentType;

interface SpaceNewsFiltersProps {
  activeSource: string;
  activeType: NewsTypeFilter;
  onSearchChange: (value: string) => void;
  onSourceChange: (value: string) => void;
  onTypeChange: (value: NewsTypeFilter) => void;
  search: string;
  sources: string[];
}

const filters: NewsTypeFilter[] = ["all", "article", "blog", "report", "featured"];

export function SpaceNewsFilters({
  activeSource,
  activeType,
  onSearchChange,
  onSourceChange,
  onTypeChange,
  search,
  sources,
}: SpaceNewsFiltersProps) {
  const { t } = useTranslation("news");
  return (
    <section className="space-news-filters glass-surface" aria-label={t("filters.label")}>
      <div className="space-news-filter-tabs">
        {filters.map((filter) => (
          <button
            aria-pressed={activeType === filter}
            data-active={activeType === filter}
            key={filter}
            onClick={() => onTypeChange(filter)}
            type="button"
          >
            {t(`filters.${filter}`)}
          </button>
        ))}
      </div>
      <label className="space-news-source-select">
        <span>{t("filters.source")}</span>
        <select onChange={(event) => onSourceChange(event.currentTarget.value)} value={activeSource}>
          <option value="">{t("filters.allSources")}</option>
          {sources.map((source) => <option key={source} value={source}>{source}</option>)}
        </select>
      </label>
      <label className="space-news-search">
        <Search20Regular aria-hidden />
        <span className="sr-only">{t("filters.search")}</span>
        <input
          onChange={(event) => onSearchChange(event.currentTarget.value)}
          placeholder={t("filters.search")}
          value={search}
        />
      </label>
    </section>
  );
}
