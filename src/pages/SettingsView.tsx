import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useRepos, useRemoveRepo, useRescanRepo, useUpdateRepo } from "@/hooks/useRepos";
import { cn } from "@/lib/utils";
import { Trash2, RefreshCw, Check, Globe } from "lucide-react";
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
  const { data: repos } = useRepos();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selected, setSelected] = useState<string | "general">("general");

  // Pre-select from URL param on mount / when repos load
  useEffect(() => {
    const param = searchParams.get("repo");
    if (param && repos?.find((r) => r.id === param)) {
      setSelected(param);
    } else if (repos && repos.length > 0 && selected === "general") {
      setSelected(repos[0].id);
    }
  }, [repos]);

  const handleSelect = (id: string | "general") => {
    setSelected(id);
    if (id !== "general") {
      setSearchParams({ repo: id }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  };

  const activeRepo = repos?.find((r) => r.id === selected);

  return (
    <div className="max-w-3xl mx-auto h-full flex flex-col">
      <h1 className="text-xl font-semibold mb-5 shrink-0">Settings</h1>

      <div className="flex gap-5 flex-1 min-h-0">
        {/* Left — project list */}
        <nav className="w-44 shrink-0 space-y-0.5">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-2 mb-1.5">
            Projects
          </p>
          {repos?.map((repo) => {
            const display = parseRepoDisplay(repo.config);
            const bgColor = display.color;
            return (
              <button
                key={repo.id}
                onClick={() => handleSelect(repo.id)}
                className={cn(
                  "flex items-center gap-2.5 w-full px-2 py-1.5 rounded text-sm transition-colors text-left",
                  selected === repo.id
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
              >
                <span
                  className="w-5 h-5 rounded-md shrink-0 flex items-center justify-center text-white text-[9px] font-bold"
                  style={{ backgroundColor: bgColor ?? "#6366f1" }}
                >
                  {repoInitials(repo.name)}
                </span>
                <span className="truncate">{repo.name}</span>
              </button>
            );
          })}

          <div className="border-t border-border/50 my-2" />

          <button
            onClick={() => handleSelect("general")}
            className={cn(
              "flex items-center gap-2.5 w-full px-2 py-1.5 rounded text-sm transition-colors",
              selected === "general"
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            )}
          >
            <Globe className="w-4 h-4 shrink-0" />
            <span>General</span>
          </button>
        </nav>

        {/* Right — panel */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {activeRepo && <ProjectPanel key={activeRepo.id} repo={activeRepo} />}
          {selected === "general" && <GeneralPanel />}
        </div>
      </div>
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

      {/* Info */}
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

      {/* Danger */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-destructive">Danger zone</h2>
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

function GeneralPanel() {
  const [_key, setKey] = useState("");

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-sm font-medium">Anthropic API Key</h2>
        <p className="text-xs text-muted-foreground">
          Resolved from: ANTHROPIC_API_KEY env → ~/.claude/auth.json → manual override below
        </p>
        <input
          type="password"
          value={_key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="sk-ant-..."
          className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <Button variant="ghost" size="sm">
          Test key
        </Button>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Keyboard shortcuts</h2>
        <div className="rounded-lg border border-border divide-y divide-border">
          {[
            ["⌘K", "Command palette"],
            ["⌘N", "New item"],
            ["⌘\\", "Toggle sidebar"],
            ["J / K", "Navigate items"],
            ["Enter", "Open item"],
            ["Esc", "Close / cancel"],
          ].map(([key, desc]) => (
            <div key={key} className="flex items-center justify-between px-3 py-2">
              <span className="text-xs text-muted-foreground">{desc}</span>
              <kbd className="text-[10px] font-mono bg-secondary border border-border px-1.5 py-0.5 rounded">
                {key}
              </kbd>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-1">
        <h2 className="text-sm font-medium">About</h2>
        <p className="text-xs text-muted-foreground">Roadmap Manager v0.1.0</p>
      </section>
    </div>
  );
}
