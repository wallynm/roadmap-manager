import { useEffect, useState } from "react";
import { Command } from "cmdk";
import { useNavigate } from "react-router-dom";
import { useRepos, useRescanRepo } from "@/hooks/useRepos";
import { useItems } from "@/hooks/useItems";
import { Search } from "lucide-react";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  const { data: repos } = useRepos();
  const rescanRepo = useRescanRepo();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh] bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)}>
      <div className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <Command className="bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <Search className="w-4 h-4 text-muted-foreground" />
            <Command.Input
              value={search}
              onValueChange={setSearch}
              placeholder="Search items, run command..."
              className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-muted-foreground"
              autoFocus
            />
            <kbd className="text-xs text-muted-foreground border border-border px-1.5 py-0.5 rounded">esc</kbd>
          </div>
          <Command.List className="max-h-80 overflow-y-auto p-2">
            <Command.Empty className="text-sm text-muted-foreground text-center py-6">
              No results found.
            </Command.Empty>

            <Command.Group heading="Commands" className="text-xs text-muted-foreground px-2 py-1">
              <Command.Item
                onSelect={() => { navigate("/settings"); setOpen(false); }}
                className="flex items-center gap-2 px-3 py-2 text-sm rounded cursor-pointer hover:bg-accent data-[selected]:bg-accent"
              >
                Open Settings
              </Command.Item>
              {repos?.map((repo) => (
                <Command.Item
                  key={`rescan-${repo.id}`}
                  onSelect={() => { rescanRepo.mutate(repo.id); setOpen(false); }}
                  className="flex items-center gap-2 px-3 py-2 text-sm rounded cursor-pointer hover:bg-accent data-[selected]:bg-accent"
                >
                  Rescan {repo.name}
                </Command.Item>
              ))}
            </Command.Group>

            <Command.Group heading="Switch Repo" className="text-xs text-muted-foreground px-2 py-1">
              {repos?.map((repo) => (
                <Command.Item
                  key={repo.id}
                  onSelect={() => { navigate(`/repos/${repo.id}`); setOpen(false); }}
                  className="flex items-center gap-2 px-3 py-2 text-sm rounded cursor-pointer hover:bg-accent data-[selected]:bg-accent"
                >
                  {repo.name}
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
