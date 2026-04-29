import { useState } from "react";
import { useRepos, useRemoveRepo, useRescanRepo } from "@/hooks/useRepos";
import { cn } from "@/lib/utils";
import { Trash2, RefreshCw, FolderOpen } from "lucide-react";
import { toast } from "sonner";

const TABS = ["General", "Repos", "API Key", "Cost", "About"] as const;
type Tab = (typeof TABS)[number];

export function SettingsView() {
  const [activeTab, setActiveTab] = useState<Tab>("Repos");

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">Settings</h1>

      <div className="flex gap-6">
        <nav className="w-40 space-y-1">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "w-full text-left px-3 py-2 text-sm rounded transition-colors",
                activeTab === tab
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
            >
              {tab}
            </button>
          ))}
        </nav>

        <div className="flex-1">
          {activeTab === "General" && <GeneralPanel />}
          {activeTab === "Repos" && <ReposPanel />}
          {activeTab === "API Key" && <ApiKeyPanel />}
          {activeTab === "Cost" && <CostPanel />}
          {activeTab === "About" && <AboutPanel />}
        </div>
      </div>
    </div>
  );
}

function GeneralPanel() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-medium mb-2">Theme</h3>
        <p className="text-sm text-muted-foreground">Dark mode (always on in v1)</p>
      </div>
      <div>
        <h3 className="text-sm font-medium mb-2">Sounds</h3>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" defaultChecked className="rounded" />
          Play sounds on agent events
        </label>
      </div>
      <div>
        <h3 className="text-sm font-medium mb-2">Agent concurrency</h3>
        <select className="bg-secondary border border-border rounded px-3 py-1.5 text-sm">
          <option value="1">1 concurrent run</option>
          <option value="2">2 concurrent runs</option>
          <option value="3">3 concurrent runs</option>
        </select>
      </div>
    </div>
  );
}

function ReposPanel() {
  const { data: repos } = useRepos();
  const removeRepo = useRemoveRepo();
  const rescanRepo = useRescanRepo();

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium">Registered Repositories</h3>
      {repos?.map((repo) => (
        <div key={repo.id} className="flex items-center justify-between p-3 bg-secondary rounded-lg">
          <div>
            <div className="text-sm font-medium">{repo.name}</div>
            <div className="text-xs text-muted-foreground">{repo.path}</div>
            {repo.last_scan && (
              <div className="text-xs text-muted-foreground">Last scan: {repo.last_scan}</div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => rescanRepo.mutate(repo.id, { onSuccess: (r) => toast.success(`Rescanned: +${r.added} ~${r.updated} -${r.removed}`) })}
              className="p-1.5 hover:bg-accent rounded"
              title="Rescan"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={() => removeRepo.mutate(repo.id, { onSuccess: () => toast.success("Repo removed") })}
              className="p-1.5 hover:bg-destructive/20 rounded text-destructive"
              title="Remove"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
      {(!repos || repos.length === 0) && (
        <p className="text-sm text-muted-foreground">No repositories registered yet.</p>
      )}
    </div>
  );
}

function ApiKeyPanel() {
  const [key, setKey] = useState("");
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium">Anthropic API Key</h3>
      <p className="text-xs text-muted-foreground">
        Resolved from: ANTHROPIC_API_KEY env → ~/.claude/auth.json → manual override below
      </p>
      <input
        type="password"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        placeholder="sk-ant-..."
        className="w-full bg-secondary border border-border rounded px-3 py-2 text-sm"
      />
      <button className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90">
        Test Key
      </button>
    </div>
  );
}

function CostPanel() {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium">Agent Cost Tracking</h3>
      <p className="text-sm text-muted-foreground">Cost tracking will show here after agent runs.</p>
    </div>
  );
}

function AboutPanel() {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium">Roadmap Manager</h3>
      <p className="text-sm text-muted-foreground">Version 0.1.0</p>
      <p className="text-sm text-muted-foreground">
        Desktop app for multi-repo roadmap management with AI-assisted item creation.
      </p>
      <div className="pt-4 border-t border-border">
        <h4 className="text-sm font-medium mb-2">Keyboard Shortcuts</h4>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <span className="text-muted-foreground">⌘K</span><span>Command palette</span>
          <span className="text-muted-foreground">⌘N</span><span>New item</span>
          <span className="text-muted-foreground">⌘\\</span><span>Toggle sidebar</span>
          <span className="text-muted-foreground">j/k</span><span>Navigate items</span>
          <span className="text-muted-foreground">Enter</span><span>Open item</span>
          <span className="text-muted-foreground">Esc</span><span>Close modal</span>
        </div>
      </div>
    </div>
  );
}
