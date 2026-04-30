import { useState, useEffect, useMemo, useId } from "react";
import { useParams } from "react-router-dom";
import { useRepos, useRemoveRepo, useRescanRepo, useUpdateRepo } from "@/hooks/useRepos";
import { useItems } from "@/hooks/useItems";
import { useLabelWeights, useScopeWeights } from "@/hooks/usePrefs";
import { cn } from "@/lib/utils";
import { Trash2, RefreshCw, Check, ChevronUp, ChevronDown, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { toast } from "sonner";
import type { Repo } from "@/types";
import { parseRepoDisplay, setRepoDisplayColor } from "@/lib/tauri";

const COLOR_PALETTE = [
  "#6366f1",
  "#8b5cf6",
  "#0ea5e9",
  "#14b8a6",
  "#10b981",
  "#f59e0b",
  "#f97316",
  "#f43f5e",
  "#ec4899",
  "#64748b",
];

function repoInitials(name: string): string {
  return name
    .split(/[\s\-_./]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

export function SettingsView() {
  const { repoId } = useParams<{ repoId: string }>();
  const { data: repos } = useRepos();
  const repo = repos?.find((r) => r.id === repoId);

  if (!repo) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Project not found.
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto space-y-2">
      <h1 className="text-sm font-semibold mb-5">Settings — {repo.name}</h1>
      <ProjectPanel repo={repo} />
      <ScopeWeightsPanel repoId={repo.id} />
      <LabelWeightsPanel repoId={repo.id} />
    </div>
  );
}

function ProjectPanel({ repo }: { repo: Repo }) {
  const [name, setName] = useState(repo.name);
  const [color, setColor] = useState(parseRepoDisplay(repo.config).color ?? "");
  const updateRepo = useUpdateRepo();
  const removeRepo = useRemoveRepo();
  const rescanRepo = useRescanRepo();

  useEffect(() => {
    setName(repo.name);
    setColor(parseRepoDisplay(repo.config).color ?? "");
  }, [repo.id]);

  const isDirty =
    name.trim() !== repo.name || color !== (parseRepoDisplay(repo.config).color ?? "");

  const handleSave = () => {
    const newConfig = setRepoDisplayColor(repo.config, color || undefined);
    updateRepo.mutate(
      { id: repo.id, name: name.trim() || repo.name, config: newConfig },
      { onSuccess: () => toast.success("Saved") }
    );
  };

  return (
    <div className="space-y-8">
      {/* Appearance */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium">Appearance</h2>

        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center text-white text-sm font-bold"
              style={{ backgroundColor: color || "#6366f1" }}
            >
              {repoInitials(name)}
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-xs text-muted-foreground">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
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
                  className="w-6 h-6 rounded-full flex items-center justify-center transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-offset-background"
                  style={{ backgroundColor: hex }}
                >
                  {color === hex && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                </button>
              ))}
            </div>
          </div>

          {isDirty && (
            <Button
              variant="primary"
              size="sm"
              loading={updateRepo.isPending}
              onClick={handleSave}
            >
              Save changes
            </Button>
          )}
        </div>
      </section>

      {/* Repository info */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium">Repository</h2>
        <div className="rounded-lg border border-border divide-y divide-border">
          <Row label="Path" value={repo.path} mono />
          <Row label="Last scan" value={repo.last_scan ?? "Never"} />
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5"
          onClick={() =>
            rescanRepo.mutate(repo.id, {
              onSuccess: (r) =>
                toast.success(`Rescanned: +${r.added} ~${r.updated} -${r.removed}`),
            })
          }
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Rescan now
        </Button>
      </section>

      {/* Danger zone */}
      <section className="space-y-3">
        <h2 className={cn("text-sm font-medium text-destructive")}>Danger zone</h2>
        <div className="rounded-lg border border-destructive/30 p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Remove project</p>
            <p className="text-xs text-muted-foreground">
              Removes the project from Roadmap Manager. Files are not deleted.
            </p>
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={() =>
              removeRepo.mutate(repo.id, { onSuccess: () => toast.success("Project removed") })
            }
          >
            <Trash2 className="w-3.5 h-3.5" />
            Remove
          </Button>
        </div>
      </section>
    </div>
  );
}

function ScopeWeightsPanel({ repoId }: { repoId: string }) {
  const { data: items } = useItems(repoId, undefined);
  const { weights, setWeight, remove } = useScopeWeights(repoId);
  const inputId = useId();

  const allScopes = useMemo(() => {
    const set = new Set<string>();
    for (const item of items ?? []) {
      if (item.scope) { set.add(item.scope); }
    }
    return [...set].sort();
  }, [items]);

  const [newScope, setNewScope] = useState("");
  const unconfigured = allScopes.filter((s) => !(s in weights));

  const handleAdd = (scope: string) => {
    if (!scope || scope in weights) { return; }
    setWeight(scope, 1);
    setNewScope("");
  };

  const scopeLabel = (s: string) => {
    const parts = s.split("/");
    return parts[parts.length - 1] ?? s;
  };

  const configured = Object.entries(weights).sort(([a], [b]) => a.localeCompare(b));

  return (
    <section className="space-y-3 pt-6 border-t border-border">
      <div>
        <h2 className="text-sm font-medium">Next Up — Scope weights</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Multiplies the score of all items in a scope. Default for unconfigured scopes is ×1.
        </p>
      </div>

      {configured.length > 0 && (
        <div className="rounded-lg border border-border divide-y divide-border">
          {configured.map(([scope, multiplier]) => (
            <div key={scope} className="flex items-center gap-2 px-3 py-2">
              <span className="flex-1 text-xs">
                <span className="font-medium">{scopeLabel(scope)}</span>
                <span className="text-muted-foreground/50 ml-1.5 font-mono text-[10px]">{scope}</span>
              </span>
              <span className="text-xs text-muted-foreground shrink-0">×</span>
              <input
                type="number"
                min={0.1}
                step={1}
                value={multiplier}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!Number.isNaN(v) && v > 0) { setWeight(scope, v); }
                }}
                className="w-16 bg-secondary/50 border border-border rounded px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <button
                type="button"
                onClick={() => remove(scope)}
                className="text-muted-foreground/40 hover:text-destructive ml-1 shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {configured.length === 0 && (
        <p className="text-xs text-muted-foreground/50 italic">
          No scope weights configured. All scopes score ×1 by default.
        </p>
      )}

      <div className="flex items-center gap-2">
        {unconfigured.length > 0 ? (
          <select
            id={inputId}
            value={newScope}
            onChange={(e) => setNewScope(e.target.value)}
            className="flex-1 bg-secondary/50 border border-border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring text-muted-foreground"
          >
            <option value="">Pick a scope to configure…</option>
            {unconfigured.map((s) => (
              <option key={s} value={s}>{scopeLabel(s)} — {s}</option>
            ))}
          </select>
        ) : (
          <input
            id={inputId}
            value={newScope}
            onChange={(e) => setNewScope(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { handleAdd(newScope); } }}
            placeholder="Type a scope path…"
            className="flex-1 bg-secondary/50 border border-border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/40"
          />
        )}
        <Button
          variant="secondary"
          size="sm"
          onClick={() => handleAdd(newScope)}
          disabled={!newScope}
        >
          <Plus className="w-3.5 h-3.5" />
          Add
        </Button>
      </div>
    </section>
  );
}

function LabelWeightsPanel({ repoId }: { repoId: string }) {
  const { data: items } = useItems(repoId, undefined);
  const { weights, setMultiplier, reorder, remove } = useLabelWeights(repoId);
  const [newLabel, setNewLabel] = useState("");
  const inputId = useId();

  const allLabels = useMemo(() => {
    const set = new Set<string>();
    for (const item of items ?? []) {
      try {
        const labels = JSON.parse(item.labels) as string[];
        labels.forEach((l) => set.add(l));
      } catch {}
    }
    return [...set].sort();
  }, [items]);

  const configuredSet = new Set(weights.map((w) => w.label));
  const unconfigured = allLabels.filter((l) => !configuredSet.has(l));

  const handleAdd = (label: string) => {
    const trimmed = label.trim();
    if (!trimmed || configuredSet.has(trimmed)) {
      return;
    }
    setMultiplier(trimmed, 1);
    setNewLabel("");
  };

  return (
    <section className="space-y-3 pt-6 border-t border-border">
      <div>
        <h2 className="text-sm font-medium">Next Up — Label weights</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Labels multiply the item score in order (top = highest priority). Default for unconfigured labels is ×1.
        </p>
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
                  className="text-muted-foreground/50 hover:text-foreground disabled:opacity-20 disabled:cursor-not-allowed"
                >
                  <ChevronUp className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  disabled={i === weights.length - 1}
                  onClick={() => reorder(i, i + 1)}
                  className="text-muted-foreground/50 hover:text-foreground disabled:opacity-20 disabled:cursor-not-allowed"
                >
                  <ChevronDown className="w-3 h-3" />
                </button>
              </div>
              <span className="text-[10px] text-muted-foreground/40 tabular-nums w-4 shrink-0">
                {i + 1}
              </span>
              <span className="flex-1 text-xs">{w.label}</span>
              <span className="text-xs text-muted-foreground shrink-0">×</span>
              <input
                type="number"
                min={0.1}
                step={0.5}
                value={w.multiplier}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!Number.isNaN(v) && v > 0) {
                    setMultiplier(w.label, v);
                  }
                }}
                className="w-16 bg-secondary/50 border border-border rounded px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <button
                type="button"
                onClick={() => remove(w.label)}
                className="text-muted-foreground/40 hover:text-destructive ml-1 shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {weights.length === 0 && (
        <p className="text-xs text-muted-foreground/50 italic">
          No label weights configured. All labels score ×1 by default.
        </p>
      )}

      <div className="flex items-center gap-2">
        {unconfigured.length > 0 ? (
          <select
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            id={inputId}
            className="flex-1 bg-secondary/50 border border-border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring text-muted-foreground"
          >
            <option value="">Pick a label to configure…</option>
            {unconfigured.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        ) : (
          <input
            id={inputId}
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleAdd(newLabel);
              }
            }}
            placeholder="Type a label name…"
            className="flex-1 bg-secondary/50 border border-border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/40"
          />
        )}
        <Button
          variant="secondary"
          size="sm"
          onClick={() => handleAdd(newLabel)}
          disabled={!newLabel.trim()}
        >
          <Plus className="w-3.5 h-3.5" />
          Add
        </Button>
      </div>
    </section>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between px-3 py-2 gap-4">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className={cn("text-xs text-foreground truncate text-right", mono && "font-mono")}>
        {value}
      </span>
    </div>
  );
}
