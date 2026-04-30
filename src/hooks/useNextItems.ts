import { useMemo } from "react";
import { useItems } from "./useItems";
import { useImpactRankingCache } from "./useValidation";
import { useLabelWeights, useScopeWeights } from "./usePrefs";
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

export type SortMode = "score" | "impact";

export interface ScoredItem {
  item: Item;
  score: number;
  impactScore: number;
  unblocks: number;
  ready: boolean;
  blockedBy: string[];
  labelMultiplier: number;
  scopeMultiplier: number;
  matchedLabels: string[];
}

export function useNextItems(repoId: string, sortMode: SortMode = "score"): ScoredItem[] {
  const { data: items } = useItems(repoId, undefined);
  const { data: impactData } = useImpactRankingCache(repoId);
  const { weights } = useLabelWeights(repoId);
  const { weights: scopeWeights } = useScopeWeights(repoId);

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

        // Label multipliers — product of all configured matching labels
        const matchedLabels: string[] = [];
        let labelMultiplier = 1;
        for (const { label } of weights) {
          if (itemLabels.includes(label)) {
            labelMultiplier *= weightMap.get(label) ?? 1;
            matchedLabels.push(label);
          }
        }

        // Scope multiplier
        const scopeMultiplier = scopeWeights[item.scope] ?? 1;

        const priorityWeight = PRIORITY_WEIGHT[item.priority ?? "Nenhuma"] ?? 1;
        const createdMs = item.created_date ? new Date(item.created_date).getTime() : 0;
        const ageDays = createdMs > 0 ? Math.floor((now - createdMs) / 86_400_000) : 0;
        const unblocks = impactMap.get(item.id) ?? 0;

        const weightedScore = priorityWeight * labelMultiplier * scopeMultiplier;
        const score = weightedScore * 1000 + unblocks * 10 + ageDays;
        const impactScore = unblocks * 1000 + weightedScore * 10 + ageDays;

        return {
          item,
          score,
          impactScore,
          unblocks,
          ready: blockedBy.length === 0,
          blockedBy,
          labelMultiplier,
          scopeMultiplier,
          matchedLabels,
        };
      })
      .sort((a, b) => {
        if (a.ready !== b.ready) { return a.ready ? -1 : 1; }
        const key = sortMode === "impact" ? "impactScore" : "score";
        return b[key] - a[key];
      });
  }, [items, impactData, weights, sortMode]);
}
