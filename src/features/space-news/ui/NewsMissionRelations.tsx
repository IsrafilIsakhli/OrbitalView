import { CalendarLtr20Regular, Rocket20Regular } from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";

import type { NewsRelation } from "../domain/news";

interface NewsMissionRelationsProps {
  compact?: boolean;
  onOpenEvent?: (id: string) => void;
  onOpenLaunch?: (id: string) => void;
  relations: NewsRelation[];
}

export function NewsMissionRelations({
  compact = false,
  onOpenEvent,
  onOpenLaunch,
  relations,
}: NewsMissionRelationsProps) {
  const { t } = useTranslation("news");
  if (relations.length === 0) return null;
  return (
    <div className="news-relations" data-compact={compact}>
      {relations.slice(0, compact ? 2 : 8).map((relation) => {
        const Icon = relation.relationType === "launch" ? Rocket20Regular : CalendarLtr20Regular;
        const action = relation.relationType === "launch" ? onOpenLaunch : onOpenEvent;
        return (
          <button
            disabled={!action}
            key={`${relation.relationType}:${relation.externalId}`}
            onClick={() => action?.(relation.externalId)}
            title={relation.provider}
            type="button"
          >
            <Icon aria-hidden />
            {t(`relations.${relation.relationType}`)}
          </button>
        );
      })}
    </div>
  );
}
