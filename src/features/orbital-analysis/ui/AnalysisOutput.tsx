import { CheckmarkCircle24Regular, DataUsage24Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";

import { usePreferencesStore } from "@/features/settings/model/preferences";
import { formatDateTime, formatNumber } from "@/shared/i18n/formatters";

import type { AnalysisEnvelope } from "../domain/analysis";

interface AnalysisRunSummaryProps {
  envelope: AnalysisEnvelope<unknown>;
  resultCount: number;
  resultLabel: string;
}

export function AnalysisRunSummary({ envelope, resultCount, resultLabel }: AnalysisRunSummaryProps) {
  const { t } = useTranslation("orbitalAnalysis");
  const locale = usePreferencesStore((state) => state.locale);

  return (
    <section aria-label={t("output.summary")} className="analysis-run-summary">
      <div className="analysis-run-summary__state">
        <CheckmarkCircle24Regular aria-hidden />
        <div>
          <span>{t("output.complete")}</span>
          <strong>{resultLabel}</strong>
        </div>
      </div>
      <div className="analysis-run-summary__count">
        <DataUsage24Regular aria-hidden />
        <strong>{formatNumber(resultCount, locale)}</strong>
        <span>{t("output.records")}</span>
      </div>
      <dl>
        <div><dt>{t("header.model")}</dt><dd>{envelope.model}</dd></div>
        <div><dt>{t("header.frame")}</dt><dd>{envelope.frame}</dd></div>
        <div><dt>{t("output.generated")}</dt><dd>{formatDateTime(envelope.generatedAtUnixMs, locale, "utc-only").primary}</dd></div>
        <div><dt>{t("output.advisories")}</dt><dd>{formatNumber(envelope.warnings.filter((warning) => warning.code !== "catalog-stale").length, locale)}</dd></div>
      </dl>
    </section>
  );
}

interface AnalysisMetricProps {
  emphasis?: "primary" | "standard";
  label: string;
  source?: "derived" | "source";
  value: string;
}

export function AnalysisMetric({ emphasis = "standard", label, source, value }: AnalysisMetricProps) {
  const { t } = useTranslation("orbitalAnalysis");
  return (
    <article className="analysis-metric" data-emphasis={emphasis}>
      <span>{label}</span>
      <strong>{value}</strong>
      {source ? <small>{t(source === "source" ? "dynamics.sourceData" : "dynamics.derived")}</small> : null}
    </article>
  );
}

export function AnalysisSectionHeading({ description, title }: { description?: string; title: string }) {
  return (
    <header className="analysis-section-heading">
      <div>
        <span aria-hidden />
        <h2>{title}</h2>
      </div>
      {description ? <p>{description}</p> : null}
    </header>
  );
}
