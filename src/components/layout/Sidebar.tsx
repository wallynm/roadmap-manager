import { useNavigate, useLocation } from "react-router-dom";
import {
  ChevronDown, ChevronRight, Layers, LayoutList,
  Plus, Search, Map, FileCheck, TrendingUp, Zap,
} from "lucide-react";
import { useRepos } from "@/hooks/useRepos";
import { useItems } from "@/hooks/useItems";
import { useCheckboxCount, useSubRoadmaps } from "@/hooks/useValidation";
import { useNextItems } from "@/hooks/useNextItems";
import { cn } from "@/lib/utils";
import { useState, useEffect, type ReactNode } from "react";
import { openCommandPalette } from "@/components/command/CommandPalette";

const REPO_PATH_RE = /\/repos\/([^/]+)/;
const ITEM_PATH_RE = /\/items\/([^/]+)/;

function scopeLabel(scope: string): string {
  const parts = scope.split("/");
  return parts[parts.length - 1] ?? scope;
}

function NavItem({
  icon,
  label,
  active,
  onClick,
  end,
}: {
  icon?: ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  end?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded-lg transition-colors",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:text-foreground hover:bg-accent"
      )}
    >
      {icon && <span className="w-3.5 h-3.5 shrink-0 flex items-center justify-center">{icon}</span>}
      {!icon && <span className="w-3.5 h-3.5 shrink-0" />}
      <span className="flex-1 text-left">{label}</span>
      {end}
    </button>
  );
}

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: repos } = useRepos();

  const pathMatch = REPO_PATH_RE.exec(location.pathname);
  const activeRepoId = pathMatch?.[1];
  const itemId = ITEM_PATH_RE.exec(location.pathname)?.[1];
  const _isItemView = !!itemId && itemId !== "new";
  const activeScope = new URLSearchParams(location.search).get("scope") ?? undefined;

  return (
    <aside className="w-56 h-full bg-card flex flex-col">
      <div className="pt-3 shrink-0" />

      {/* New + Search */}
      <div className="px-3 space-y-1.5 pb-3 shrink-0">
        {activeRepoId && (
          <button
            type="button"
            onClick={() => navigate(`/repos/${activeRepoId}/items/new`)}
            className="flex items-center gap-2 w-full px-2.5 py-1.5 bg-secondary/40 border border-border rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
          >
            <Plus className="w-3 h-3 shrink-0" />
            <span className="flex-1 text-left">New item</span>
            <kbd className="text-[10px] text-muted-foreground/50 border border-border/40 px-1 py-0.5 rounded leading-none">
              ⌘N
            </kbd>
          </button>
        )}

        <button
          type="button"
          onClick={openCommandPalette}
          className="flex items-center gap-2 w-full px-2.5 py-1.5 bg-secondary/40 border border-border rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
        >
          <Search className="w-3 h-3 shrink-0" />
          <span className="flex-1 text-left">Search...</span>
          <kbd className="text-[10px] text-muted-foreground/50 border border-border/40 px-1 py-0.5 rounded leading-none">
            ⌘K
          </kbd>
        </button>

      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-1 px-3 space-y-0.5">
        {activeRepoId && (
          <ActiveRepoNav
            repoId={activeRepoId}
            activeScope={activeScope}
            onNavigate={navigate}
          />
        )}
      </nav>
    </aside>
  );
}

function ActiveRepoNav({
  repoId,
  activeScope,
  onNavigate,
}: {
  repoId: string;
  activeScope: string | undefined;
  onNavigate: (path: string) => void;
}) {
  const location = useLocation();
  const { data: items } = useItems(repoId, undefined);
  const { data: checkboxes } = useCheckboxCount(repoId);
  const { data: subRoadmaps } = useSubRoadmaps(repoId);
  const nextItems = useNextItems(repoId);
  const [expanded, setExpanded] = useState(true);

  const readyCount = nextItems.filter((s) => s.ready).length;

  const openItems = items?.filter(
    (i) => i.status !== "canceled" && i.status !== "duplicate" && i.status !== "done"
  );

  const scopes = [
    ...new Set((items ?? []).map((i) => i.scope).filter((s): s is string => !!s)),
  ].sort();

  const totalCount = openItems?.length ?? 0;
  const allActive = !activeScope && /^\/repos\/[^/]+$/.test(location.pathname);
  const roadmapActive = location.pathname === `/repos/${repoId}/roadmap`;
  const impactActive = location.pathname === `/repos/${repoId}/impact`;
  const nextActive = location.pathname === `/repos/${repoId}/next`;

  useEffect(() => {
    setExpanded(true);
  }, [repoId]);

  return (
    <div className="mt-1 space-y-0.5">
      <NavItem
        icon={<Zap className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />}
        label="Next Up"
        active={nextActive}
        onClick={() => onNavigate(`/repos/${repoId}/next`)}
        end={
          readyCount > 0 ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary shrink-0 tabular-nums">
              {readyCount}
            </span>
          ) : undefined
        }
      />

      <NavItem
        icon={<TrendingUp className="w-3.5 h-3.5" />}
        label="Impact Ranking"
        active={impactActive}
        onClick={() => onNavigate(`/repos/${repoId}/impact`)}
      />

      <NavItem
        icon={<Map className="w-3.5 h-3.5" />}
        label="Roadmap"
        active={roadmapActive}
        onClick={() => onNavigate(`/repos/${repoId}/roadmap`)}
        end={
          checkboxes && checkboxes.pending > 0 ? (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 shrink-0"
              title={checkboxes.unchecked_items.slice(0, 5).map(c => `${c.heading}: ${c.text}`).join("\n")}
            >
              <FileCheck className="w-2.5 h-2.5 inline mr-0.5" />
              {checkboxes.pending}
            </span>
          ) : undefined
        }
      />

      <NavItem
        icon={<LayoutList className="w-3.5 h-3.5" />}
        label="All items"
        active={allActive}
        onClick={() => onNavigate(`/repos/${repoId}`)}
        end={
          <div className="flex items-center gap-1 shrink-0">
            {totalCount > 0 && (
              <span className="opacity-60">{totalCount}</span>
            )}
            {scopes.length > 0 && (
              <span
                role="button"
                onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
                className="p-0.5 rounded hover:bg-accent/50 opacity-60 hover:opacity-100"
              >
                {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              </span>
            )}
          </div>
        }
      />

      {/* Scopes */}
      {expanded && scopes.length > 0 && (
        <div className="ml-3 border-l border-border/50 pl-2 space-y-0.5">
          {scopes.map((scope) => {
            const count = openItems?.filter((i) => i.scope === scope).length ?? 0;
            const isActive = activeScope === scope;
            return (
              <NavItem
                key={scope}
                icon={<Layers className="w-3.5 h-3.5" />}
                label={scopeLabel(scope)}
                active={isActive}
                onClick={() => onNavigate(`/repos/${repoId}?scope=${encodeURIComponent(scope)}`)}
                end={
                  count > 0 ? (
                    <span className="opacity-60 shrink-0">{count}</span>
                  ) : undefined
                }
              />
            );
          })}
        </div>
      )}

      {/* Sub-roadmaps */}
      {subRoadmaps && subRoadmaps.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border/30 space-y-0.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 px-2 pb-1">
            Sub-roadmaps ({subRoadmaps.length})
          </p>
          {subRoadmaps.map((sr) => (
            <div
              key={sr.path}
              className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground"
            >
              <span className="w-3.5 h-3.5 shrink-0" />
              <span className="flex-1 truncate">{sr.name}</span>
              <div className="flex items-center gap-1 shrink-0 text-[10px] opacity-60">
                {sr.planned > 0 && <span title="Planned">{sr.planned} todo</span>}
                {sr.in_progress > 0 && <span title="In progress">{sr.in_progress} wip</span>}
                {sr.done > 0 && <span title="Done">{sr.done} done</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
