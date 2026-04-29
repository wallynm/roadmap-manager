import { useMemo } from "react";
import { useItems } from "./useItems";
import { useImpactRankingCache } from "./useValidation";
import { useLabelWeights } from "./usePrefs";
import type { Item } from "@/types";

const PRIORITY_WEIGHT: Record<string, number> = {
  Urgente: 5,
  Alta: 4,
  Média: 3,
  Baixa: 2,
  Nenhuma: 1,
};

const DONE_STATUSES = new Set(["done", "canceled", "duplicate"]);
const ACTIONABLE_STATUSES = new Set(["todo", "backlog"]);

export interface ScoredItem {
  item: Item;
  score: number;
  unblocks: number;
  ready: boolean;
  blockedBy: string[];
  labelMultiplier: number;
  matchedLabels: string[];
}

export function useNextItems(repoId: string): ScoredItem[] {
  const { data: items } = useItems(repoId, undefined);
  const { data: impactData } = useImpactRankingCache(repoId);
  const { weights } = useLabelWeights(repoId);

  return useMemo(() => {
    if (!items) {
      return [];
    }

    const byExternalId = new Map(items.map((i) => [i.external_id, i]));
    const byId = new Map(items.map((i) => [i.id, i]));
    const impactMap = new Map(impactData?.map((r) => [r.id, r.unblocks]) ?? []);
    const weightMap = new Map(weights.map((w) => [w.label, w.multiplier]));

    const now = Date.now();

    return items
      .filter((item) => ACTIONABLE_STATUSES.has(item.status))
      .map((item) => {
        let deps: string[] = [];
        try {
          deps = JSON.parse(item.depends_on);
        } catch {}

        const blockedBy = deps.filter((depId) => {
          const dep = byExternalId.get(depId) ?? byId.get(depId);
          return dep && !DONE_STATUSES.has(dep.status);
        });

        let itemLabels: string[] = [];
        try {
          itemLabels = JSON.parse(item.labels);
        } catch {}

        // Apply multipliers in configured order (product), falling back to 1 for unconfigured labels
        const matchedLabels: string[] = [];
        let labelMultiplier = 1;
        for (const { label } of weights) {
          if (itemLabels.includes(label)) {
            const m = weightMap.get(label) ?? 1;
            labelMultiplier *= m;
            matchedLabels.push(label);
          }
        }

        const priorityWeight = PRIORITY_WEIGHT[item.priority ?? "Nenhuma"] ?? 1;
        const createdMs = item.created_date ? new Date(item.created_date).getTime() : 0;
        const ageDays = createdMs > 0 ? Math.floor((now - createdMs) / 86_400_000) : 0;
        const unblocks = impactMap.get(item.id) ?? 0;

        const score = priorityWeight * labelMultiplier * 1000 + unblocks * 10 + ageDays;

        return {
          item,
          score,
          unblocks,
          ready: blockedBy.length === 0,
          blockedBy,
          labelMultiplier,
          matchedLabels,
        };
      })
      .sort((a, b) => {
        if (a.ready !== b.ready) {
          return a.ready ? -1 : 1;
        }
        return b.score - a.score;
      });
  }, [items, impactData, weights]);
}
