import { useNavigate, useLocation } from "react-router-dom";
import { Bell, ChevronDown, ChevronRight, Layers, Plus, Search } from "lucide-react";
import { useRepos } from "@/hooks/useRepos";
import { useItems } from "@/hooks/useItems";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { openCommandPalette } from "@/components/command/CommandPalette";
import { openInbox } from "@/components/inbox/InboxModal";

const REPO_PATH_RE = /\/repos\/([^/]+)/;
const ITEM_PATH_RE = /\/items\/([^/]+)/;

function scopeLabel(scope: string): string {
  const parts = scope.split("/");
  return parts[parts.length - 1] ?? scope;
}

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: repos } = useRepos();

  const pathMatch = REPO_PATH_RE.exec(location.pathname);
  const activeRepoId = pathMatch?.[1];
  const itemId = ITEM_PATH_RE.exec(location.pathname)?.[1];
  const isItemView = !!itemId && itemId !== "new";
  const activeScope = new URLSearchParams(location.search).get("scope") ?? undefined;

  const activeRepo = repos?.find((r) => r.id === activeRepoId);

  return (
    <aside className="w-56 h-full bg-card flex flex-col">
      <div className="pt-3 shrink-0" />

      {/* New + Search */}
      <div className="px-3 space-y-1.5 pb-3 shrink-0">
        {activeRepoId && !isItemView && (
          <button
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
          onClick={openCommandPalette}
          className="flex items-center gap-2 w-full px-2.5 py-1.5 bg-secondary/40 border border-border rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
        >
          <Search className="w-3 h-3 shrink-0" />
          <span className="flex-1 text-left">Search...</span>
          <kbd className="text-[10px] text-muted-foreground/50 border border-border/40 px-1 py-0.5 rounded leading-none">
            ⌘K
          </kbd>
        </button>

        <button
          onClick={openInbox}
          className="flex items-center gap-2 w-full px-2.5 py-1.5 bg-secondary/40 border border-border rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
        >
          <Bell className="w-3 h-3 shrink-0" />
          <span className="flex-1 text-left">Inbox</span>
          <kbd className="text-[10px] text-muted-foreground/50 border border-border/40 px-1 py-0.5 rounded leading-none">
            ⌘I
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
  const [expanded, setExpanded] = useState(true);

  const openItems = items?.filter(
    (i) => i.status !== "canceled" && i.status !== "duplicate" && i.status !== "done"
  );

  const scopes = [
    ...new Set((items ?? []).map((i) => i.scope).filter((s): s is string => !!s)),
  ].sort();

  const totalCount = openItems?.length ?? 0;
  const allActive = !activeScope && REPO_PATH_RE.test(location.pathname);

  useEffect(() => {
    setExpanded(true);
  }, [repoId]);

  return (
    <div className="mt-1 space-y-0.5">
      {/* All items row */}
      <div
        className={cn(
          "flex items-center justify-between w-full px-2 py-1.5 text-sm rounded transition-colors",
          allActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-accent"
        )}
      >
        <button
          className="flex-1 text-left"
          onClick={() => onNavigate(`/repos/${repoId}`)}
        >
          All items
        </button>
        <div className="flex items-center gap-1 shrink-0">
          {totalCount > 0 && (
            <span className="text-xs opacity-60">{totalCount}</span>
          )}
          {scopes.length > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
              className="p-0.5 rounded hover:bg-accent/50 opacity-60 hover:opacity-100"
            >
              {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            </button>
          )}
        </div>
      </div>

      {/* Scopes */}
      {expanded && scopes.length > 0 && (
        <div className="ml-3 border-l border-border/50 pl-2 space-y-0.5">
          {scopes.map((scope) => {
            const count = openItems?.filter((i) => i.scope === scope).length ?? 0;
            const isActive = activeScope === scope;
            return (
              <button
                key={scope}
                onClick={() =>
                  onNavigate(`/repos/${repoId}?scope=${encodeURIComponent(scope)}`)
                }
                className={cn(
                  "flex items-center justify-between w-full px-2 py-1 text-xs rounded transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <Layers className="w-3 h-3 shrink-0" />
                  <span className="truncate">{scopeLabel(scope)}</span>
                </div>
                {count > 0 && (
                  <span className="text-xs opacity-60 shrink-0">{count}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
