import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { useState, useRef, useEffect, useMemo } from "react";
import { useItems } from "@/hooks/useItems";
import { useImpactRanking } from "@/hooks/useValidation";
import { useRepoPrefs, saveLastRepo, type ViewId } from "@/hooks/usePrefs";
import { KanbanBoard } from "@/components/kanban/KanbanBoard";
import { ItemList, type SortField, type SortDir } from "@/components/list/ItemList";
import { DepGraph } from "@/components/graph/DepGraph";
import type { Item, ItemFilters, Priority } from "@/types";
import { PRIORITY_CONFIG } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { ValidationPanel } from "@/components/validation/ValidationPanel";
import { LayoutGrid, List, GitBranch, ShieldCheck, ArrowUpDown, SlidersHorizontal, X } from "lucide-react";

const VIEWS = [
  { id: "kanban", label: "Kanban", icon: LayoutGrid },
  { id: "list", label: "List", icon: List },
  { id: "graph", label: "Graph", icon: GitBranch },
  { id: "validation", label: "Validate", icon: ShieldCheck },
] as const;

const TABS = [
  { id: "all", label: "All items" },
  { id: "active", label: "Active" },
  { id: "backlog", label: "Backlog" },
  { id: "done", label: "Done" },
] as const;

const SORT_OPTIONS: { field: SortField; dir: SortDir; label: string }[] = [
  { field: "default",      dir: "asc",  label: "Default" },
  { field: "priority",     dir: "asc",  label: "Priority ↑" },
  { field: "priority",     dir: "desc", label: "Priority ↓" },
  { field: "created_date", dir: "desc", label: "Newest first" },
  { field: "created_date", dir: "asc",  label: "Oldest first" },
  { field: "impact",       dir: "desc", label: "Impact (most unblocking)" },
];

const PRIORITIES: Priority[] = ["Urgente", "Alta", "Média", "Baixa", "Nenhuma"];

function useClickOutside(ref: React.RefObject<HTMLElement | null>, onClose: () => void, enabled: boolean) {
  useEffect(() => {
    if (!enabled) { return; }
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { onClose(); }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [ref, onClose, enabled]);
}

export function RepoView() {
  const { repoId } = useParams<{ repoId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { initial, save } = useRepoPrefs(repoId!);

  const [currentView, setCurrentView] = useState<ViewId>(initial.view);
  const [sortIdx, setSortIdx] = useState(initial.sortIdx);
  const [filterPriorities, setFilterPriorities] = useState<Priority[]>(initial.filterPriorities);
  const [sortOpen, setSortOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);

  // Sync state when navigating between repos and track last visited
  useEffect(() => {
    if (!repoId) { return; }
    saveLastRepo(repoId);
    const p = initial;
    setCurrentView(p.view);
    setSortIdx(p.sortIdx);
    setFilterPriorities(p.filterPriorities);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoId]);

  useClickOutside(sortRef, () => setSortOpen(false), sortOpen);
  useClickOutside(filterRef, () => setFilterOpen(false), filterOpen);

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

  const impactMutation = useImpactRanking(repoId || "");
  const isImpactSort = SORT_OPTIONS[sortIdx]?.field === "impact";

  const impactMap: Record<string, number> = {};
  if (impactMutation.data) {
    for (const r of impactMutation.data) {
      impactMap[r.id] = r.unblocks;
    }
  }

  const prevImpactSortRef = useRef(isImpactSort);
  useEffect(() => {
    if (isImpactSort && !prevImpactSortRef.current) {
      impactMutation.mutate();
    }
    prevImpactSortRef.current = isImpactSort;
  }, [isImpactSort]);

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

  const handleSetView = (v: ViewId) => {
    setCurrentView(v);
    save({ view: v });
  };

  const handleSetSortIdx = (i: number) => {
    setSortIdx(i);
    save({ sortIdx: i });
  };

  const togglePriority = (p: Priority) => {
    setFilterPriorities((prev) => {
      const next = prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p];
      save({ filterPriorities: next });
      return next;
    });
  };

  const clearAll = () => {
    setSortIdx(0);
    setFilterPriorities([]);
    save({ sortIdx: 0, filterPriorities: [] });
  };

  const currentSort = SORT_OPTIONS[sortIdx];
  const hasActiveFilters = filterPriorities.length > 0;
  const isNonDefault = sortIdx > 0 || hasActiveFilters;

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
      <div className="flex items-center justify-between mb-4 shrink-0 gap-2">
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
          {/* Sort + Filter */}
          <>
            {/* Sort */}
              <div ref={sortRef} className="relative">
                <button
                  onClick={() => { setSortOpen((v) => !v); setFilterOpen(false); }}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md transition-colors",
                    sortIdx > 0
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  )}
                >
                  <ArrowUpDown className="w-3 h-3" />
                  {sortIdx > 0 ? currentSort.label : "Sort"}
                </button>
                {sortOpen && (
                  <div className="absolute right-0 top-full mt-1 z-50 w-40 bg-popover border border-border rounded-lg shadow-xl overflow-hidden">
                    {SORT_OPTIONS.map((opt, i) => (
                      <button
                        key={i}
                        onClick={() => { handleSetSortIdx(i); setSortOpen(false); }}
                        className={cn(
                          "flex items-center w-full px-3 py-1.5 text-xs hover:bg-accent/50 transition-colors text-left",
                          i === sortIdx ? "bg-primary/10 text-primary" : "text-foreground"
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Filter */}
              <div ref={filterRef} className="relative">
                <button
                  onClick={() => { setFilterOpen((v) => !v); setSortOpen(false); }}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md transition-colors",
                    hasActiveFilters
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  )}
                >
                  <SlidersHorizontal className="w-3 h-3" />
                  {hasActiveFilters ? `Filters (${filterPriorities.length})` : "Filter"}
                </button>
                {filterOpen && (
                  <div className="absolute right-0 top-full mt-1 z-50 w-48 bg-popover border border-border rounded-lg shadow-xl overflow-hidden">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 px-3 pt-2.5 pb-1">
                      Priority
                    </p>
                    {PRIORITIES.map((p) => {
                      const cfg = PRIORITY_CONFIG[p];
                      const active = filterPriorities.includes(p);
                      return (
                        <button
                          key={p}
                          onClick={() => togglePriority(p)}
                          className={cn(
                            "flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-accent/50 transition-colors text-left",
                            active && "bg-primary/10"
                          )}
                        >
                          <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", cfg.color.replace("text-", "bg-"))} />
                          <span className={cn(active ? cfg.color : "text-foreground")}>{p}</span>
                          {active && <span className="ml-auto text-primary">✓</span>}
                        </button>
                      );
                    })}
                    {hasActiveFilters && (
                      <button
                        onClick={() => { setFilterPriorities([]); save({ filterPriorities: [] }); }}
                        className="flex items-center gap-1.5 w-full px-3 py-2 text-xs text-muted-foreground hover:text-foreground border-t border-border transition-colors"
                      >
                        <X className="w-3 h-3" /> Clear filters
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Clear all */}
              {isNonDefault && (
                <button
                  onClick={clearAll}
                  className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-accent transition-colors"
                  title="Reset sort & filters"
                >
                  <X className="w-3 h-3" />
                </button>
              )}

              <div className="w-px h-4 bg-border mx-0.5" />
            </>

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
            sortField={currentSort.field}
            sortDir={currentSort.dir}
            filterPriorities={filterPriorities}
            impactMap={impactMap}
          />
        )}
        {currentView === "graph" && (
          <DepGraph items={filteredItems} onItemClick={handleItemClick} />
        )}
        {currentView === "validation" && (
          <ValidationPanel repoId={repoId!} />
        )}
      </div>
    </div>
  );
}
