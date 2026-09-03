import {
  Dismiss20Regular,
  Next20Regular,
  Pause20Regular,
  Play20Regular,
} from "@fluentui/react-icons";
import { useEffect, useMemo, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";

import type { LaunchRecord } from "@/features/launches/domain/launch";
import { formatDateTime, formatTime } from "@/shared/i18n/formatters";

import {
  TIME_LENS_HORIZON_MS,
  TIME_LENS_STEP_MS,
  clampTimeLensTimestamp,
  nextTimeLensEvent,
  timeLensProgress,
  timeLensRates,
  type TimeLensEvent,
} from "../time/orbitalTimeLens";

interface OrbitalTimeLensProps {
  currentUnixMs: number;
  launches: readonly LaunchRecord[];
  onClose: () => void;
  onPlayChange: (playing: boolean) => void;
  onResetToNow: () => void;
  onRateChange: (rate: number) => void;
  onScrub: (timestampUnixMs: number) => void;
  playing: boolean;
  rate: number;
  windowStartUnixMs: number;
}

export function OrbitalTimeLens({
  currentUnixMs,
  launches,
  onClose,
  onPlayChange,
  onResetToNow,
  onRateChange,
  onScrub,
  playing,
  rate,
  windowStartUnixMs,
}: OrbitalTimeLensProps) {
  const { i18n, t } = useTranslation("earth");
  const locale = i18n.resolvedLanguage ?? "en";
  const windowEndUnixMs = windowStartUnixMs + TIME_LENS_HORIZON_MS;
  const clampedCurrent = clampTimeLensTimestamp(
    currentUnixMs,
    windowStartUnixMs,
  );
  const progress = timeLensProgress(clampedCurrent, windowStartUnixMs);
  const events = useMemo<TimeLensEvent[]>(() => launches.flatMap((launch) => {
    const timestampUnixMs = Date.parse(launch.net);
    return Number.isFinite(timestampUnixMs) &&
        timestampUnixMs >= windowStartUnixMs &&
        timestampUnixMs <= windowEndUnixMs
      ? [{ id: launch.id, label: launch.name, timestampUnixMs }]
      : [];
  }), [launches, windowEndUnixMs, windowStartUnixMs]);
  const nextEvent = nextTimeLensEvent(events, clampedCurrent);

  useEffect(() => {
    if (currentUnixMs < windowEndUnixMs || !playing) return;
    onScrub(windowEndUnixMs);
  }, [currentUnixMs, onScrub, playing, windowEndUnixMs]);

  return (
    <section
      aria-label={t("timeLens.regionLabel")}
      className="orbital-time-lens glass-surface"
    >
      <header className="orbital-time-lens__header">
        <div>
          <span>{t("timeLens.eyebrow")}</span>
          <strong>{t("timeLens.title")}</strong>
        </div>
        <time dateTime={new Date(clampedCurrent).toISOString()}>
          {formatDateTime(clampedCurrent, locale, "utc-only", {
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            month: "short",
            second: "2-digit",
            year: undefined,
          }).primary}
        </time>
        <button
          aria-label={t("timeLens.close")}
          className="orbital-time-lens__close"
          onClick={onClose}
          type="button"
        >
          <Dismiss20Regular aria-hidden />
        </button>
      </header>

      <div className="orbital-time-lens__controls">
        <button
          aria-label={playing ? t("timeLens.pause") : t("timeLens.play")}
          className="orbital-time-lens__play"
          onClick={() => onPlayChange(!playing)}
          type="button"
        >
          {playing ? <Pause20Regular aria-hidden /> : <Play20Regular aria-hidden />}
        </button>
        <button
          className="orbital-time-lens__now"
          onClick={onResetToNow}
          type="button"
        >
          {t("timeLens.now")}
        </button>
        <div
          aria-label={t("timeLens.speed")}
          className="orbital-time-lens__rates"
          role="group"
        >
          {timeLensRates.map((candidate) => (
            <button
              aria-pressed={rate === candidate}
              key={candidate}
              onClick={() => onRateChange(candidate)}
              type="button"
            >
              {candidate}×
            </button>
          ))}
        </div>
        <button
          className="orbital-time-lens__next"
          disabled={!nextEvent}
          onClick={() => nextEvent && onScrub(nextEvent.timestampUnixMs)}
          type="button"
        >
          <Next20Regular aria-hidden />
          <span>{t("timeLens.nextEvent")}</span>
        </button>
      </div>

      <div className="orbital-time-lens__track">
        <input
          aria-label={t("timeLens.timeline")}
          max={windowEndUnixMs}
          min={windowStartUnixMs}
          onChange={(event) => onScrub(Number(event.currentTarget.value))}
          step={TIME_LENS_STEP_MS}
          style={{ "--time-lens-progress": `${progress * 100}%` } as CSSProperties}
          type="range"
          value={clampedCurrent}
        />
        <div className="orbital-time-lens__events">
          {events.slice(0, 12).map((event) => (
            <button
              aria-label={`${t("timeLens.launchEvent")}: ${event.label}`}
              key={event.id}
              onClick={() => onScrub(event.timestampUnixMs)}
              style={{ left: `${timeLensProgress(event.timestampUnixMs, windowStartUnixMs) * 100}%` }}
              title={`${event.label} · ${formatTime(event.timestampUnixMs, locale, "UTC")}`}
              type="button"
            />
          ))}
        </div>
        <div aria-hidden className="orbital-time-lens__ticks">
          {[0, 6, 12, 18, 24].map((hour) => (
            <span key={hour}>{hour === 0 ? t("timeLens.now") : `+${hour}h`}</span>
          ))}
        </div>
      </div>

      <footer>
        <span>{t("timeLens.model")}</span>
        <strong>{nextEvent?.label ?? t("timeLens.noEvents")}</strong>
      </footer>
    </section>
  );
}
