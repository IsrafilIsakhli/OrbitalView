import { ArrowClockwise24Regular, News24Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";

export function NewsErrorState({ empty = false, onRetry }: { empty?: boolean; onRetry?: () => void }) {
  const { t } = useTranslation("news");
  return (
    <section className="space-news-state glass-surface">
      <News24Regular aria-hidden />
      <h2>{t(empty ? "empty.title" : "error.title")}</h2>
      <p>{t(empty ? "empty.description" : "error.description")}</p>
      {onRetry && <button onClick={onRetry} type="button"><ArrowClockwise24Regular aria-hidden />{t("actions.retry")}</button>}
    </section>
  );
}
