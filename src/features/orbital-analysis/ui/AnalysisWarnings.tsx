import { Warning24Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";

import type { AnalysisWarning } from "../domain/analysis";

export function AnalysisWarnings({ warnings }: { warnings: AnalysisWarning[] }) {
  const { t } = useTranslation("orbitalAnalysis");
  const visibleWarnings = warnings.filter((warning) => warning.code !== "catalog-stale");
  const groups = [...new Set(visibleWarnings.map((warning) => warning.code))];
  if (visibleWarnings.length === 0) return null;
  return (
    <aside aria-label={t("output.advisories")} className="analysis-warnings">
      <header>
        <Warning24Regular aria-hidden />
        <div><strong>{t("output.advisories")}</strong><span>{t("output.advisoryCount", { count: visibleWarnings.length })}</span></div>
      </header>
      <div>
        {groups.map((code) => {
          const matching = visibleWarnings.filter((warning) => warning.code === code);
          const sampleIds = matching.flatMap((warning) => warning.objectId ? [warning.objectId] : []).slice(0, 3);
          return (
          <p key={code}>
            <span aria-hidden />
            <span>
              {t(`warnings.${code}`)}
              <small>
                {t("output.advisoryCount", { count: matching.length })}
                {sampleIds.length ? ` · ${sampleIds.join(", ")}` : ""}
              </small>
            </span>
          </p>
          );
        })}
      </div>
    </aside>
  );
}
