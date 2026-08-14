import {
  Dismiss16Regular,
  Square16Regular,
  Subtract16Regular,
} from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";

import {
  closeWindow,
  minimizeWindow,
  toggleMaximizeWindow,
} from "@/shared/platform/window-controls";
import { usesNativeWindowFrame } from "@/shared/platform/desktopPlatform";
import { BrandMark } from "@/shared/ui/BrandMark";

export function TitleBar() {
  const { t } = useTranslation(["common", "shell"]);

  if (usesNativeWindowFrame()) return null;

  return (
    <header className="titlebar" data-tauri-drag-region>
      <div className="titlebar__brand" data-tauri-drag-region>
        <BrandMark className="titlebar__mark" />
        <span data-tauri-drag-region>{t("common:brand.name")}</span>
      </div>
      <div className="titlebar__drag-space" data-tauri-drag-region />
      <div className="window-controls">
        <button
          aria-label={t("shell:titlebar.minimize")}
          className="window-control"
          onClick={() => void minimizeWindow()}
          title={t("shell:titlebar.minimize")}
          type="button"
        >
          <Subtract16Regular />
        </button>
        <button
          aria-label={t("shell:titlebar.maximize")}
          className="window-control"
          onClick={() => void toggleMaximizeWindow()}
          title={t("shell:titlebar.maximize")}
          type="button"
        >
          <Square16Regular />
        </button>
        <button
          aria-label={t("shell:titlebar.close")}
          className="window-control window-control--close"
          onClick={() => void closeWindow()}
          title={t("shell:titlebar.close")}
          type="button"
        >
          <Dismiss16Regular />
        </button>
      </div>
    </header>
  );
}
