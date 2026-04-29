import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useItems } from "@/hooks/useItems";
import { KanbanBoard } from "@/components/kanban/KanbanBoard";
import { ItemList } from "@/components/list/ItemList";
import { DepGraph } from "@/components/graph/DepGraph";
import type { Item, ItemFilters } from "@/types";
import { cn } from "@/lib/utils";
import { LayoutGrid, List, GitBranch } from "lucide-react";

const VIEWS = [
  { id: "kanban", label: "Kanban", icon: LayoutGrid },
  { id: "list", label: "List", icon: List },
  { id: "graph", label: "Graph", icon: GitBranch },
] as const;

type ViewId = (typeof VIEWS)[number]["id"];

const TABS = [
  { id: "all", label: "All items" },
  { id: "active", label: "Active" },
  { id: "backlog", label: "Backlog" },
  { id: "done", label: "Done" },
] as const;

export function RepoView() {
  const { repoId } = useParams<{ repoId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [currentView, setCurrentView] = useState<ViewId>("kanban");

  const tab = searchParams.get("tab") || "all";
  const scope = searchParams.get("scope") ?? undefined;

  const setTab = (newTab: string) => {
    const next: Record<string, string> = { tab: newTab };
    if (scope) { next.scope = scope; }
    setSearchParams(next);
  };

  const dbFilters: ItemFilters = {};
  if (tab === "backlog") { dbFilters.status = "backlog"; }
  else if (tab === "done") { dbFilters.status = "done"; }
  if (scope) { dbFilters.scope = scope; }

  const hasFilters = Object.keys(dbFilters).length > 0;
  const { data: items, isLoading } = useItems(repoId || null, hasFilters ? dbFilters : undefined);

  const filteredItems = items?.filter((item) => {
    if (tab === "all") {
      return item.status !== "canceled" && item.status !== "duplicate";
    }
    if (tab === "active") {
      return item.status === "in_progress" || item.status === "todo";
    }
    return true;
  }) || [];

  const handleItemClick = (item: Item) => {
    navigate(`/repos/${repoId}/items/${item.id}`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Loading items...</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Filter tabs + view switcher */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div className="flex items-center gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-full transition-colors",
                tab === t.id
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          {VIEWS.map((view) => (
            <button
              key={view.id}
              onClick={() => setCurrentView(view.id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors",
                currentView === view.id
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
            >
              <view.icon className="w-3.5 h-3.5" />
              {view.label}
            </button>
          ))}
          <span className="text-xs text-muted-foreground ml-2">
            {filteredItems.length}
          </span>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        {currentView === "kanban" && (
          <KanbanBoard items={filteredItems} onItemClick={handleItemClick} />
        )}
        {currentView === "list" && (
          <ItemList items={filteredItems} onItemClick={handleItemClick} />
        )}
        {currentView === "graph" && (
          <DepGraph items={filteredItems} onItemClick={handleItemClick} />
        )}
      </div>
    </div>
  );
}
