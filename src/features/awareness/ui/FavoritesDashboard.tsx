import {
  CalendarClock24Regular,
  Delete20Regular,
  Globe24Regular,
  Open20Regular,
  Rocket24Regular,
  Star24Filled,
} from "@fluentui/react-icons";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { formatDateTime } from "@/shared/i18n/formatters";
import { RemoteMediaImage } from "@/shared/ui/RemoteMediaImage";

import type { FavoriteItem, FavoriteKind } from "../domain/awareness";
import { useAwarenessStore } from "../model/awarenessStore";

interface FavoritesDashboardProps {
  onOpen: (favorite: FavoriteItem) => void;
}

const kindOrder: FavoriteKind[] = ["satellite", "launch", "event"];

export function FavoritesDashboard({ onOpen }: FavoritesDashboardProps) {
  const { i18n, t } = useTranslation("awareness");
  const favorites = useAwarenessStore((state) => state.favorites);
  const removeFavorite = useAwarenessStore((state) => state.removeFavorite);
  const locale = i18n.resolvedLanguage ?? "en";

  return (
    <section className="awareness-dashboard">
      <header className="awareness-header">
        <div>
          <p className="eyebrow"><span />{t("favorites.eyebrow")}</p>
          <h1>{t("favorites.title")}</h1>
          <p>{t("favorites.subtitle")}</p>
        </div>
        <span className="awareness-count"><Star24Filled aria-hidden /><strong>{favorites.length}</strong>{t("favorites.saved")}</span>
      </header>

      {favorites.length === 0 ? (
        <div className="awareness-empty glass-surface">
          <Star24Filled aria-hidden />
          <h2>{t("favorites.emptyTitle")}</h2>
          <p>{t("favorites.emptyBody")}</p>
        </div>
      ) : (
        <div className="favorite-sections">
          {kindOrder.map((kind) => {
            const items = favorites.filter((favorite) => favorite.kind === kind);
            if (items.length === 0) return null;
            return (
              <section className="favorite-section" key={kind}>
                <header><KindIcon kind={kind} /><h2>{t(`favorites.kind.${kind}`)}</h2><span>{items.length}</span></header>
                <div className="favorite-grid">
                  {items.map((favorite, index) => (
                    <motion.article
                      animate={{ opacity: 1, y: 0 }}
                      className="favorite-card glass-surface"
                      initial={{ opacity: 0, y: 8 }}
                      key={`${favorite.kind}:${favorite.id}`}
                      transition={{ delay: Math.min(index * 0.025, 0.2) }}
                    >
                      <FavoriteVisual favorite={favorite} />
                      <div className="favorite-card__body">
                        <small>{t(`favorites.kind.${favorite.kind}`)}</small>
                        <h3>{favorite.title}</h3>
                        <p>{favorite.subtitle ?? t("common.unknown")}</p>
                        {favorite.occurredAt && <time>{formatDate(favorite.occurredAt, locale)}</time>}
                        <div>
                          <button onClick={() => onOpen(favorite)} type="button"><Open20Regular aria-hidden />{t("favorites.open")}</button>
                          <button aria-label={t("favorites.remove")} onClick={() => removeFavorite(favorite.kind, favorite.id)} type="button"><Delete20Regular aria-hidden /></button>
                        </div>
                      </div>
                    </motion.article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}

function FavoriteVisual({ favorite }: { favorite: FavoriteItem }) {
  if (favorite.imageUrl) {
    return <RemoteMediaImage alt="" className="favorite-card__image" fallback={<span className="favorite-card__visual"><KindIcon kind={favorite.kind} /></span>} provider="launchLibrary" url={favorite.imageUrl} />;
  }
  return <span className="favorite-card__visual"><KindIcon kind={favorite.kind} /></span>;
}

function KindIcon({ kind }: { kind: FavoriteKind }) {
  if (kind === "satellite") return <Globe24Regular aria-hidden />;
  if (kind === "launch") return <Rocket24Regular aria-hidden />;
  return <CalendarClock24Regular aria-hidden />;
}

function formatDate(iso: string, locale: string): string {
  return formatDateTime(iso, locale, "utc-only").primary;
}
