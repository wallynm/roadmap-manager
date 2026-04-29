import { useState } from "react";
import { X, FolderOpen } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { useAddRepo } from "@/hooks/useRepos";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

interface AddRepoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddRepoDialog({ open: isOpen, onOpenChange }: AddRepoDialogProps) {
  const [path, setPath] = useState("");
  const [name, setName] = useState("");
  const addRepo = useAddRepo();
  const navigate = useNavigate();

  if (!isOpen) return null;

  const handleBrowse = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (selected) {
      setPath(selected as string);
      const segments = (selected as string).split("/");
      setName(segments[segments.length - 1] || "");
    }
  };

  const handleSubmit = () => {
    if (!path || !name) return;
    addRepo.mutate(
      { name, path },
      {
        onSuccess: ([repo, report]) => {
          toast.success(`Added ${repo.name}: ${report.added} items imported`);
          navigate(`/repos/${repo.id}`);
          onOpenChange(false);
          setPath("");
          setName("");
        },
        onError: (err) => {
          toast.error(`Failed: ${err}`);
        },
      }
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => onOpenChange(false)}>
      <div className="bg-card border border-border rounded-xl w-full max-w-md p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold">Add Repository</h3>
          <button onClick={() => onOpenChange(false)} className="p-1 hover:bg-accent rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">Path</label>
            <div className="flex gap-2">
              <input
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="/Users/.../your-repo"
                className="flex-1 bg-secondary border border-border rounded px-3 py-2 text-sm"
              />
              <button
                onClick={handleBrowse}
                className="px-3 py-2 bg-secondary border border-border rounded hover:bg-accent"
              >
                <FolderOpen className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div>
            <label className="text-sm text-muted-foreground mb-1 block">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="civ-web"
              className="w-full bg-secondary border border-border rounded px-3 py-2 text-sm"
            />
          </div>

          <button
            onClick={handleSubmit}
            disabled={!path || !name || addRepo.isPending}
            className="w-full py-2 bg-primary text-primary-foreground rounded text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {addRepo.isPending ? "Scanning..." : "Add & Scan"}
          </button>
        </div>
      </div>
    </div>
  );
}
