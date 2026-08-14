import {
  Alert24Regular,
  ArrowClockwise24Regular,
  CalendarClock24Regular,
  Globe24Regular,
  Image24Regular,
  Open24Regular,
  WeatherRain24Regular,
} from "@fluentui/react-icons";
import { openExternalUrl } from "@/shared/security/externalUrl";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { usePreferencesStore } from "@/features/settings/model/preferences";
import { formatDistanceFromKm, formatOrbitalSpeed } from "@/shared/formatting/units";
import { RemoteMediaImage } from "@/shared/ui/RemoteMediaImage";
import {
  formatCompactDate,
  formatDateTime as formatSharedDateTime,
} from "@/shared/i18n/formatters";

import { useNasaIntelligence } from "../api/useNasaIntelligence";
import type {
  DonkiEvent,
  NasaComponentMetadata,
  NearEarthApproach,
} from "../domain/nasa";

export function NasaDashboard() {
  const { i18n, t } = useTranslation("nasa");
  const query = useNasaIntelligence();
  const locale = i18n.resolvedLanguage ?? "en";
  const units = usePreferencesStore((state) => state.units);

  if (query.isPending) {
    return <NasaState kind="loading" />;
  }
  if (query.isError) {
    return <NasaState kind="error" onRetry={() => void query.refetch()} />;
  }
  const intelligence = query.data;
  const apodImage = intelligence.apod?.mediaType === "image"
    ? intelligence.apod.url
    : intelligence.apod?.thumbnailUrl;

  return (
    <section className="nasa-dashboard">
      <div aria-hidden className="nasa-dashboard__aurora" />
      <header className="nasa-page-header">
        <div>
          <p className="eyebrow"><span />{t("eyebrow")}</p>
          <h1>{t("title")}</h1>
          <p>{t("subtitle")}</p>
        </div>
        <div className="nasa-provider-state" data-status={intelligence.overallStatus}>
          <i />
          <span>{t(`status.${intelligence.overallStatus}`)}</span>
          <small>{t("source")}</small>
        </div>
      </header>

      {!intelligence.apiKeyConfigured && (
        <div className="nasa-config-notice" role="status">
          <Alert24Regular aria-hidden />
          <div><strong>{t("configuration.title")}</strong><p>{t("configuration.description")}</p></div>
        </div>
      )}

      <div className="nasa-overview-grid">
        <motion.article
          animate={{ opacity: 1, y: 0 }}
          className="nasa-apod glass-surface"
          initial={{ opacity: 0, y: 8 }}
        >
          <div className="nasa-apod__visual">
            <RemoteMediaImage
              alt={intelligence.apod?.title ?? ""}
              fallback={<span><Image24Regular aria-hidden /></span>}
              provider="nasa"
              url={apodImage}
            />
            <div aria-hidden className="nasa-apod__scrim" />
            <small>{t("apod.label")}</small>
          </div>
          <div className="nasa-apod__body">
            {intelligence.apod ? (
              <>
                <div className="nasa-card-topline">
                  <time>{formatDate(intelligence.apod.date, locale)}</time>
                  <ProviderBadge metadata={intelligence.components.apod} />
                </div>
                <h2>{intelligence.apod.title}</h2>
                <p>{intelligence.apod.explanation}</p>
                <div className="nasa-apod__footer">
                  <span>{intelligence.apod.copyright
                    ? t("apod.credit", { credit: intelligence.apod.copyright })
                    : t("apod.publicDomain")}</span>
                  {intelligence.apod.url && (
                    <button onClick={() => void openExternal(intelligence.apod!.url)} type="button">
                      <Open24Regular aria-hidden />{t("actions.openMedia")}
                    </button>
                  )}
                </div>
              </>
            ) : (
              <EmptyState icon={<Image24Regular aria-hidden />} text={t("apod.unavailable")} />
            )}
          </div>
        </motion.article>

        <article className="nasa-summary glass-surface">
          <header>
            <div><small>{t("summary.label")}</small><h2>{t("summary.title")}</h2></div>
            <Globe24Regular aria-hidden />
          </header>
          <div className="nasa-summary__metrics">
            <Metric label={t("summary.approaches")} value={intelligence.approaches.length} />
            <Metric label={t("summary.spaceWeather")} value={intelligence.spaceWeatherEvents.length} />
            <Metric label={t("summary.sourcesReady")} value={
              Object.values(intelligence.components).filter((component) => component.status !== "unavailable").length
            } suffix="/5" />
          </div>
          <div className="nasa-source-matrix">
            {Object.values(intelligence.components).map((component) => (
              <div data-status={component.status} key={component.name}>
                <i />
                <span>{t(`components.${component.name}`)}</span>
                <small>{t(`status.${component.status}`)}</small>
              </div>
            ))}
          </div>
          <p className="nasa-summary__footnote">
            {t("summary.retrieved", { date: formatDateTime(intelligence.retrievedAt, locale) })}
          </p>
        </article>
      </div>

      <div className="nasa-intelligence-grid">
        <section className="nasa-feed glass-surface">
          <header>
            <div><small>{t("neo.label")}</small><h2>{t("neo.title")}</h2></div>
            <CalendarClock24Regular aria-hidden />
          </header>
          {intelligence.approaches.length > 0 ? (
            <div className="nasa-feed__list">
              {intelligence.approaches.slice(0, 7).map((approach) => (
                <NeoRow approach={approach} key={`${approach.id}:${approach.approachAt}`} locale={locale} units={units} />
              ))}
            </div>
          ) : (
            <EmptyState icon={<Globe24Regular aria-hidden />} text={t("neo.empty")} />
          )}
          <footer><ProviderBadge metadata={intelligence.components.neo} /></footer>
        </section>

        <section className="nasa-feed glass-surface">
          <header>
            <div><small>{t("donki.label")}</small><h2>{t("donki.title")}</h2></div>
            <WeatherRain24Regular aria-hidden />
          </header>
          {intelligence.spaceWeatherEvents.length > 0 ? (
            <div className="nasa-feed__list">
              {intelligence.spaceWeatherEvents.slice(0, 8).map((event) => (
                <DonkiRow event={event} key={event.id} locale={locale} />
              ))}
            </div>
          ) : (
            <EmptyState icon={<WeatherRain24Regular aria-hidden />} text={t("donki.empty")} />
          )}
          <footer><span>{t("donki.window")}</span></footer>
        </section>
      </div>
    </section>
  );
}

function NeoRow({ approach, locale, units }: { approach: NearEarthApproach; locale: string; units: "metric" | "imperial" }) {
  const { t } = useTranslation("nasa");
  return (
    <article className="nasa-feed-row">
      <span className="nasa-feed-row__index"><Globe24Regular aria-hidden /></span>
      <div>
        <div><strong>{approach.name}</strong><time>{formatDateTime(approach.approachAt, locale)}</time></div>
        <p>
          {t("neo.distance", { value: formatDistance(approach.missDistanceKm, locale, units) })}
          <span />
          {t("neo.velocity", { value: formatVelocity(approach.relativeVelocityKps, locale, units) })}
        </p>
      </div>
      <span className="nasa-object-state" data-hazardous={approach.potentiallyHazardous}>
        {t(approach.potentiallyHazardous ? "neo.designated" : "neo.monitored")}
      </span>
    </article>
  );
}

function DonkiRow({ event, locale }: { event: DonkiEvent; locale: string }) {
  const { t } = useTranslation("nasa");
  return (
    <article className="nasa-feed-row nasa-feed-row--weather">
      <span className="nasa-feed-row__index"><WeatherRain24Regular aria-hidden /></span>
      <div>
        <div>
          <strong>{t(`donki.types.${event.eventType}`)}</strong>
          <time>{formatDateTime(event.occurredAt, locale)}</time>
        </div>
        <p>{event.location ?? t("donki.locationUnavailable")}{event.magnitudeLabel && <><span />{event.magnitudeLabel}</>}</p>
      </div>
      {event.link && (
        <button aria-label={t("actions.openEvent")} onClick={() => void openExternal(event.link!)} type="button">
          <Open24Regular aria-hidden />
        </button>
      )}
    </article>
  );
}

function Metric({ label, value, suffix = "" }: { label: string; value: number; suffix?: string }) {
  return <div><strong>{value}<small>{suffix}</small></strong><span>{label}</span></div>;
}

function ProviderBadge({ metadata }: { metadata: NasaComponentMetadata }) {
  const { t } = useTranslation("nasa");
  return <span className="nasa-provider-badge" data-status={metadata.status}><i />{t(`status.${metadata.status}`)}</span>;
}

function EmptyState({ icon, text }: { icon: ReactNode; text: string }) {
  return <div className="nasa-empty">{icon}<p>{text}</p></div>;
}

function NasaState({
  kind,
  onRetry,
}: {
  kind: "loading" | "error";
  onRetry?: () => void;
}) {
  const { t } = useTranslation("nasa");
  return (
    <section className="launch-state nasa-state">
      <span className="launch-state__orbit"><Globe24Regular aria-hidden /></span>
      <p className="eyebrow">{t("eyebrow")}</p>
      <h1>{t(`${kind}.title`)}</h1>
      <p>{t(`${kind}.description`)}</p>
      {kind === "error" && (
        <button onClick={onRetry} type="button"><ArrowClockwise24Regular aria-hidden />{t("actions.retry")}</button>
      )}
    </section>
  );
}

function formatDate(value: string, locale: string): string {
  return formatCompactDate(value, locale);
}

function formatDateTime(value: string, locale: string): string {
  return formatSharedDateTime(value, locale, "utc-only", {
    year: undefined,
  }).primary;
}

function formatDistance(value: number | null, locale: string, units: "metric" | "imperial"): string {
  return value === null
    ? "—"
    : formatDistanceFromKm(value, units, locale, 0);
}

function formatVelocity(value: number | null, locale: string, units: "metric" | "imperial"): string {
  return value === null
    ? "—"
    : formatOrbitalSpeed(value, units, locale, 1);
}

async function openExternal(url: string): Promise<void> {
  await openExternalUrl(url).catch(() => undefined);
}
