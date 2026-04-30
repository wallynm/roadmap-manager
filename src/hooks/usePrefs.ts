import { useCallback, useState, useEffect } from "react";
import type { Priority, ItemStatus } from "@/types";

const STORAGE_KEY = "roadmap-prefs-v1";

export type ViewId = "kanban" | "list" | "graph";

export interface ActiveFilters {
  statuses: ItemStatus[];
  priorities: Priority[];
  types: string[];
  labels: string[];
}

export interface LabelWeight {
  label: string;
  multiplier: number;
}

interface RepoPrefs {
  view: ViewId;
  sortIdx: number;
  /** @deprecated use activeFilters.priorities */
  filterPriorities: Priority[];
  activeFilters: ActiveFilters;
  tab: string;
  labelWeights?: LabelWeight[];
  scopeWeights?: Record<string, number>;
}

interface Prefs {
  lastRepoId?: string;
  repos: Record<string, RepoPrefs>;
}

const EMPTY_FILTERS: ActiveFilters = { statuses: [], priorities: [], types: [], labels: [] };

const REPO_DEFAULTS: RepoPrefs = {
  view: "kanban",
  sortIdx: 0,
  filterPriorities: [],
  activeFilters: EMPTY_FILTERS,
  tab: "all",
};

function load(): Prefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw) as Prefs;
    }
  } catch {}
  return { repos: {} };
}

function persist(prefs: Prefs): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

export function getLastRepoId(): string | undefined {
  return load().lastRepoId;
}

export function getRepoPrefs(repoId: string): RepoPrefs {
  const prefs = load();
  return { ...REPO_DEFAULTS, ...(prefs.repos[repoId] ?? {}) };
}

export function useRepoPrefs(repoId: string) {
  const initial = getRepoPrefs(repoId);

  const save = useCallback(
    (patch: Partial<RepoPrefs>) => {
      const current = load();
      current.lastRepoId = repoId;
      current.repos[repoId] = {
        ...REPO_DEFAULTS,
        ...(current.repos[repoId] ?? {}),
        ...patch,
      };
      persist(current);
    },
    [repoId],
  );

  return { initial, save };
}

export function saveLastRepo(repoId: string): void {
  const current = load();
  current.lastRepoId = repoId;
  persist(current);
}

export function useLabelWeights(repoId: string) {
  const [weights, setWeightsState] = useState<LabelWeight[]>(() => {
    return getRepoPrefs(repoId).labelWeights ?? [];
  });

  useEffect(() => {
    setWeightsState(getRepoPrefs(repoId).labelWeights ?? []);
  }, [repoId]);

  const persist_ = useCallback((next: LabelWeight[]) => {
    const current = load();
    current.repos[repoId] = {
      ...REPO_DEFAULTS,
      ...(current.repos[repoId] ?? {}),
      labelWeights: next,
    };
    persist(current);
    setWeightsState(next);
  }, [repoId]);

  const setMultiplier = useCallback((label: string, multiplier: number) => {
    const current = load();
    const existing = (current.repos[repoId]?.labelWeights ?? []);
    const idx = existing.findIndex((w) => w.label === label);
    let next: LabelWeight[];
    if (idx >= 0) {
      next = existing.map((w) => w.label === label ? { label, multiplier } : w);
    } else {
      next = [...existing, { label, multiplier }];
    }
    persist_(next);
  }, [repoId, persist_]);

  const reorder = useCallback((from: number, to: number) => {
    const current = load();
    const existing = [...(current.repos[repoId]?.labelWeights ?? [])];
    const [moved] = existing.splice(from, 1);
    existing.splice(to, 0, moved);
    persist_(existing);
  }, [repoId, persist_]);

  const remove = useCallback((label: string) => {
    const current = load();
    const next = (current.repos[repoId]?.labelWeights ?? []).filter((w) => w.label !== label);
    persist_(next);
  }, [repoId, persist_]);

  return { weights, setMultiplier, reorder, remove };
}

export function useScopeWeights(repoId: string) {
  const [weights, setWeightsState] = useState<Record<string, number>>(() => {
    return getRepoPrefs(repoId).scopeWeights ?? {};
  });

  useEffect(() => {
    setWeightsState(getRepoPrefs(repoId).scopeWeights ?? {});
  }, [repoId]);

  const persist_ = useCallback((next: Record<string, number>) => {
    const current = load();
    current.repos[repoId] = {
      ...REPO_DEFAULTS,
      ...(current.repos[repoId] ?? {}),
      scopeWeights: next,
    };
    persist(current);
    setWeightsState(next);
  }, [repoId]);

  const setWeight = useCallback((scope: string, multiplier: number) => {
    const current = load();
    const existing = current.repos[repoId]?.scopeWeights ?? {};
    persist_({ ...existing, [scope]: multiplier });
  }, [repoId, persist_]);

  const remove = useCallback((scope: string) => {
    const current = load();
    const existing = { ...(current.repos[repoId]?.scopeWeights ?? {}) };
    delete existing[scope];
    persist_(existing);
  }, [repoId, persist_]);

  return { weights, setWeight, remove };
}
