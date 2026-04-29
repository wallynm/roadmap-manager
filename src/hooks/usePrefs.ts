import { useCallback } from "react";
import type { Priority } from "@/types";

const STORAGE_KEY = "roadmap-prefs-v1";

export type ViewId = "kanban" | "list" | "graph" | "validation";

interface RepoPrefs {
  view: ViewId;
  sortIdx: number;
  filterPriorities: Priority[];
  tab: string;
}

interface Prefs {
  lastRepoId?: string;
  repos: Record<string, RepoPrefs>;
}

const REPO_DEFAULTS: RepoPrefs = {
  view: "kanban",
  sortIdx: 0,
  filterPriorities: [],
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
