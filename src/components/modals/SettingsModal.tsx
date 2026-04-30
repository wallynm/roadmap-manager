import { useState, useEffect, useId, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { X, Check, RefreshCw, Trash2, ChevronUp, ChevronDown, Plus } from "lucide-react";
import { toast } from "sonner";
import { useRepos, useRemoveRepo, useRescanRepo, useUpdateRepo } from "@/hooks/useRepos";
import { useItems } from "@/hooks/useItems";
import { useLabelWeights, useScopeWeights } from "@/hooks/usePrefs";
import { parseRepoDisplay, setRepoDisplayColor } from "@/lib/tauri";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import type { Repo } from "@/types";

// ── module-level open handle ────────────────────────────────────────────────
let _open: (() => void) | null = null;
export function openSettings() { _open?.(); }

const REPO_RE = /\/repos\/([^/]+)/;

const COLOR_PALETTE = [
  "#6366f1", "#8b5cf6", "#0ea5e9", "#14b8a6",
  "#10b981", "#f59e0b", "#f97316", "#f43f5e",
  "#ec4899", "#64748b",
];

function repoInitials(name: string): string {
  return name.split(/[\s\-_./]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
}

// ── nav sections ────────────────────────────────────────────────────────────
const SECTIONS = [
  { id: "general",    label: "General" },
  { id: "repository", label: "Repository" },
  { id: "next-up",    label: "Next Up" },
  { id: "danger",     label: "Danger zone" },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

// ── sub-components ──────────────────────────────────────────────────────────
function GeneralSection({ repo }: { repo: Repo }) {
  const [name, setName] = useState(repo.name);
  const [color, setColor] = useState(parseRepoDisplay(repo.config).color ?? "");
  const updateRepo = useUpdateRepo();

  useEffect(() => {
    setName(repo.name);
    setColor(parseRepoDisplay(repo.config).color ?? "");
  }, [repo.id]);

  const isDirty = name.trim() !== repo.name || color !== (parseRepoDisplay(repo.config).color ?? "");

  const handleSave = () => {
    const newConfig = setRepoDisplayColor(repo.config, color || undefined);
    updateRepo.mutate(
      { id: repo.id, name: name.trim() || repo.name, config: newConfig },
      { onSuccess: () => toast.success("Saved") },
    );
  };

  return (
    <div className="space-y-6">
      <h2 className="text-sm font-semibold">General</h2>

      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <div
            className="w-12 h-12 rounded-xl shrink-0 flex items-center justify-center text-white text-sm font-bold"
            style={{ backgroundColor: color || "#6366f1" }}
          >
            {repoInitials(name)}
          </div>
          <div className="flex-1 space-y-1">
            <label className="text-xs text-muted-foreground">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring select-text"
              placeholder="Project name"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Color</label>
          <div className="flex items-center gap-2 flex-wrap">
            {COLOR_PALETTE.map((hex) => (
              <button
                key={hex}
                type="button"
                onClick={() => setColor(color === hex ? "" : hex)}
                className="w-6 h-6 rounded-full flex items-center justify-center transition-transform hover:scale-110 focus:outline-none"
                style={{ backgroundColor: hex }}
              >
                {color === hex && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
              </button>
            ))}
          </div>
        </div>

        {isDirty && (
          <Button variant="primary" size="sm" loading={updateRepo.isPending} onClick={handleSave}>
            Save changes
          </Button>
        )}
      </div>
    </div>
  );
}

function RepositorySection({ repo }: { repo: Repo }) {
  const rescanRepo = useRescanRepo();
  return (
    <div className="space-y-6">
      <h2 className="text-sm font-semibold">Repository</h2>

      <div className="rounded-lg border border-border divide-y divide-border">
        <div className="flex items-baseline justify-between px-3 py-2 gap-4">
          <span className="text-xs text-muted-foreground shrink-0">Path</span>
          <span className="text-xs font-mono text-foreground truncate text-right select-text">{repo.path}</span>
        </div>
        <div className="flex items-baseline justify-between px-3 py-2 gap-4">
          <span className="text-xs text-muted-foreground shrink-0">Last scan</span>
          <span className="text-xs text-foreground select-text">{repo.last_scan ?? "Never"}</span>
        </div>
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={() =>
          rescanRepo.mutate(repo.id, {
            onSuccess: (r) => toast.success(`Rescanned: +${r.added} ~${r.updated} -${r.removed}`),
          })
        }
      >
        <RefreshCw className="w-3.5 h-3.5" />
        Rescan now
      </Button>
    </div>
  );
}

function NextUpSection({ repoId }: { repoId: string }) {
  return (
    <div className="space-y-8">
      <h2 className="text-sm font-semibold">Next Up</h2>
      <ScopeWeightsPanel repoId={repoId} />
      <LabelWeightsPanel repoId={repoId} />
    </div>
  );
}

function ScopeWeightsPanel({ repoId }: { repoId: string }) {
  const { data: items } = useItems(repoId, undefined);
  const { weights, setWeight, remove } = useScopeWeights(repoId);
  const selectId = useId();
  const [newScope, setNewScope] = useState("");

  const allScopes = useMemo(() => {
    const set = new Set<string>();
    for (const item of items ?? []) {
      if (item.scope) { set.add(item.scope); }
    }
    return [...set].sort();
  }, [items]);

  const configured = Object.entries(weights).sort(([a], [b]) => a.localeCompare(b));
  const unconfigured = allScopes.filter((s) => !(s in weights));

  const scopeLabel = (s: string) => s.split("/").pop() ?? s;

  const handleAdd = (scope: string) => {
    if (!scope || scope in weights) { return; }
    setWeight(scope, 1);
    setNewScope("");
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-medium">Scope weights</p>
        <p className="text-xs text-muted-foreground mt-0.5">Multiplies all items in a scope. Default ×1.</p>
      </div>

      {configured.length > 0 && (
        <div className="rounded-lg border border-border divide-y divide-border">
          {configured.map(([scope, multiplier]) => (
            <div key={scope} className="flex items-center gap-2 px-3 py-2">
              <span className="flex-1 text-xs">
                <span className="font-medium">{scopeLabel(scope)}</span>
                <span className="text-muted-foreground/50 ml-1.5 font-mono text-[10px]">{scope}</span>
              </span>
              <span className="text-xs text-muted-foreground">×</span>
              <input
                type="number"
                min={0.1}
                step={1}
                value={multiplier}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!Number.isNaN(v) && v > 0) { setWeight(scope, v); }
                }}
                className="w-16 bg-secondary/50 border border-border rounded px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-ring select-text"
              />
              <button type="button" onClick={() => remove(scope)} className="text-muted-foreground/40 hover:text-destructive ml-1">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {configured.length === 0 && (
        <p className="text-xs text-muted-foreground/50 italic">No scope weights configured.</p>
      )}

      <div className="flex items-center gap-2">
        {unconfigured.length > 0 ? (
          <select
            id={selectId}
            value={newScope}
            onChange={(e) => setNewScope(e.target.value)}
            className="flex-1 bg-secondary/50 border border-border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring text-muted-foreground"
          >
            <option value="">Pick a scope…</option>
            {unconfigured.map((s) => (
              <option key={s} value={s}>{scopeLabel(s)} — {s}</option>
            ))}
          </select>
        ) : (
          <input
            id={selectId}
            value={newScope}
            onChange={(e) => setNewScope(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { handleAdd(newScope); } }}
            placeholder="Type a scope path…"
            className="flex-1 bg-secondary/50 border border-border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/40 select-text"
          />
        )}
        <Button variant="secondary" size="sm" onClick={() => handleAdd(newScope)} disabled={!newScope}>
          <Plus className="w-3.5 h-3.5" />
          Add
        </Button>
      </div>
    </div>
  );
}

function LabelWeightsPanel({ repoId }: { repoId: string }) {
  const { data: items } = useItems(repoId, undefined);
  const { weights, setMultiplier, reorder, remove } = useLabelWeights(repoId);
  const selectId = useId();
  const [newLabel, setNewLabel] = useState("");

  const allLabels = useMemo(() => {
    const set = new Set<string>();
    for (const item of items ?? []) {
      try { (JSON.parse(item.labels) as string[]).forEach((l) => set.add(l)); } catch {}
    }
    return [...set].sort();
  }, [items]);

  const configuredSet = new Set(weights.map((w) => w.label));
  const unconfigured = allLabels.filter((l) => !configuredSet.has(l));

  const handleAdd = (label: string) => {
    const t = label.trim();
    if (!t || configuredSet.has(t)) { return; }
    setMultiplier(t, 1);
    setNewLabel("");
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-medium">Label weights</p>
        <p className="text-xs text-muted-foreground mt-0.5">Product of matched label multipliers. Default ×1.</p>
      </div>

      {weights.length > 0 && (
        <div className="rounded-lg border border-border divide-y divide-border">
          {weights.map((w, i) => (
            <div key={w.label} className="flex items-center gap-2 px-3 py-2">
              <div className="flex flex-col gap-0.5 shrink-0">
                <button
                  type="button"
                  disabled={i === 0}
                  onClick={() => reorder(i, i - 1)}
                  className="text-muted-foreground/40 hover:text-foreground disabled:opacity-20"
                >
                  <ChevronUp className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  disabled={i === weights.length - 1}
                  onClick={() => reorder(i, i + 1)}
                  className="text-muted-foreground/40 hover:text-foreground disabled:opacity-20"
                >
                  <ChevronDown className="w-3 h-3" />
                </button>
              </div>
              <span className="text-[10px] text-muted-foreground/40 tabular-nums w-4">{i + 1}</span>
              <span className="flex-1 text-xs">{w.label}</span>
              <span className="text-xs text-muted-foreground">×</span>
              <input
                type="number"
                min={0.1}
                step={0.5}
                value={w.multiplier}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!Number.isNaN(v) && v > 0) { setMultiplier(w.label, v); }
                }}
                className="w-16 bg-secondary/50 border border-border rounded px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-ring select-text"
              />
              <button type="button" onClick={() => remove(w.label)} className="text-muted-foreground/40 hover:text-destructive ml-1">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {weights.length === 0 && (
        <p className="text-xs text-muted-foreground/50 italic">No label weights configured.</p>
      )}

      <div className="flex items-center gap-2">
        {unconfigured.length > 0 ? (
          <select
            id={selectId}
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            className="flex-1 bg-secondary/50 border border-border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring text-muted-foreground"
          >
            <option value="">Pick a label…</option>
            {unconfigured.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        ) : (
          <input
            id={selectId}
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { handleAdd(newLabel); } }}
            placeholder="Type a label name…"
            className="flex-1 bg-secondary/50 border border-border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/40 select-text"
          />
        )}
        <Button variant="secondary" size="sm" onClick={() => handleAdd(newLabel)} disabled={!newLabel.trim()}>
          <Plus className="w-3.5 h-3.5" />
          Add
        </Button>
      </div>
    </div>
  );
}

function DangerSection({ repo, onClose }: { repo: Repo; onClose: () => void }) {
  const removeRepo = useRemoveRepo();
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <h2 className="text-sm font-semibold">Danger zone</h2>
      <div className="rounded-lg border border-destructive/30 p-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Remove project</p>
          <p className="text-xs text-muted-foreground">Removes the project from Roadmap Manager. Files are not deleted.</p>
        </div>
        <Button
          variant="destructive"
          size="sm"
          onClick={() =>
            removeRepo.mutate(repo.id, {
              onSuccess: () => {
                toast.success("Project removed");
                onClose();
                navigate("/");
              },
            })
          }
        >
          <Trash2 className="w-3.5 h-3.5" />
          Remove
        </Button>
      </div>
    </div>
  );
}

// ── main modal ──────────────────────────────────────────────────────────────
export function SettingsModal() {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<SectionId>("general");
  const location = useLocation();
  const repoId = REPO_RE.exec(location.pathname)?.[1] ?? null;
  const { data: repos } = useRepos();
  const repo = repos?.find((r) => r.id === repoId);

  useEffect(() => {
    _open = () => setOpen(true);
    return () => { _open = null; };
  }, []);

  useEffect(() => {
    if (!open) { return; }
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  if (!open) { return null; }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) { setOpen(false); } }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Panel */}
      <div className="relative z-10 flex w-[780px] h-[540px] rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
        {/* Left nav */}
        <nav className="w-44 shrink-0 bg-secondary/30 border-r border-border flex flex-col py-4 px-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 px-2 pb-2">
            Settings
          </p>
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSection(s.id)}
              className={cn(
                "flex items-center w-full px-2 py-1.5 text-xs rounded-lg transition-colors text-left mt-px first:mt-0",
                section === s.id
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent",
                s.id === "danger" && section !== "danger" && "text-destructive/60 hover:text-destructive",
                s.id === "danger" && section === "danger" && "bg-destructive/10 text-destructive",
              )}
            >
              {s.label}
            </button>
          ))}
        </nav>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8">
          {!repo ? (
            <p className="text-sm text-muted-foreground">No project selected.</p>
          ) : (
            <>
              {section === "general"    && <GeneralSection repo={repo} />}
              {section === "repository" && <RepositorySection repo={repo} />}
              {section === "next-up"    && <NextUpSection repoId={repo.id} />}
              {section === "danger"     && <DangerSection repo={repo} onClose={() => setOpen(false)} />}
            </>
          )}
        </div>

        {/* Close */}
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-accent transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
