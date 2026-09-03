import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LaunchRecord } from "@/features/launches/domain/launch";
import { i18n } from "@/shared/i18n/i18n";

import { OrbitalTimeLens } from "./OrbitalTimeLens";

describe("OrbitalTimeLens", () => {
  const start = Date.UTC(2026, 7, 28, 12);

  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("shows only real launches inside the forecast window", () => {
    renderLens({
      launches: [
        launch("inside", start + 60 * 60_000),
        launch("outside", start + 30 * 60 * 60_000),
      ],
    });

    expect(screen.getByRole("button", { name: /Launch event: inside/i }))
      .toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /outside/i }))
      .not.toBeInTheDocument();
  });

  it("exposes play, rate, scrub and live-time actions", async () => {
    const user = userEvent.setup();
    const onPlayChange = vi.fn();
    const onRateChange = vi.fn();
    const onResetToNow = vi.fn();
    const onScrub = vi.fn();
    renderLens({ onPlayChange, onRateChange, onResetToNow, onScrub });

    await user.click(screen.getByRole("button", { name: "Play orbital forecast" }));
    await user.click(screen.getByRole("button", { name: "10×" }));
    await user.click(screen.getByRole("button", { name: "NOW" }));
    fireEvent.change(screen.getByRole("slider"), {
      target: { value: start + 2 * 60 * 60_000 },
    });

    expect(onPlayChange).toHaveBeenCalledWith(true);
    expect(onRateChange).toHaveBeenCalledWith(10);
    expect(onResetToNow).toHaveBeenCalledOnce();
    expect(onScrub).toHaveBeenCalledWith(start + 2 * 60 * 60_000);
  });
});

function launch(name: string, timestampUnixMs: number): LaunchRecord {
  return {
    id: name,
    name,
    net: new Date(timestampUnixMs).toISOString(),
  } as LaunchRecord;
}

function renderLens(overrides: Partial<Parameters<typeof OrbitalTimeLens>[0]> = {}) {
  return render(<OrbitalTimeLens
    currentUnixMs={startValue()}
    launches={[]}
    onClose={vi.fn()}
    onPlayChange={vi.fn()}
    onRateChange={vi.fn()}
    onResetToNow={vi.fn()}
    onScrub={vi.fn()}
    playing={false}
    rate={60}
    windowStartUnixMs={startValue()}
    {...overrides}
  />);
}

function startValue(): number {
  return Date.UTC(2026, 7, 28, 12);
}

