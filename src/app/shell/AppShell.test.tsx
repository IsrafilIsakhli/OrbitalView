import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppProviders } from "@/app/providers/AppProviders";
import {
  defaultPreferences,
  usePreferencesStore,
} from "@/features/settings/model/preferences";
import { i18n } from "@/shared/i18n/i18n";
import { useWorkspaceCoordinator } from "./model/workspaceCoordinator";

import { AppShell } from "./AppShell";

vi.mock("@/features/earth-engine/ui/EarthViewport", async () => {
  const { useTranslation } = await import("react-i18next");

  return {
    EarthViewport: () => {
      const { t } = useTranslation("earth");
      return (
        <section aria-label={t("regionLabel")}>
          <h1>{t("title")}</h1>
          <span>{t("telemetry.quality")}</span>
        </section>
      );
    },
  };
});

vi.mock("@/features/nasa/ui/NasaDashboard", async () => {
  const { useTranslation } = await import("react-i18next");

  return {
    NasaDashboard: () => {
      const { t } = useTranslation("nasa");
      return (
        <section>
          <h1>{t("title")}</h1>
          <span>{t("summary.title")}</span>
        </section>
      );
    },
  };
});

function renderShell() {
  return render(
    <AppProviders>
      <AppShell />
    </AppProviders>,
  );
}

describe("AppShell", () => {
  beforeEach(async () => {
    window.localStorage.clear();
    usePreferencesStore.setState(defaultPreferences);
    useWorkspaceCoordinator.getState().reset();
    await i18n.changeLanguage("en");
  });

  it("renders the intelligence overview and preserves the Earth workspace", async () => {
    const user = userEvent.setup();
    renderShell();

    expect(screen.getByRole("heading", { name: "Operational overview" })).toBeInTheDocument();
    expect(screen.getByText("Current mission and orbital status from verified aerospace providers.")).toBeInTheDocument();
    expect(screen.getAllByText("Orbital Vision").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "Earth & Satellites" }));
    expect(await screen.findByRole("heading", { name: "Earth" })).toBeInTheDocument();
    expect(screen.getByText("Adaptive quality")).toBeInTheDocument();
  });

  it("opens settings and persists a graphics preference", async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole("button", { name: "Settings" }));
    const ultraButton = screen.getByRole("button", { name: "Ultra" });
    await user.click(ultraButton);

    expect(ultraButton).toHaveAttribute("aria-pressed", "true");
    expect(usePreferencesStore.getState().graphicsQuality).toBe("high");
  });

  it("changes every visible label when the locale changes", async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole("button", { name: "Language" }));
    await user.click(screen.getByRole("radio", { name: /Español/ }));
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(
      await screen.findByRole("heading", { name: "Resumen operativo" }),
    ).toBeInTheDocument();
    expect(usePreferencesStore.getState().locale).toBe("es");
    expect(document.documentElement.lang).toBe("es");
  });
});
