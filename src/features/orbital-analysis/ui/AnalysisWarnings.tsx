import { Warning24Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";

import type { AnalysisWarning } from "../domain/analysis";

export function AnalysisWarnings({ warnings }: { warnings: AnalysisWarning[] }) {
  const { t } = useTranslation("orbitalAnalysis");
  if (warnings.length === 0) return null;
  return (
    <aside aria-label={t("proximity.disclaimer")} className="analysis-warnings">
      {warnings.map((warning, index) => (
        <p key={`${warning.code}:${warning.objectId ?? index}`}>
          <Warning24Regular aria-hidden />
          <span>{t(`warnings.${warning.code}`)}</span>
        </p>
      ))}
    </aside>
  );
}
