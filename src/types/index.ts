export interface Repo {
  id: string;
  name: string;
  path: string;
  config: string;
  created_at: string;
  last_scan: string | null;
}

export interface Item {
  id: string;
  repo_id: string;
  external_id: string;
  scope: string;
  type: string;
  title: string;
  file_path: string;
  file_hash: string;
  body: string;
  frontmatter: string;
  status: ItemStatus;
  priority: Priority | null;
  labels: string;
  depends_on: string;
  duplicate_of: string | null;
  created_date: string | null;
  started_date: string | null;
  completed_date: string | null;
  updated_at: string;
}

export type ItemStatus = "backlog" | "todo" | "in_progress" | "done" | "canceled" | "duplicate";
export type Priority = "Urgente" | "Alta" | "Média" | "Baixa" | "Nenhuma";

export interface Comment {
  id: string;
  item_id: string;
  author: string;
  is_agent: number;
  body: string;
  created_at: string;
}

export interface AgentRun {
  id: string;
  repo_id: string | null;
  item_id: string | null;
  trigger_type: string;
  model: string;
  status: "running" | "succeeded" | "failed" | "cancelled";
  prompt: string;
  transcript: string | null;
  output: string | null;
  error: string | null;
  duration_ms: number | null;
  cost_usd: number | null;
  started_at: string;
  finished_at: string | null;
}

export interface Notification {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  item_id: string | null;
  read: number;
  created_at: string;
}

export interface ScanReport {
  added: number;
  updated: number;
  removed: number;
  errors: string[];
}

export interface RepoConfig {
  templates: Record<string, TemplateConfig>;
  labels: LabelsConfig;
  autoCommit: AutoCommitConfig;
  branchPolicy: BranchPolicyConfig;
}

export interface TemplateConfig {
  dir: string;
  filePrefix: string;
  idPrefix: string;
  idPadding: number;
  frontmatterFields: string[];
  requiredFields: string[];
  defaults: Record<string, unknown>;
  bodyTemplate: string;
}

export interface LabelsConfig {
  whitelist: string[];
  allowFreeForm: boolean;
  colors: Record<string, string>;
}

export interface AutoCommitConfig {
  enabled: boolean;
  branch: string | null;
  messageFormat: string;
  includeNoteInBody: boolean;
  addReferenceLine: boolean;
  skipIfDirty: boolean;
}

export interface BranchPolicyConfig {
  allowedBranches: string[] | null;
  warnIfDetached: boolean;
}

export interface ItemFilters {
  status?: string;
  priority?: string;
  labels?: string[];
  item_type?: string;
  search?: string;
  scope?: string;
}

export interface ValidationIssue {
  file: string;
  template: string;
  missing: string[];
  extra: string[];
}

export interface ValidationReport {
  checked: number;
  passing: number;
  failing: number;
  issues: ValidationIssue[];
  orphan_files: string[];
}

export interface FixReport {
  fixed: number;
  skipped: number;
  files: string[];
}

export interface ArchiveCandidate {
  file_path: string;
  target_path: string;
  external_id: string;
  title: string;
}

export interface ArchiveDryRun {
  candidates: ArchiveCandidate[];
  ref_updates: number;
}

export interface ArchiveReport {
  moved: number;
  refs_updated: number;
  files: string[];
}

export interface DepIssue {
  kind: "orphan" | "self_ref" | "cycle";
  item_id: string;
  external_id: string;
  detail: string;
}

export interface DepAnalysis {
  orphans: DepIssue[];
  self_refs: DepIssue[];
  cycles: DepIssue[];
}

export interface RankedItem {
  id: string;
  external_id: string;
  unblocks: number;
}

export interface CheckboxCount {
  pending: number;
  completed: number;
  unchecked_items: CheckboxItem[];
}

export interface CheckboxItem {
  heading: string;
  text: string;
}

export interface SubRoadmapStatus {
  path: string;
  name: string;
  planned: number;
  in_progress: number;
  done: number;
}
