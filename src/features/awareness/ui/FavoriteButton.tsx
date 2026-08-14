import { Star20Filled, Star20Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";

import type { FavoriteInput } from "../domain/awareness";
import { useAwarenessStore } from "../model/awarenessStore";

interface FavoriteButtonProps {
  className?: string;
  favorite: FavoriteInput;
  showLabel?: boolean;
}

export function FavoriteButton({
  className = "favorite-button",
  favorite,
  showLabel = false,
}: FavoriteButtonProps) {
  const { t } = useTranslation("awareness");
  const active = useAwarenessStore((state) => state.favorites.some(
    (item) => item.kind === favorite.kind && item.id === favorite.id,
  ));
  const toggleFavorite = useAwarenessStore((state) => state.toggleFavorite);
  const label = t(active ? "favorites.remove" : "favorites.add");

  return (
    <button
      aria-label={label}
      aria-pressed={active}
      className={className}
      data-active={active}
      onClick={() => toggleFavorite(favorite)}
      title={label}
      type="button"
    >
      {active ? <Star20Filled aria-hidden /> : <Star20Regular aria-hidden />}
      {showLabel && <span>{label}</span>}
    </button>
  );
}
