import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { i18n } from "@/shared/i18n/i18n";

import { NewsTranslationStatus } from "./NewsTranslationStatus";

describe("NewsTranslationStatus", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("exposes pending translation state as localized text", () => {
    render(<NewsTranslationStatus state="pending" />);
    expect(screen.getByText(/translation pending/i)).toHaveAttribute("data-state", "pending");
  });

  it("updates immediately when the active locale changes", async () => {
    const view = render(<NewsTranslationStatus state="cached" />);
    expect(screen.getByText("Machine translated")).toBeInTheDocument();

    await i18n.changeLanguage("tr");
    view.rerender(<NewsTranslationStatus state="cached" />);
    expect(screen.getByText("Makine çevirisi")).toBeInTheDocument();
  });
});
