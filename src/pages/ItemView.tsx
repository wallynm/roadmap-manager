import { useParams, useNavigate, Link } from "react-router-dom";
import {
  useItem, useItems, useUpdateItem, useStartItem, useCompleteItem,
  useCancelItem, usePlanItem,
  useAddDependency, useRemoveDependency,
  useAddRelation, useRemoveRelation,
} from "@/hooks/useItems";
import { useRepos } from "@/hooks/useRepos";
import { BlockNoteEditor } from "@/components/editor/BlockNoteEditor";
import { CommentList } from "@/components/comments/CommentList";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Textarea } from "@/components/ui/Input";
import { STATUS_CONFIG, PRIORITY_CONFIG, parseLabels, parseDependsOn, parseRelatesTo, formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { Comment, Item, ItemStatus, Priority } from "@/types";
import { useState, useEffect, useRef, useMemo, useCallback, type ReactNode } from "react";
import { toast } from "sonner";
import { ChevronRight, ChevronDown, X, Lock, Plus, Link2, PanelRightClose, PanelRightOpen, Copy, Check } from "lucide-react";

const SIDEBAR_PREF_KEY = "item-sidebar-open";
function getSidebarPref(): boolean {
  try { return localStorage.getItem(SIDEBAR_PREF_KEY) !== "false"; } catch { return true; }
}
function setSidebarPref(v: boolean) {
  try { localStorage.setItem(SIDEBAR_PREF_KEY, v ? "true" : "false"); } catch { /* noop */ }
}

function extractFirstHeading(markdown: string): string | null {
  const match = /^#\s+(.+)/m.exec(markdown);
  return match ? match[1].trim() : null;
}

function stripFirstHeading(markdown: string): string {
  return markdown.replace(/^#[^\n]*\n?/, "").trimStart();
}

// New format: "## comment: Author Name - YYYY-MM-DD HH:MM"
const COMMENT_ENTRY_RE = /^## comment:\s*(.+?)\s*-\s*(\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2})?)\s*$/i;

function findFirstCommentIdx(body: string): number {
  // New format entries
  const newIdx = body.search(/\n## comment:/i);
  if (newIdx !== -1) {
    return newIdx;
  }
  // Legacy format: ## Comments container
  const legacyIdx = body.search(/\n## Comments\b/);
  return legacyIdx;
}

function splitAtComments(body: string): [main: string, comments: string] {
  const idx = findFirstCommentIdx(body);
  if (idx === -1) {
    return [body, ""];
  }
  return [body.slice(0, idx).trimEnd(), body.slice(idx)];
}

function extractCommentsSection(markdown: string): string {
  return splitAtComments(markdown)[1];
}

function stripCommentsSection(markdown: string): string {
  return splitAtComments(markdown)[0];
}

function parseComments(body: string): Comment[] {
  const [, commentsRaw] = splitAtComments(body);
  if (!commentsRaw) {
    return [];
  }
  return commentsRaw
    .split(/\n(?=## comment:)/i)
    .map((chunk, i) => {
      const lines = chunk.trim().split("\n");
      const m = COMMENT_ENTRY_RE.exec(lines[0] ?? "");
      if (!m) {
        return null;
      }
      const author = m[1].trim();
      const created_at = m[2].trim();
      const commentBody = lines.slice(1).join("\n").trim();
      if (!commentBody) {
        return null;
      }
      return {
        id: `parsed-${i}`,
        item_id: "",
        author,
        is_agent: author.endsWith("(auto)") ? 1 : 0,
        body: commentBody,
        created_at,
      } satisfies Comment;
    })
    .filter((c): c is Comment => c !== null);
}

function DepAutocomplete({
  query,
  onQueryChange,
  allItems,
  onSelect,
}: {
  query: string;
  onQueryChange: (v: string) => void;
  allItems: Item[];
  onSelect: (item: Item) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);

  const suggestions = query.trim().length > 0
    ? allItems
        .filter((i) =>
          i.external_id.toLowerCase().includes(query.toLowerCase()) ||
          i.title.toLowerCase().includes(query.toLowerCase())
        )
        .slice(0, 8)
    : [];

  useEffect(() => { setActiveIdx(0); }, [query]);

  useEffect(() => {
    if (!open) { return; }
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const confirm = (item: Item) => {
    onSelect(item);
    setOpen(false);
    onQueryChange("");
    setActiveIdx(0);
  };

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center gap-1 border-b border-transparent focus-within:border-border transition-colors pb-0.5">
        <Plus className="w-3 h-3 text-muted-foreground/40 shrink-0" />
        <input
          value={query}
          onChange={(e) => { onQueryChange(e.target.value); setOpen(true); }}
          onFocus={() => { if (query.trim()) { setOpen(true); } }}
          onKeyDown={(e) => {
            if (e.key === "Escape") { setOpen(false); return; }
            if (!open || suggestions.length === 0) { return; }
            if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1)); return; }
            if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); return; }
            if (e.key === "Enter") { e.preventDefault(); const s = suggestions[activeIdx]; if (s) { confirm(s); } }
          }}
          placeholder="Add dependency…"
          className="flex-1 bg-transparent text-xs text-muted-foreground placeholder:text-muted-foreground/40 focus:outline-none"
        />
      </div>
      {open && suggestions.length > 0 && (
        <div className="absolute left-0 top-full mt-1 z-50 w-full bg-popover border border-border rounded-lg shadow-xl overflow-hidden">
          {suggestions.map((s, i) => {
            const cfg = STATUS_CONFIG[s.status];
            const Icon = cfg.icon;
            return (
              <button
                key={s.id}
                onMouseDown={(e) => { e.preventDefault(); confirm(s); }}
                className={cn(
                  "flex items-center gap-2 w-full px-3 py-1.5 text-left transition-colors",
                  i === activeIdx ? "bg-accent/60" : "hover:bg-accent/40"
                )}
              >
                <Icon className={cn("w-3 h-3 shrink-0", cfg.color)} />
                <span className="text-[11px] font-mono text-muted-foreground/60 shrink-0">{s.external_id}</span>
                <span className="text-xs text-foreground truncate">{s.title}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const STATUSES: ItemStatus[] = ["backlog", "todo", "in_progress", "done", "canceled", "duplicate"];
const PRIORITIES: Priority[] = ["Urgente", "Alta", "Média", "Baixa", "Nenhuma"];

function FieldSelect<T extends string>({
  value,
  options,
  renderOption,
  renderValue,
  onChange,
}: {
  value: T | null;
  options: T[];
  renderOption: (v: T) => ReactNode;
  renderValue: (v: T | null) => ReactNode;
  onChange: (v: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) { return; }
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-accent/50 transition-colors group ml-auto"
      >
        {renderValue(value)}
        <ChevronDown className="w-3 h-3 text-muted-foreground/40 shrink-0 group-hover:text-muted-foreground/70 transition-colors" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 min-w-[140px] bg-popover border border-border rounded-lg shadow-xl overflow-hidden">
          {options.map((opt) => (
            <button
              key={opt}
              onClick={() => { onChange(opt); setOpen(false); }}
              className={cn(
                "flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-accent/50 transition-colors text-left",
                opt === value && "bg-primary/10"
              )}
            >
              {renderOption(opt)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PropRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center min-h-[28px] px-2">
      <span className="text-xs text-muted-foreground/60 w-20 shrink-0">{label}</span>
      <div className="flex-1 min-w-0 flex items-center justify-end">{children}</div>
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-2 pt-4 pb-1 border-t border-border/40 mt-2">
      {children}
    </p>
  );
}

export function ItemView() {
  const { repoId, itemId } = useParams<{ repoId: string; itemId: string }>();
  const navigate = useNavigate();
  const { data: item, isLoading } = useItem(itemId ?? null);
  const { data: allItems = [] } = useItems(repoId ?? null, undefined);
  const comments = useMemo(() => parseComments(item?.body ?? ""), [item?.body]);
  const { data: repos } = useRepos();
  const repo = repos?.find((r) => r.id === repoId);

  const updateItem = useUpdateItem();
  const startItem = useStartItem();
  const completeItem = useCompleteItem();
  const cancelItem = useCancelItem();
  const planItem = usePlanItem();
  const addDep = useAddDependency();
  const removeDep = useRemoveDependency();
  const addRel = useAddRelation();
  const removeRel = useRemoveRelation();

  const [sidebarOpen, setSidebarOpen] = useState(getSidebarPref);
  const [editTitle, setEditTitle] = useState("");
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [note, setNote] = useState("");
  const [labelInput, setLabelInput] = useState("");
  const [depInput, setDepInput] = useState("");
  const [relInput, setRelInput] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const bodyRef = useRef("");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editTitleRef = useRef("");
  const itemRef = useRef<Item | undefined>(undefined);
  const updateMutateRef = useRef(updateItem.mutate);
  const hasFirstBodyChangeRef = useRef(false);

  editTitleRef.current = editTitle;
  itemRef.current = item;
  updateMutateRef.current = updateItem.mutate;

  const doSave = useCallback(() => {
    const currentItem = itemRef.current;
    if (!currentItem) { return; }
    const commentsSection = extractCommentsSection(currentItem.body ?? "");
    const fullBody = `# ${editTitleRef.current}\n\n${bodyRef.current}${commentsSection}`;
    setSaveStatus("saving");
    updateMutateRef.current(
      { id: currentItem.id, title: editTitleRef.current, body: fullBody },
      {
        onSuccess: () => {
          setSaveStatus("saved");
          setTimeout(() => setSaveStatus("idle"), 2000);
        },
        onError: () => setSaveStatus("idle"),
      }
    );
  }, []);

  const scheduleAutoSave = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(doSave, 2000);
  }, [doSave]);

  const toggleSidebar = () => setSidebarOpen((v) => { setSidebarPref(!v); return !v; });

  const [copied, setCopied] = useState(false);
  const copyPath = () => {
    const fullPath = repo ? `${repo.path}/${item?.file_path}` : (item?.file_path ?? "");
    navigator.clipboard.writeText(fullPath).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  useEffect(() => {
    if (item) {
      hasFirstBodyChangeRef.current = false;
      const titleFromBody = extractFirstHeading(item.body ?? "");
      setEditTitle(titleFromBody ?? item.title);
      bodyRef.current = stripCommentsSection(stripFirstHeading(item.body ?? ""));
    }
  }, [item?.id]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Loading…
      </div>
    );
  }

  if (!item) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Item not found.
      </div>
    );
  }

  const labels = parseLabels(item.labels);
  const deps = parseDependsOn(item.depends_on);
  const relations = parseRelatesTo(item.relates_to);

  const handleStatusChange = (status: ItemStatus) => {
    const isDone = item.status === "done" || item.status === "canceled";
    if (status === "in_progress") {
      startItem.mutate(item.id, {
        onSuccess: () => toast.success(`${item.external_id} started`),
      });
    } else if (status === "done") {
      setShowNoteInput(true);
    } else if (status === "canceled") {
      cancelItem.mutate({ id: item.id }, {
        onSuccess: () => toast.success(`${item.external_id} canceled`),
      });
    } else if (isDone) {
      planItem.mutate(item.id, {
        onSuccess: () => toast.success(`${item.external_id} re-opened`),
      });
    } else {
      updateItem.mutate({ id: item.id, status }, {
        onSuccess: () => toast.success(`Status → ${STATUS_CONFIG[status].label}`),
      });
    }
  };

  const handleConfirmComplete = () => {
    completeItem.mutate(
      { id: item.id, note: note || undefined },
      { onSuccess: () => { toast.success(`${item.external_id} completed`); setShowNoteInput(false); setNote(""); } }
    );
  };

  const handlePriorityChange = (priority: Priority) => {
    updateItem.mutate(
      { id: item.id, priority },
      { onSuccess: () => toast.success(`Priority → ${priority}`) }
    );
  };

  const handleAddLabel = (label: string) => {
    const trimmed = label.trim();
    if (!trimmed || labels.includes(trimmed)) { return; }
    updateItem.mutate({ id: item.id, labels: [...labels, trimmed] });
  };

  const handleRemoveLabel = (label: string) => {
    updateItem.mutate({ id: item.id, labels: labels.filter((l) => l !== label) });
  };

  const handleRemoveDep = (externalId: string) => {
    removeDep.mutate({ id: item.id, blockerId: externalId });
  };

  const handleRemoveRelation = (externalId: string) => {
    removeRel.mutate({ id: item.id, relatedId: externalId });
  };

  return (
    <div className="h-full flex flex-col">
      {/* Breadcrumb */}
      <div className="flex items-center mb-4 shrink-0 gap-2">
        <nav className="flex items-center gap-1.5 text-sm flex-1 min-w-0">
          <Link to={`/repos/${repoId}`} className="text-muted-foreground hover:text-foreground transition-colors">
            {repo?.name ?? "Repo"}
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
          <Link to={`/repos/${repoId}`} className="text-muted-foreground hover:text-foreground transition-colors font-mono text-xs">
            {item.external_id}
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-foreground truncate max-w-sm">{item.title}</span>
        </nav>
        {saveStatus === "saving" && (
          <span className="text-xs text-muted-foreground animate-pulse shrink-0">Saving…</span>
        )}
        {saveStatus === "saved" && (
          <span className="text-xs text-green-500/70 shrink-0">Saved</span>
        )}
        <button
          onClick={copyPath}
          className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
          title={copied ? "Copied!" : "Copy file path"}
        >
          {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
        </button>
        <button
          onClick={toggleSidebar}
          className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
          title={sidebarOpen ? "Hide properties" : "Show properties"}
        >
          {sidebarOpen
            ? <PanelRightClose className="w-4 h-4" />
            : <PanelRightOpen className="w-4 h-4" />
          }
        </button>
      </div>

      {/* Main layout */}
      <div className="flex gap-8 flex-1 min-h-0">
        {/* Left — content */}
        <div className="flex-1 min-w-0 overflow-y-auto space-y-6 px-0.5 pr-2">
          <input
            value={editTitle}
            onChange={(e) => { setEditTitle(e.target.value); scheduleAutoSave(); }}
            className="w-full bg-transparent text-2xl font-semibold focus:outline-none placeholder:text-muted-foreground border-b border-transparent hover:border-border focus:border-primary transition-colors pb-1"
            placeholder="Issue title"
          />

          <BlockNoteEditor
            key={item.id}
            markdown={stripCommentsSection(stripFirstHeading(item.body ?? ""))}
            editable
            onChange={(md) => {
              bodyRef.current = md;
              if (!hasFirstBodyChangeRef.current) {
                hasFirstBodyChangeRef.current = true;
                return;
              }
              scheduleAutoSave();
            }}
          />

          {showNoteInput && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Resolution note (optional)</p>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Describe what was done..."
                size="md"
                className="w-full min-h-[80px]"
                autoFocus
              />
              <div className="flex gap-2">
                <Button variant="success" size="sm" onClick={handleConfirmComplete}>
                  Confirm complete
                </Button>
                <Button variant="secondary" size="sm" onClick={() => { setShowNoteInput(false); setNote(""); }}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          <div className="border-t border-border pt-6">
            <CommentList comments={comments} itemId={item.id} />
          </div>
        </div>

        {/* Right sidebar */}
        <aside className={cn(
          "shrink-0 overflow-y-auto transition-all duration-200",
          sidebarOpen ? "w-56 opacity-100" : "w-0 opacity-0 overflow-hidden pointer-events-none"
        )}>
          {/* Properties */}
          <SectionLabel>Properties</SectionLabel>
          <div className="space-y-0.5">
            <PropRow label="Status">
              <FieldSelect<ItemStatus>
                value={item.status}
                options={STATUSES}
                onChange={handleStatusChange}
                renderValue={(v) => {
                  if (!v) { return null; }
                  const cfg = STATUS_CONFIG[v];
                  const Icon = cfg.icon;
                  return (
                    <span className={cn("flex items-center gap-1.5 text-xs font-medium", cfg.color)}>
                      <Icon className="w-3 h-3 shrink-0" />
                      {cfg.label}
                    </span>
                  );
                }}
                renderOption={(v) => {
                  const cfg = STATUS_CONFIG[v];
                  const Icon = cfg.icon;
                  return (
                    <span className={cn("flex items-center gap-1.5 text-xs", cfg.color)}>
                      <Icon className="w-3 h-3 shrink-0" />
                      {cfg.label}
                    </span>
                  );
                }}
              />
            </PropRow>

            <PropRow label="Priority">
              <FieldSelect<Priority>
                value={(item.priority as Priority) ?? "Nenhuma"}
                options={PRIORITIES}
                onChange={handlePriorityChange}
                renderValue={(v) => {
                  const cfg = PRIORITY_CONFIG[v ?? "Nenhuma"];
                  const Icon = cfg.icon;
                  return (
                    <span className={cn("flex items-center gap-1.5 text-xs font-medium", cfg.color)}>
                      <Icon size={12} />
                      {v ?? "Nenhuma"}
                    </span>
                  );
                }}
                renderOption={(v) => {
                  const cfg = PRIORITY_CONFIG[v];
                  const Icon = cfg.icon;
                  return (
                    <span className={cn("flex items-center gap-1.5 text-xs", cfg.color)}>
                      <Icon size={12} />
                      {v}
                    </span>
                  );
                }}
              />
            </PropRow>

            <PropRow label="Type">
              <span className="text-xs text-muted-foreground pr-2">{item.type}</span>
            </PropRow>
          </div>

          {/* Labels */}
          <SectionLabel>Labels</SectionLabel>
          <div className="px-2 space-y-1.5">
            {labels.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {labels.map((l) => (
                  <Badge key={l} square className="text-xs">
                    {l}
                    <button onClick={() => handleRemoveLabel(l)} className="hover:text-foreground transition-colors">
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <input
              value={labelInput}
              onChange={(e) => setLabelInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  handleAddLabel(labelInput);
                  setLabelInput("");
                }
              }}
              placeholder="Add label…"
              className="w-full bg-transparent text-xs text-muted-foreground placeholder:text-muted-foreground/40 focus:outline-none border-b border-transparent focus:border-border transition-colors pb-0.5"
            />
          </div>

          {/* Dependencies */}
          <SectionLabel>Dependencies</SectionLabel>
          <div className="px-2 space-y-1.5">
            {deps.length > 0 && (
              <div className="space-y-1">
                {deps.map((d) => (
                  <div key={d} className="flex items-center gap-1.5 text-xs text-muted-foreground group/dep">
                    <Lock className="w-3 h-3 text-amber-400 shrink-0" />
                    <span className="font-mono flex-1">{d}</span>
                    <button
                      onClick={() => handleRemoveDep(d)}
                      className="opacity-0 group-hover/dep:opacity-100 hover:text-foreground transition-all"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <DepAutocomplete
              query={depInput}
              onQueryChange={setDepInput}
              allItems={allItems.filter((i) => i.id !== item.id && !deps.includes(i.external_id))}
              onSelect={(selected) => {
                addDep.mutate({ id: item.id, blockerId: selected.external_id }, {
                  onSuccess: () => { setDepInput(""); toast.success(`Dependency added: ${selected.external_id}`); },
                });
              }}
            />
          </div>

          {/* Relations */}
          <SectionLabel>Related</SectionLabel>
          <div className="px-2 space-y-1.5">
            {relations.length > 0 && (
              <div className="space-y-1">
                {relations.map((r) => (
                  <div key={r} className="flex items-center gap-1.5 text-xs text-muted-foreground group/rel">
                    <Link2 className="w-3 h-3 text-violet-400 shrink-0" />
                    <span className="font-mono flex-1">{r}</span>
                    <button
                      onClick={() => handleRemoveRelation(r)}
                      className="opacity-0 group-hover/rel:opacity-100 hover:text-foreground transition-all"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <DepAutocomplete
              query={relInput}
              onQueryChange={setRelInput}
              allItems={allItems.filter((i) => i.id !== item.id && !relations.includes(i.external_id) && !deps.includes(i.external_id))}
              onSelect={(selected) => {
                addRel.mutate({ id: item.id, relatedId: selected.external_id }, {
                  onSuccess: () => { setRelInput(""); toast.success(`Related: ${selected.external_id}`); },
                });
              }}
            />
          </div>

          {/* Dates */}
          <SectionLabel>Dates</SectionLabel>
          <div className="space-y-0.5">
            {item.created_date && (
              <PropRow label="Created">
                <span className="text-xs text-muted-foreground pr-2">{formatDate(item.created_date)}</span>
              </PropRow>
            )}
            {item.started_date && (
              <PropRow label="Started">
                <span className="text-xs text-muted-foreground pr-2">{formatDate(item.started_date)}</span>
              </PropRow>
            )}
            {item.completed_date && (
              <PropRow label="Completed">
                <span className="text-xs text-muted-foreground pr-2">{formatDate(item.completed_date)}</span>
              </PropRow>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
