import { Checkmark20Filled, Dismiss20Regular } from "@fluentui/react-icons";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { usePreferencesStore } from "@/features/settings/model/preferences";
import {
  localeFlags,
  type SupportedLocale,
} from "@/shared/i18n/locales";
import { BrandMark } from "@/shared/ui/BrandMark";

interface LanguageDialogProps {
  onClose: () => void;
  open: boolean;
}

const languageOptions = [
  {
    locale: "az",
    nameKey: "language.az.name",
    descriptionKey: "language.az.description",
  },
  {
    locale: "tr",
    nameKey: "language.tr.name",
    descriptionKey: "language.tr.description",
  },
  {
    locale: "en",
    nameKey: "language.en.name",
    descriptionKey: "language.en.description",
  },
  {
    locale: "ru",
    nameKey: "language.ru.name",
    descriptionKey: "language.ru.description",
  },
  {
    locale: "es",
    nameKey: "language.es.name",
    descriptionKey: "language.es.description",
  },
] as const;

export function LanguageDialog({ open, onClose }: LanguageDialogProps) {
  const { t } = useTranslation(["common", "settings"]);
  const activeLocale = usePreferencesStore((state) => state.locale);
  const setLocale = usePreferencesStore((state) => state.setLocale);
  const [selection, setSelection] = useState<SupportedLocale>(activeLocale);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open) return;
    setSelection(activeLocale);
    dialog.showModal();

    return () => {
      if (dialog.open) dialog.close();
    };
  }, [activeLocale, open]);

  if (!open) return null;

  const confirmSelection = () => {
    setLocale(selection);
    onClose();
  };

  return (
    <dialog
      aria-labelledby="language-dialog-title"
      className="language-dialog glass-surface"
      onCancel={onClose}
      ref={dialogRef}
    >
      <div className="dialog-heading">
        <BrandMark className="dialog-heading__mark" />
        <div>
          <p className="eyebrow">{t("common:brand.name")}</p>
          <h2 id="language-dialog-title">{t("settings:language.dialogTitle")}</h2>
          <p>{t("settings:language.dialogDescription")}</p>
        </div>
        <button aria-label={t("common:actions.close")} className="icon-button" onClick={onClose} type="button">
          <Dismiss20Regular aria-hidden />
        </button>
      </div>

      <div className="language-options" role="radiogroup">
        {languageOptions.map(({ locale, nameKey, descriptionKey }) => {
          const selected = locale === selection;
          return (
            <button
              aria-checked={selected}
              className="language-option"
              data-selected={selected}
              key={locale}
              onClick={() => setSelection(locale)}
              role="radio"
              type="button"
            >
              <span aria-hidden className="language-option__flag">{localeFlags[locale]}</span>
              <span className="language-option__copy">
                <strong>{t(`settings:${nameKey}`)}</strong>
                <span>{t(`settings:${descriptionKey}`)}</span>
              </span>
              <span className="language-option__selection">
                {selected && <Checkmark20Filled aria-hidden />}
              </span>
            </button>
          );
        })}
      </div>

      <footer className="dialog-actions">
        <button className="secondary-button" onClick={onClose} type="button">
          {t("common:actions.cancel")}
        </button>
        <button className="primary-button" onClick={confirmSelection} type="button">
          {t("common:actions.continue")}
        </button>
      </footer>
    </dialog>
  );
}
