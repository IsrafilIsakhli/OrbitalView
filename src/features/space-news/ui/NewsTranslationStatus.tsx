import { LocalLanguage20Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";

import type { NewsTranslationState } from "../domain/news";

export function NewsTranslationStatus({ state }: { state: NewsTranslationState }) {
  const { t } = useTranslation("news");
  return (
    <span className="news-translation-status" data-state={state}>
      <LocalLanguage20Regular aria-hidden />
      {t(`translation.${state}`)}
    </span>
  );
}
