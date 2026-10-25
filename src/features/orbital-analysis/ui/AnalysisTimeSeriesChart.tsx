import { useEffect, useRef } from "react";
import type UPlotInstance from "uplot";

import { formatDateTime, formatNumber } from "@/shared/i18n/formatters";

export interface AnalysisSeries {
  color: string;
  dash?: number[];
  label: string;
  spanGaps?: boolean;
  values: Array<number | null>;
}

interface AnalysisTimeSeriesChartProps {
  ariaLabel: string;
  locale: string;
  onCursorIndexChange?: (index: number) => void;
  selectedIndex?: number;
  series: AnalysisSeries[];
  timestampsUnixMs: number[];
  unit: string;
}

export function AnalysisTimeSeriesChart({
  ariaLabel,
  locale,
  onCursorIndexChange,
  selectedIndex = 0,
  series,
  timestampsUnixMs,
  unit,
}: AnalysisTimeSeriesChartProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<UPlotInstance | null>(null);
  const selectedIndexRef = useRef(selectedIndex);

  useEffect(() => {
    selectedIndexRef.current = selectedIndex;
    const plot = plotRef.current;
    const timestamp = timestampsUnixMs[selectedIndex];
    if (plot && timestamp !== undefined) {
      plot.setCursor({ left: plot.valToPos(timestamp / 1_000, "x"), top: 100 }, false);
    }
  }, [selectedIndex, timestampsUnixMs]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || timestampsUnixMs.length < 2) return;
    let disposed = false;
    let plot: UPlotInstance | null = null;
    let observer: ResizeObserver | null = null;
    let resizing = false;
    void Promise.all([import("uplot"), import("uplot/dist/uPlot.min.css")]).then(
      ([module]) => {
        if (disposed || !hostRef.current) return;
        const UPlot = module.default;
        const data = [
          timestampsUnixMs.map((value) => value / 1_000),
          ...series.map((entry) => entry.values.map((value) => value !== null && Number.isFinite(value) ? value : null)),
        ] as UPlotInstance.AlignedData;
        plot = new UPlot(
          {
            axes: [
              { grid: { stroke: "rgba(151,190,224,.08)" }, stroke: "#70849a" },
              { grid: { stroke: "rgba(151,190,224,.08)" }, stroke: "#70849a" },
            ],
            height: 250,
            hooks: {
              ready: [(self) => {
                const index = Math.min(timestampsUnixMs.length - 1, Math.max(0, selectedIndexRef.current));
                self.setCursor({
                  left: self.valToPos(timestampsUnixMs[index]! / 1_000, "x"),
                  top: 100,
                }, false);
              }],
              ...(onCursorIndexChange ? { setCursor: [(self) => {
                if (!resizing && typeof self.cursor.idx === "number") onCursorIndexChange(self.cursor.idx);
              }] } : {}),
            },
            legend: { show: true },
            scales: { x: { time: true } },
            series: [
              {},
              ...series.map((entry) => ({
                ...(entry.dash ? { dash: entry.dash } : {}),
                label: entry.label,
                spanGaps: entry.spanGaps ?? false,
                stroke: entry.color,
                value: (_self: unknown, value: number | null) =>
                  value === null || !Number.isFinite(value)
                    ? "—"
                    : `${formatNumber(value, locale, { maximumFractionDigits: 3 })} ${unit}`,
                width: 1.6,
              })),
            ],
            width: Math.max(1, host.clientWidth),
          },
          data,
          host,
        );
        plotRef.current = plot;
        observer = new ResizeObserver((entries) => {
          const entry = entries[0];
          if (!plot || !entry) return;
          resizing = true;
          plot.setSize({
            height: entry.contentRect.width < 520 ? 220 : 250,
            width: Math.max(1, Math.floor(entry.contentRect.width)),
          });
          resizing = false;
        });
        observer.observe(host);
      },
    ).catch(() => { if (!disposed) host.replaceChildren(); });
    return () => {
      disposed = true;
      observer?.disconnect();
      plot?.destroy();
      if (plotRef.current === plot) plotRef.current = null;
      host.replaceChildren();
    };
  }, [locale, onCursorIndexChange, series, timestampsUnixMs, unit]);

  const stride = Math.max(1, Math.ceil(timestampsUnixMs.length / 40));
  return (
    <div className="analysis-chart-shell">
      <div aria-label={ariaLabel} className="analysis-chart" ref={hostRef} role="img" />
      <details className="analysis-chart-table">
        <summary>{ariaLabel}</summary>
        <div className="analysis-table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">UTC</th>
                {series.map((entry) => <th key={entry.label} scope="col">{entry.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {timestampsUnixMs.filter((_value, index) => index % stride === 0).map((timestamp, row) => {
                const index = row * stride;
                return (
                  <tr key={timestamp}>
                    <td>{formatDateTime(timestamp, locale, "utc-only").primary}</td>
                    {series.map((entry) => (
                      <td key={entry.label}>{formatChartValue(entry.values[index], locale, unit)}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function formatChartValue(value: number | null | undefined, locale: string, unit: string): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${formatNumber(value, locale, { maximumFractionDigits: 3 })} ${unit}`;
}
