import { useNavigate, useLocation } from "react-router-dom";
import { useRepos } from "@/hooks/useRepos";
import { Plus, Settings, ShieldCheck, Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { AddRepoDialog } from "@/components/modals/AddRepoDialog";
import { parseRepoDisplay } from "@/lib/tauri";
import { Tooltip } from "@/components/ui/Tooltip";
import { openInbox } from "@/components/inbox/InboxModal";

const REPO_RE = /\/repos\/([^/]+)/;

const AVATAR_COLORS = [
  "bg-indigo-500",
  "bg-violet-500",
  "bg-sky-500",
  "bg-emerald-600",
  "bg-amber-500",
  "bg-rose-500",
  "bg-teal-500",
  "bg-pink-600",
];

function avatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) & 0xffffffff;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initials(name: string): string {
  return name
    .split(/[\s\-_./]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

export function ProjectRail() {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: repos } = useRepos();
  const [showAddRepo, setShowAddRepo] = useState(false);

  const activeRepoId = REPO_RE.exec(location.pathname)?.[1];
  const isSettings = location.pathname === "/settings";
  const isValidate = activeRepoId && location.pathname === `/repos/${activeRepoId}/validate`;

  return (
    <div className="w-[60px] h-full flex flex-col items-center py-3 shrink-0 border-r border-dashed border-border/70" style={{ backgroundColor: "hsl(240, 24%, 7%)" }}>
      {/* Repo icons */}
      <div className="flex flex-col items-center gap-1.5 flex-1 overflow-y-auto w-full scrollbar-none">
        {repos?.map((repo) => {
          const isActive = repo.id === activeRepoId;
          const customColor = parseRepoDisplay(repo.config).color;
          return (
            <div key={repo.id} className="relative flex items-center justify-center w-full py-0.5">
              <span
                className={cn(
                  "absolute left-0 w-[3px] rounded-r-full bg-foreground transition-all duration-200",
                  isActive ? "h-9" : "h-0"
                )}
              />
              <Tooltip content={repo.name}>
                <button
                  onClick={() => navigate(`/repos/${repo.id}`)}
                  className={cn(
                    "w-9 h-9 flex items-center justify-center text-white text-[11px] font-bold select-none transition-all duration-200",
                    isActive ? "rounded-[12px]" : "rounded-full hover:rounded-[12px]",
                    !customColor && avatarColor(repo.id)
                  )}
                  style={customColor ? { backgroundColor: customColor } : undefined}
                >
                  {initials(repo.name)}
                </button>
              </Tooltip>
            </div>
          );
        })}

        {/* Divider */}
        {(repos?.length ?? 0) > 0 && (
          <div className="w-6 h-px bg-border/60 my-1" />
        )}

        {/* Add project */}
        <div className="relative flex items-center justify-center w-full py-0.5">
          <Tooltip content="Add project">
            <button
              onClick={() => setShowAddRepo(true)}
              className="w-9 h-9 rounded-full hover:rounded-[12px] transition-all duration-200 flex items-center justify-center bg-secondary/50 text-muted-foreground hover:bg-primary/15 hover:text-primary"
            >
              <Plus className="w-4 h-4" />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Notifications */}
      <div className="relative flex items-center justify-center w-full py-0.5">
        <Tooltip content="Notifications">
          <button
            onClick={openInbox}
            className="w-9 h-9 rounded-full hover:rounded-[12px] flex items-center justify-center transition-all duration-200 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Bell className="w-4 h-4" />
          </button>
        </Tooltip>
      </div>

      {/* Validate */}
      {activeRepoId && (
        <div className="relative flex items-center justify-center w-full py-0.5">
          <span
            className={cn(
              "absolute left-0 w-[3px] rounded-r-full bg-foreground transition-all duration-200",
              isValidate ? "h-9" : "h-0"
            )}
          />
          <Tooltip content="Validate">
            <button
              onClick={() => navigate(`/repos/${activeRepoId}/validate`)}
              className={cn(
                "w-9 h-9 flex items-center justify-center transition-all duration-200",
                isValidate
                  ? "rounded-[12px] bg-accent text-foreground"
                  : "rounded-full hover:rounded-[12px] text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <ShieldCheck className="w-4 h-4" />
            </button>
          </Tooltip>
        </div>
      )}

      {/* Settings */}
      <div className="relative flex items-center justify-center w-full py-0.5">
        <span
          className={cn(
            "absolute left-0 w-[3px] rounded-r-full bg-foreground transition-all duration-200",
            isSettings ? "h-9" : "h-0"
          )}
        />
        <Tooltip content="Settings">
          <button
            onClick={() =>
              navigate(activeRepoId ? `/settings?repo=${activeRepoId}` : "/settings")
            }
            className={cn(
              "w-9 h-9 flex items-center justify-center transition-all duration-200",
              isSettings
                ? "rounded-[12px] bg-accent text-foreground"
                : "rounded-full hover:rounded-[12px] text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            <Settings className="w-4 h-4" />
          </button>
        </Tooltip>
      </div>

      <AddRepoDialog open={showAddRepo} onOpenChange={setShowAddRepo} />
    </div>
  );
}
