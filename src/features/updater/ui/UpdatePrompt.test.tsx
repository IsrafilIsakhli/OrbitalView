import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { initialAppUpdateState, useAppUpdateStore } from "@/features/updater/model/updateStore";
import { i18n } from "@/shared/i18n/i18n";

import { UpdatePrompt } from "./UpdatePrompt";

const release = {
  automatic: true,
  manualDownloadUrl: null,
  currentVersion: "1.0.0",
  date: null,
  minimumSupportedVersion: "1.0.0",
  notes: "Reliability improvements.",
  required: false,
  severity: "optional" as const,
  version: "1.1.0",
};

describe("UpdatePrompt", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    useAppUpdateStore.setState({
      ...initialAppUpdateState,
      promptOpen: true,
      release,
      status: "available",
    }, true);
  });

  afterEach(() => {
    useAppUpdateStore.setState(initialAppUpdateState, true);
  });

  it("lets the user defer an ordinary update", () => {
    render(<UpdatePrompt />);
    fireEvent.click(screen.getByText("Later", { selector: "button.secondary-button" }));
    expect(useAppUpdateStore.getState().promptOpen).toBe(false);
  });

  it("does not expose a dismiss action for a required update", () => {
    useAppUpdateStore.setState({
      release: {
        ...release,
        minimumSupportedVersion: "1.1.0",
        required: true,
        severity: "critical",
      },
    });
    render(<UpdatePrompt />);
    expect(screen.getByRole("heading", { name: "Update required" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Later" })).not.toBeInTheDocument();
  });
});
