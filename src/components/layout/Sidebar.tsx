import { useNavigate, useParams } from "react-router-dom";
import { Bell, Plus, Settings, Package, FolderGit2 } from "lucide-react";
import { useRepos } from "@/hooks/useRepos";
import { useItems } from "@/hooks/useItems";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { AddRepoDialog } from "@/components/modals/AddRepoDialog";

export function Sidebar() {
  const navigate = useNavigate();
  const { repoId } = useParams();
  const { data: repos } = useRepos();
  const [showAddRepo, setShowAddRepo] = useState(false);

  return (
    <aside className="w-60 h-full bg-card border-r border-border flex flex-col">
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Package className="w-5 h-5 text-primary" />
          <span className="font-semibold text-sm">Journeystudios</span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        <div className="px-3 py-1">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          >
            <Bell className="w-4 h-4" />
            <span>Inbox</span>
          </button>
        </div>

        <div className="px-3 mt-4">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-2 mb-1">
            Repos
          </h3>
          {repos?.map((repo) => (
            <RepoItem
              key={repo.id}
              name={repo.name}
              isActive={repo.id === repoId}
              onClick={() => navigate(`/repos/${repo.id}`)}
              repoId={repo.id}
            />
          ))}
        </div>

        <div className="px-3 mt-4">
          <button
            onClick={() => setShowAddRepo(true)}
            className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Add repo</span>
          </button>
        </div>
      </nav>

      <div className="border-t border-border p-3">
        <button
          onClick={() => navigate("/settings")}
          className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
        >
          <Settings className="w-4 h-4" />
          <span>Settings</span>
        </button>
      </div>

      <AddRepoDialog open={showAddRepo} onOpenChange={setShowAddRepo} />
    </aside>
  );
}

function RepoItem({
  name,
  isActive,
  onClick,
  repoId,
}: {
  name: string;
  isActive: boolean;
  onClick: () => void;
  repoId: string;
}) {
  const { data: items } = useItems(repoId, { status: undefined });
  const count = items?.filter(
    (i) => i.status !== "canceled" && i.status !== "duplicate" && i.status !== "done"
  ).length;

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center justify-between w-full px-2 py-1.5 text-sm rounded transition-colors",
        isActive ? "bg-primary/10 text-primary" : "hover:bg-accent text-foreground"
      )}
    >
      <div className="flex items-center gap-2">
        <FolderGit2 className="w-4 h-4" />
        <span className="truncate">{name}</span>
      </div>
      {count !== undefined && count > 0 && (
        <span className="text-xs text-muted-foreground">{count}</span>
      )}
    </button>
  );
}
