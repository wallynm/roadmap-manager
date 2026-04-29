import { useParams, useNavigate, Link } from "react-router-dom";
import { useRepos } from "@/hooks/useRepos";
import { useCreateItem } from "@/hooks/useItems";
import { BlockNoteEditor } from "@/components/editor/BlockNoteEditor";
import { Button } from "@/components/ui/Button";
import { Section, PropRow } from "@/components/ui/SidebarSection";
import { useState, useRef } from "react";
import { toast } from "sonner";
import { ChevronRight, FilePlus } from "lucide-react";

const TYPES = ["improvement", "bug", "refactoring", "feature"] as const;
type ItemType = (typeof TYPES)[number];

const PRIORITIES = ["Urgente", "Alta", "Média", "Baixa", "Nenhuma"] as const;
type ItemPriority = (typeof PRIORITIES)[number];

export function NewItemView() {
  const { repoId } = useParams<{ repoId: string }>();
  const navigate = useNavigate();
  const { data: repos } = useRepos();
  const createItem = useCreateItem();
  const repo = repos?.find((r) => r.id === repoId);

  const [title, setTitle] = useState("");
  const [itemType, setItemType] = useState<ItemType>("improvement");
  const [priority, setPriority] = useState<ItemPriority>("Média");
  const [labelInput, setLabelInput] = useState("");
  const [labels, setLabels] = useState<string[]>([]);
  const bodyRef = useRef("");

  const addLabel = () => {
    const trimmed = labelInput.trim();
    if (trimmed && !labels.includes(trimmed)) {
      setLabels((prev) => [...prev, trimmed]);
      setLabelInput("");
    }
  };

  const removeLabel = (l: string) => setLabels((prev) => prev.filter((x) => x !== l));

  const handleCreate = () => {
    if (!title.trim() || !repoId) {
      return;
    }
    createItem.mutate(
      {
        repoId,
        itemType,
        title: title.trim(),
        body: bodyRef.current || `# ${title.trim()}\n\n`,
        priority,
        labels,
      },
      {
        onSuccess: (item) => {
          toast.success(`${item.external_id} created`);
          navigate(`/repos/${repoId}/items/${item.id}`);
        },
        onError: (err) => {
          toast.error(`Failed: ${err}`);
        },
      }
    );
  };

  return (
    <div className="h-full flex flex-col">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm mb-4 shrink-0">
        <Link
          to={`/repos/${repoId}`}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          {repo?.name ?? "Repo"}
        </Link>
        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-foreground">New item</span>
      </nav>

      {/* Main layout */}
      <div className="flex gap-8 flex-1 min-h-0">
        {/* Left — content */}
        <div className="flex-1 min-w-0 overflow-y-auto space-y-6 pr-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Issue title"
            autoFocus
            className="w-full bg-transparent text-2xl font-semibold focus:outline-none placeholder:text-muted-foreground border-b border-transparent hover:border-border focus:border-primary transition-colors pb-1"
          />

          <BlockNoteEditor
            markdown=""
            editable
            onChange={(md) => { bodyRef.current = md; }}
          />
        </div>

        {/* Right sidebar */}
        <aside className="w-64 shrink-0 overflow-y-auto">
          <Button
            variant="solid"
            className="w-full mb-4"
            disabled={!title.trim()}
            loading={createItem.isPending}
            onClick={handleCreate}
          >
            <FilePlus className="w-3.5 h-3.5" />
            Create issue
          </Button>

          <Section label="Properties">
            <PropRow label="Type">
              <select
                value={itemType}
                onChange={(e) => setItemType(e.target.value as ItemType)}
                className="bg-secondary border border-border rounded px-2 py-0.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </PropRow>
            <PropRow label="Priority">
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as ItemPriority)}
                className="bg-secondary border border-border rounded px-2 py-0.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </PropRow>
          </Section>

          <Section label="Labels">
            <div className="space-y-2 pt-1">
              {labels.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {labels.map((l) => (
                    <button
                      key={l}
                      onClick={() => removeLabel(l)}
                      className="text-xs bg-secondary text-muted-foreground px-2 py-0.5 rounded hover:bg-destructive/20 hover:text-destructive transition-colors"
                    >
                      {l} ×
                    </button>
                  ))}
                </div>
              )}
              <div className="flex gap-1.5">
                <input
                  value={labelInput}
                  onChange={(e) => setLabelInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addLabel();
                    }
                  }}
                  placeholder="Add label…"
                  className="flex-1 bg-secondary border border-border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <Button variant="ghost" size="sm" onClick={addLabel}>
                  +
                </Button>
              </div>
            </div>
          </Section>
        </aside>
      </div>
    </div>
  );
}
