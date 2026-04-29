import { useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useItems } from "@/hooks/useItems";
import { KanbanBoard } from "@/components/kanban/KanbanBoard";
import { ItemList } from "@/components/list/ItemList";
import { DepGraph } from "@/components/graph/DepGraph";
import { ItemDetailsModal } from "@/components/modals/ItemDetailsModal";
import type { Item, ItemFilters } from "@/types";
import { cn } from "@/lib/utils";
import { LayoutGrid, List, GitBranch } from "lucide-react";

const VIEWS = [
  { id: "kanban", label: "Kanban", icon: LayoutGrid },
  { id: "list", label: "List", icon: List },
  { id: "graph", label: "Graph", icon: GitBranch },
] as const;

type ViewId = (typeof VIEWS)[number]["id"];

export function RepoView() {
  const { repoId } = useParams<{ repoId: string }>();
  const [searchParams] = useSearchParams();
  const [currentView, setCurrentView] = useState<ViewId>("kanban");
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);

  const tab = searchParams.get("tab") || "all";
  const filters: ItemFilters = {};

  if (tab === "active") {
    filters.status = undefined;
  } else if (tab === "backlog") {
    filters.status = "backlog";
  } else if (tab === "done") {
    filters.status = "done";
  }

  const { data: items, isLoading } = useItems(repoId || null, tab === "all" ? undefined : filters);

  const filteredItems = items?.filter((item) => {
    if (tab === "all") return item.status !== "canceled" && item.status !== "duplicate";
    if (tab === "active") return item.status === "in_progress" || item.status === "todo";
    return true;
  }) || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Loading items...</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-1 mb-4">
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
        <span className="text-xs text-muted-foreground ml-auto">
          {filteredItems.length} items
        </span>
      </div>

      <div className="flex-1 min-h-0">
        {currentView === "kanban" && (
          <KanbanBoard items={filteredItems} onItemClick={setSelectedItem} />
        )}
        {currentView === "list" && (
          <ItemList items={filteredItems} onItemClick={setSelectedItem} />
        )}
        {currentView === "graph" && (
          <DepGraph items={filteredItems} onItemClick={setSelectedItem} />
        )}
      </div>

      <ItemDetailsModal item={selectedItem} onClose={() => setSelectedItem(null)} />
    </div>
  );
}
