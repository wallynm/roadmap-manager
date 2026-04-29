import { useEffect, useState } from "react";
import { Command } from "cmdk";
import { useNavigate, useLocation } from "react-router-dom";
import { useRepos, useRescanRepo } from "@/hooks/useRepos";
import { useItems } from "@/hooks/useItems";
import { useValidateRepo, useArchiveDryRun } from "@/hooks/useValidation";
import { STATUS_CONFIG, cn } from "@/lib/utils";
import { Search } from "lucide-react";

const REPO_RE = /\/repos\/([^/]+)/;

let _openCommandPalette: (() => void) | null = null;

export function openCommandPalette() {
  _openCommandPalette?.();
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  const { data: repos } = useRepos();
  const rescanRepo = useRescanRepo();

  const repoId = REPO_RE.exec(location.pathname)?.[1] ?? null;
  const validateRepo = useValidateRepo(repoId ?? "");
  const archiveDryRun = useArchiveDryRun(repoId ?? "");
  const searchActive = search.trim().length >= 2;
  const { data: itemResults } = useItems(
    searchActive ? repoId : null,
    searchActive ? { search: search.trim() } : undefined
  );

  useEffect(() => {
    _openCommandPalette = () => setOpen(true);
    return () => {
      _openCommandPalette = null;
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh] bg-black/60 backdrop-blur-sm"
      onClick={() => { setOpen(false); setSearch(""); }}
    >
      <div className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <Command
          className="bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
          shouldFilter={!searchActive}
        >
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <Command.Input
              value={search}
              onValueChange={setSearch}
              placeholder="Search items, run command..."
              className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-muted-foreground"
              autoFocus
            />
            <kbd className="text-xs text-muted-foreground border border-border px-1.5 py-0.5 rounded shrink-0">esc</kbd>
          </div>
          <Command.List className="max-h-80 overflow-y-auto p-2">
            <Command.Empty className="text-sm text-muted-foreground text-center py-6">
              No results found.
            </Command.Empty>

            {searchActive && itemResults && itemResults.length > 0 && (
              <Command.Group heading="Items" className="text-xs text-muted-foreground px-2 py-1">
                {itemResults.map((item) => {
                  const cfg = STATUS_CONFIG[item.status];
                  const Icon = cfg.icon;
                  return (
                    <Command.Item
                      key={item.id}
                      value={`${item.external_id} ${item.title}`}
                      onSelect={() => {
                        navigate(`/repos/${item.repo_id}/items/${item.id}`);
                        setOpen(false);
                        setSearch("");
                      }}
                      className="flex items-center gap-2 px-3 py-2 text-sm rounded cursor-pointer hover:bg-accent data-[selected]:bg-accent"
                    >
                      <Icon className={cn("w-3.5 h-3.5 shrink-0", cfg.color)} />
                      <span className="font-mono text-xs text-muted-foreground shrink-0">{item.external_id}</span>
                      <span className="truncate">{item.title}</span>
                    </Command.Item>
                  );
                })}
              </Command.Group>
            )}

            {!searchActive && (
              <>
                <Command.Group heading="Navigate" className="text-xs text-muted-foreground px-2 py-1">
                  {repos?.map((repo) => (
                    <Command.Item
                      key={repo.id}
                      onSelect={() => { navigate(`/repos/${repo.id}`); setOpen(false); setSearch(""); }}
                      className="flex items-center gap-2 px-3 py-2 text-sm rounded cursor-pointer hover:bg-accent data-[selected]:bg-accent"
                    >
                      {repo.name}
                    </Command.Item>
                  ))}
                  <Command.Item
                    onSelect={() => { navigate("/settings"); setOpen(false); setSearch(""); }}
                    className="flex items-center gap-2 px-3 py-2 text-sm rounded cursor-pointer hover:bg-accent data-[selected]:bg-accent"
                  >
                    Settings
                  </Command.Item>
                </Command.Group>

                <Command.Group heading="Actions" className="text-xs text-muted-foreground px-2 py-1">
                  {repoId && (
                    <>
                      <Command.Item
                        onSelect={() => {
                          validateRepo.mutate();
                          navigate(`/repos/${repoId}?tab=all`);
                          setOpen(false);
                          setSearch("");
                        }}
                        className="flex items-center gap-2 px-3 py-2 text-sm rounded cursor-pointer hover:bg-accent data-[selected]:bg-accent"
                      >
                        Validate repo
                      </Command.Item>
                      <Command.Item
                        onSelect={() => {
                          archiveDryRun.mutate();
                          setOpen(false);
                          setSearch("");
                        }}
                        className="flex items-center gap-2 px-3 py-2 text-sm rounded cursor-pointer hover:bg-accent data-[selected]:bg-accent"
                      >
                        Archive shipped items
                      </Command.Item>
                    </>
                  )}
                  {repos?.map((repo) => (
                    <Command.Item
                      key={`rescan-${repo.id}`}
                      onSelect={() => { rescanRepo.mutate(repo.id); setOpen(false); setSearch(""); }}
                      className="flex items-center gap-2 px-3 py-2 text-sm rounded cursor-pointer hover:bg-accent data-[selected]:bg-accent"
                    >
                      Rescan {repo.name}
                    </Command.Item>
                  ))}
                </Command.Group>
              </>
            )}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
