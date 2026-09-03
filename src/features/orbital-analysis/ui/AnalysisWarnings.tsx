import { Warning24Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";

import type { AnalysisWarning } from "../domain/analysis";

export function AnalysisWarnings({ warnings }: { warnings: AnalysisWarning[] }) {
  const { t } = useTranslation("orbitalAnalysis");
  const visibleWarnings = warnings.filter((warning) => warning.code !== "catalog-stale");
  const pageSize = 50;
  const groups = [...new Set(visibleWarnings.map((warning) => warning.code))];
  if (visibleWarnings.length === 0) return null;
  return (
    <aside aria-label={t("output.advisories")} className="analysis-warnings">
      <header>
        <Warning24Regular aria-hidden />
        <div><strong>{t("output.advisories")}</strong><span>{t("output.advisoryCount", { count: visibleWarnings.length })}</span></div>
      </header>
      <div>
        {visibleWarnings.slice(0, pageSize).map((warning, index) => (
          <p key={`${warning.code}:${warning.objectId ?? index}`}>
            <span aria-hidden />
            <span>{t(`warnings.${warning.code}`)}{warning.objectId ? <small>{warning.objectId}</small> : null}</span>
          </p>
        ))}
        {visibleWarnings.length > pageSize && groups.map((code) => (
          <p key={code}><span aria-hidden /><span>{t(`warnings.${code}`)}<small>{t("output.advisoryCount", { count: visibleWarnings.filter((warning) => warning.code === code).length })}</small></span></p>
        ))}
      </div>
    </aside>
  );
}
