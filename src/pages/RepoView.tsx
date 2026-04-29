import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { useState, useRef, useEffect } from "react";
import { useItems } from "@/hooks/useItems";
import { useImpactRanking } from "@/hooks/useValidation";
import { useRepoPrefs, saveLastRepo, type ViewId, type ActiveFilters } from "@/hooks/usePrefs";
import { KanbanBoard } from "@/components/kanban/KanbanBoard";
import { ItemList, type SortField, type SortDir } from "@/components/list/ItemList";
import { DepGraph } from "@/components/graph/DepGraph";
import { FilterBar, type SortOption } from "@/components/filters/FilterBar";
import type { Item, ItemFilters } from "@/types";
import { cn } from "@/lib/utils";
import { LayoutGrid, List, GitBranch } from "lucide-react";

const VIEWS = [
  { id: "kanban", label: "Kanban", icon: LayoutGrid },
  { id: "list", label: "List", icon: List },
  { id: "graph", label: "Graph", icon: GitBranch },
] as const;

const TABS = [
  { id: "all", label: "All items" },
  { id: "active", label: "Active" },
  { id: "backlog", label: "Backlog" },
  { id: "done", label: "Done" },
] as const;

const SORT_OPTIONS: SortOption[] = [
  { field: "default",      dir: "asc",  label: "Default" },
  { field: "priority",     dir: "asc",  label: "Priority ↑" },
  { field: "priority",     dir: "desc", label: "Priority ↓" },
  { field: "created_date", dir: "desc", label: "Newest first" },
  { field: "created_date", dir: "asc",  label: "Oldest first" },
  { field: "impact",       dir: "desc", label: "Impact (most unblocking)" },
];

const EMPTY_FILTERS: ActiveFilters = { statuses: [], priorities: [], types: [], labels: [] };

export function RepoView() {
  const { repoId } = useParams<{ repoId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { initial, save } = useRepoPrefs(repoId!);

  const [currentView, setCurrentView] = useState<ViewId>(initial.view);
  const [sortIdx, setSortIdx] = useState(initial.sortIdx);
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>(
    initial.activeFilters ?? EMPTY_FILTERS,
  );

  useEffect(() => {
    if (!repoId) { return; }
    saveLastRepo(repoId);
    const p = initial;
    setCurrentView(p.view);
    setSortIdx(p.sortIdx);
    setActiveFilters(p.activeFilters ?? EMPTY_FILTERS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoId]);

  const tab = searchParams.get("tab") || initial.tab;
  const scope = searchParams.get("scope") ?? undefined;

  const setTab = (newTab: string) => {
    const next: Record<string, string> = { tab: newTab };
    if (scope) { next.scope = scope; }
    setSearchParams(next);
    save({ tab: newTab });
  };

  const dbFilters: ItemFilters = {};
  if (tab === "backlog") { dbFilters.status = "backlog"; }
  else if (tab === "done") { dbFilters.status = "done"; }
  if (scope) { dbFilters.scope = scope; }

  const hasFilters = Object.keys(dbFilters).length > 0;
  const { data: items, isLoading } = useItems(repoId || null, hasFilters ? dbFilters : undefined);

  const { data: impactData, refetch: refetchImpact } = useImpactRanking(repoId || "");
  const isImpactSort = SORT_OPTIONS[sortIdx]?.field === "impact";

  const impactMap: Record<string, number> = {};
  if (impactData) {
    for (const r of impactData) {
      impactMap[r.id] = r.unblocks;
    }
  }

  const prevImpactSortRef = useRef(isImpactSort);
  useEffect(() => {
    if (isImpactSort && !prevImpactSortRef.current) {
      refetchImpact();
    }
    prevImpactSortRef.current = isImpactSort;
  }, [isImpactSort, refetchImpact]);

  const filteredItems = (items ?? []).filter((item) => {
    // Tab filter
    if (tab === "all" && (item.status === "canceled" || item.status === "duplicate")) {
      return false;
    }
    if (tab === "active" && item.status !== "in_progress" && item.status !== "todo") {
      return false;
    }

    // Active filters
    if (activeFilters.statuses.length > 0 && !activeFilters.statuses.includes(item.status as never)) {
      return false;
    }
    if (activeFilters.priorities.length > 0) {
      const p = item.priority ?? "Nenhuma";
      if (!activeFilters.priorities.includes(p as never)) { return false; }
    }
    if (activeFilters.types.length > 0 && !activeFilters.types.includes(item.type)) {
      return false;
    }
    if (activeFilters.labels.length > 0) {
      let itemLabels: string[] = [];
      try { itemLabels = JSON.parse(item.labels); } catch { /* noop */ }
      if (!activeFilters.labels.some((l) => itemLabels.includes(l))) { return false; }
    }

    return true;
  });

  const handleItemClick = (item: Item) => {
    navigate(`/repos/${repoId}/items/${item.id}`);
  };

  const handleSetView = (v: ViewId) => {
    setCurrentView(v);
    save({ view: v });
  };

  const handleSetSortIdx = (i: number) => {
    setSortIdx(i);
    save({ sortIdx: i });
  };

  const handleFiltersChange = (f: ActiveFilters) => {
    setActiveFilters(f);
    save({ activeFilters: f, filterPriorities: f.priorities });
  };

  const currentSort = SORT_OPTIONS[sortIdx];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Loading items...</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4 shrink-0 gap-2 flex-wrap">
        {/* Tabs */}
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

        <div className="flex items-center gap-1 flex-wrap">
          {/* Filter + Sort */}
          <FilterBar
            items={items ?? []}
            filters={activeFilters}
            onFiltersChange={handleFiltersChange}
            sortIdx={sortIdx}
            onSortChange={handleSetSortIdx}
            sortOptions={SORT_OPTIONS}
          />

          <div className="w-px h-4 bg-border mx-0.5" />

          {/* View switcher */}
          {VIEWS.map((view) => (
            <button
              key={view.id}
              onClick={() => handleSetView(view.id)}
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
          <ItemList
            items={filteredItems}
            onItemClick={handleItemClick}
            repoId={repoId}
            sortField={currentSort.field as SortField}
            sortDir={currentSort.dir as SortDir}
            filterPriorities={activeFilters.priorities}
            impactMap={impactMap}
          />
        )}
        {currentView === "graph" && (
          <DepGraph items={filteredItems} onItemClick={handleItemClick} />
        )}
      </div>
    </div>
  );
}
