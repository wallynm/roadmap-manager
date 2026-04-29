import { useParams, useSearchParams } from "react-router-dom";
import { Plus, Search } from "lucide-react";
import { useRepos } from "@/hooks/useRepos";
import { useState } from "react";
import { NewItemModal } from "@/components/modals/NewItemModal";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "backlog", label: "Backlog" },
  { id: "done", label: "Done" },
] as const;

export function TopBar() {
  const { repoId } = useParams();
  const { data: repos } = useRepos();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showNewItem, setShowNewItem] = useState(false);

  const currentTab = searchParams.get("tab") || "all";
  const repo = repos?.find((r) => r.id === repoId);

  return (
    <header className="h-12 border-b border-border flex items-center px-4 gap-4 shrink-0">
      {repo && (
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{repo.name}</span>
        </div>
      )}

      <div className="flex items-center gap-1 ml-4">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSearchParams({ tab: tab.id })}
            className={cn(
              "px-3 py-1 text-xs font-medium rounded transition-colors",
              currentTab === tab.id
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1" />

      <button
        onClick={() => setShowNewItem(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        New
      </button>

      <kbd className="text-xs text-muted-foreground border border-border px-1.5 py-0.5 rounded">
        ⌘K
      </kbd>

      {repoId && (
        <NewItemModal open={showNewItem} onOpenChange={setShowNewItem} repoId={repoId} />
      )}
    </header>
  );
}
