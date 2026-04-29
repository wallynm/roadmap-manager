import { invoke } from "@tauri-apps/api/core";
import type {
  Item, Repo, ScanReport, Comment, Notification, AgentRun, ItemFilters,
  ValidationReport, FixReport, ArchiveDryRun, ArchiveReport,
  DepAnalysis, RankedItem, CheckboxCount, SubRoadmapStatus,
} from "@/types";

export interface RepoDisplay {
  color?: string;
}

export function parseRepoDisplay(config: string): RepoDisplay {
  try {
    const cfg = JSON.parse(config) as Record<string, unknown>;
    return {
      color: typeof cfg.display_color === "string" ? cfg.display_color : undefined,
    };
  } catch {
    return {};
  }
}

export function setRepoDisplayColor(config: string, color: string | undefined): string {
  try {
    const cfg = JSON.parse(config) as Record<string, unknown>;
    if (color) {
      cfg.display_color = color;
    } else {
      delete cfg.display_color;
    }
    return JSON.stringify(cfg);
  } catch {
    return JSON.stringify(color ? { display_color: color } : {});
  }
}

export const api = {
  listRepos: () => invoke<Repo[]>("list_repos"),
  addRepo: (name: string, path: string, config?: string) =>
    invoke<[Repo, ScanReport]>("add_repo", { name, path, config }),
  removeRepo: (id: string) => invoke<void>("remove_repo", { id }),
  rescanRepo: (repoId: string) => invoke<ScanReport>("rescan_repo", { repoId }),
  getRepo: (id: string) => invoke<Repo>("get_repo", { id }),
  updateRepo: (id: string, name: string, config: string) =>
    invoke<Repo>("update_repo", { id, name, config }),
  getRoadmap: (repoId: string) =>
    invoke<{ content: string; exists: boolean; path: string }>("get_roadmap", { repoId }),
  regenerateRoadmap: (repoId: string) =>
    invoke<{ content: string; exists: boolean; path: string }>("regenerate_roadmap", { repoId }),

  listItems: (repoId: string, filters?: ItemFilters) =>
    invoke<Item[]>("list_items", { repoId, filters }),
  getItem: (id: string) => invoke<Item>("get_item", { id }),
  createItem: (params: {
    repoId: string;
    itemType: string;
    title: string;
    body: string;
    priority?: string;
    labels?: string[];
  }) => invoke<Item>("create_item", params),
  startItem: (id: string) => invoke<Item>("start_item", { id }),
  completeItem: (id: string, note?: string) => invoke<Item>("complete_item", { id, note }),
  cancelItem: (id: string, reason?: string) => invoke<Item>("cancel_item", { id, reason }),
  markDuplicate: (id: string, originalId: string) =>
    invoke<Item>("mark_duplicate", { id, originalId }),
  planItem: (id: string) => invoke<Item>("plan_item", { id }),
  updateItem: (params: {
    id: string;
    status?: string;
    priority?: string;
    labels?: string[];
    title?: string;
    body?: string;
  }) => invoke<Item>("update_item", params),
  addDependency: (id: string, blockerId: string) =>
    invoke<Item>("add_dependency", { id, blockerId }),
  removeDependency: (id: string, blockerId: string) =>
    invoke<Item>("remove_dependency", { id, blockerId }),
  addComment: (itemId: string, body: string, author?: string) =>
    invoke<Item>("add_comment", { itemId, body, author }),
  getItemComments: (itemId: string) => invoke<Comment[]>("get_item_comments", { itemId }),

  getNotifications: () => invoke<Notification[]>("get_notifications"),
  markNotificationRead: (id: string) => invoke<void>("mark_notification_read", { id }),
  markAllNotificationsRead: () => invoke<void>("mark_all_notifications_read"),
  getUnreadCount: () => invoke<number>("get_unread_count"),

  agentInvoke: (params: {
    trigger: string;
    repoId: string;
    itemType?: string;
    title?: string;
    description?: string;
    itemId?: string;
  }) => invoke<string>("agent_invoke", params),
  agentRespond: (runId: string, message: string) =>
    invoke<void>("agent_respond", { runId, message }),
  agentGetRun: (runId: string) => invoke<AgentRun>("agent_get_run", { runId }),
  agentCancel: (runId: string) => invoke<void>("agent_cancel", { runId }),
  agentListRuns: (repoId?: string) => invoke<AgentRun[]>("agent_list_runs", { repoId }),

  validateRepo: (repoId: string) =>
    invoke<ValidationReport>("validate_repo", { repoId }),
  fixRepo: (repoId: string) =>
    invoke<FixReport>("fix_repo", { repoId }),
  archiveDryRun: (repoId: string) =>
    invoke<ArchiveDryRun>("archive_dry_run", { repoId }),
  archiveExecute: (repoId: string) =>
    invoke<ArchiveReport>("archive_execute", { repoId }),
  depsCheck: (repoId: string) =>
    invoke<DepAnalysis>("deps_check", { repoId }),
  impactRanking: (repoId: string) =>
    invoke<RankedItem[]>("impact_ranking", { repoId }),
  staleItems: (repoId: string, staleDays: number) =>
    invoke<Item[]>("stale_items", { repoId, staleDays }),
  regenerateIndexes: (repoId: string) =>
    invoke<number>("regenerate_indexes", { repoId }),
  getCheckboxCount: (repoId: string) =>
    invoke<CheckboxCount>("get_checkbox_count", { repoId }),
  getSubRoadmaps: (repoId: string) =>
    invoke<SubRoadmapStatus[]>("get_sub_roadmaps", { repoId }),
};
