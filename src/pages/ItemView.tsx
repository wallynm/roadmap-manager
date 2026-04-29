import { useParams, useNavigate, Link } from "react-router-dom";
import { useItem, useUpdateItem, useStartItem, useCompleteItem, useCancelItem, usePlanItem, useItemComments } from "@/hooks/useItems";
import { useRepos } from "@/hooks/useRepos";
import { BlockNoteEditor } from "@/components/editor/BlockNoteEditor";
import { CommentList } from "@/components/comments/CommentList";
import { Button } from "@/components/ui/Button";
import { Section, PropRow } from "@/components/ui/SidebarSection";
import { STATUS_CONFIG, PRIORITY_CONFIG, parseLabels, parseDependsOn, formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { Priority } from "@/types";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { ChevronRight, Play, CheckCircle, XCircle, RotateCcw, Save, Lock } from "lucide-react";

function extractFirstHeading(markdown: string): string | null {
  const match = /^#\s+(.+)/m.exec(markdown);
  return match ? match[1].trim() : null;
}

function stripFirstHeading(markdown: string): string {
  return markdown.replace(/^#[^\n]*\n?/, "").trimStart();
}

export function ItemView() {
  const { repoId, itemId } = useParams<{ repoId: string; itemId: string }>();
  const navigate = useNavigate();
  const { data: item, isLoading } = useItem(itemId ?? null);
  const { data: comments = [] } = useItemComments(itemId ?? null);
  const { data: repos } = useRepos();
  const repo = repos?.find((r) => r.id === repoId);

  const updateItem = useUpdateItem();
  const startItem = useStartItem();
  const completeItem = useCompleteItem();
  const cancelItem = useCancelItem();
  const planItem = usePlanItem();

  const [editTitle, setEditTitle] = useState("");
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [note, setNote] = useState("");
  // Stores only the body content — heading is excluded and re-prepended at save time
  const bodyRef = useRef("");

  useEffect(() => {
    if (item) {
      const titleFromBody = extractFirstHeading(item.body ?? "");
      setEditTitle(titleFromBody ?? item.title);
      bodyRef.current = stripFirstHeading(item.body ?? "");
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

  const statusCfg = STATUS_CONFIG[item.status];
  const priorityCfg = item.priority ? PRIORITY_CONFIG[item.priority as Priority] : null;
  const labels = parseLabels(item.labels);
  const deps = parseDependsOn(item.depends_on);

  const handleSave = () => {
    const fullBody = `# ${editTitle}\n\n${bodyRef.current}`;
    updateItem.mutate(
      { id: item.id, title: editTitle, body: fullBody },
      { onSuccess: () => toast.success(`${item.external_id} saved`) }
    );
  };

  const handleComplete = () => {
    if (showNoteInput && note) {
      completeItem.mutate(
        { id: item.id, note },
        {
          onSuccess: () => {
            toast.success(`${item.external_id} completed`);
            navigate(`/repos/${repoId}`);
          },
        }
      );
    } else {
      setShowNoteInput(true);
    }
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
        <Link
          to={`/repos/${repoId}`}
          className="text-muted-foreground hover:text-foreground transition-colors font-mono text-xs"
        >
          {item.external_id}
        </Link>
        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-foreground truncate max-w-sm">{item.title}</span>
      </nav>

      {/* Main layout */}
      <div className="flex gap-8 flex-1 min-h-0">
        {/* Left — content */}
        <div className="flex-1 min-w-0 overflow-y-auto space-y-6 px-0.5 pr-2">
          <input
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            className="w-full bg-transparent text-2xl font-semibold focus:outline-none placeholder:text-muted-foreground border-b border-transparent hover:border-border focus:border-primary transition-colors pb-1"
            placeholder="Issue title"
          />

          <BlockNoteEditor
            key={item.id}
            markdown={stripFirstHeading(item.body ?? "")}
            editable
            onChange={(md) => { bodyRef.current = md; }}
          />

          {/* Resolution note */}
          {showNoteInput && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Resolution note (optional)</p>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Describe what was done..."
                className="w-full bg-secondary border border-border rounded px-3 py-2 text-sm min-h-[80px] resize-y focus:outline-none focus:ring-1 focus:ring-ring"
                autoFocus
              />
              <div className="flex gap-2">
                <Button variant="success" size="sm" onClick={handleComplete}>
                  Confirm complete
                </Button>
                <Button variant="secondary" size="sm" onClick={() => { setShowNoteInput(false); setNote(""); }}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Comments */}
          <div className="border-t border-border pt-6">
            <CommentList comments={comments} itemId={item.id} />
          </div>
        </div>

        {/* Right sidebar — properties */}
        <aside className="w-64 shrink-0 space-y-1 overflow-y-auto">
          {/* Save */}
          <Button
            variant="primary"
            className="w-full mb-4"
            loading={updateItem.isPending}
            onClick={handleSave}
          >
            <Save className="w-3.5 h-3.5" />
            Save changes
          </Button>

          <Section label="Properties">
            <PropRow label="Status">
              {(() => {
                const Icon = statusCfg.icon;
                return (
                  <span className={cn("flex items-center gap-1.5 text-xs font-medium", statusCfg.color)}>
                    <Icon className="w-3 h-3" />
                    {statusCfg.label}
                  </span>
                );
              })()}
            </PropRow>
            <PropRow label="Priority">
              {priorityCfg ? (
                <span className={cn("text-xs font-medium", priorityCfg.color)}>
                  {item.priority}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">None</span>
              )}
            </PropRow>
            <PropRow label="Type">
              <span className="text-xs text-muted-foreground capitalize">{item.type}</span>
            </PropRow>
          </Section>

          {labels.length > 0 && (
            <Section label="Labels">
              <div className="flex flex-wrap gap-1 pt-1">
                {labels.map((l) => (
                  <span key={l} className="text-xs bg-secondary text-muted-foreground px-2 py-0.5 rounded">
                    {l}
                  </span>
                ))}
              </div>
            </Section>
          )}

          <Section label="Dates">
            {item.created_date && (
              <PropRow label="Created">
                <span className="text-xs text-muted-foreground">{formatDate(item.created_date)}</span>
              </PropRow>
            )}
            {item.started_date && (
              <PropRow label="Started">
                <span className="text-xs text-muted-foreground">{formatDate(item.started_date)}</span>
              </PropRow>
            )}
            {item.completed_date && (
              <PropRow label="Completed">
                <span className="text-xs text-muted-foreground">{formatDate(item.completed_date)}</span>
              </PropRow>
            )}
          </Section>

          {deps.length > 0 && (
            <Section label="Dependencies">
              <div className="space-y-1 pt-1">
                {deps.map((d) => (
                  <div key={d} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Lock className="w-3 h-3 text-amber-400" />
                    <span className="font-mono">{d}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          <Section label="Actions">
            <div className="space-y-1.5 pt-1">
              {(item.status === "backlog" || item.status === "todo") && (
                <Button
                  variant="warning"
                  size="sm"
                  className="w-full"
                  onClick={() => startItem.mutate(item.id, {
                    onSuccess: () => { navigate(`/repos/${repoId}`); toast.success(`${item.external_id} started`); }
                  })}
                >
                  <Play className="w-3.5 h-3.5" /> Start
                </Button>
              )}
              {item.status !== "done" && item.status !== "canceled" && item.status !== "duplicate" && (
                <>
                  <Button variant="success" size="sm" className="w-full" onClick={handleComplete}>
                    <CheckCircle className="w-3.5 h-3.5" /> Complete
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    className="w-full"
                    onClick={() => cancelItem.mutate({ id: item.id }, {
                      onSuccess: () => { navigate(`/repos/${repoId}`); toast.success(`${item.external_id} canceled`); }
                    })}
                  >
                    <XCircle className="w-3.5 h-3.5" /> Cancel
                  </Button>
                </>
              )}
              {(item.status === "done" || item.status === "canceled") && (
                <Button
                  variant="info"
                  size="sm"
                  className="w-full"
                  onClick={() => planItem.mutate(item.id, {
                    onSuccess: () => { navigate(`/repos/${repoId}`); toast.success(`${item.external_id} re-opened`); }
                  })}
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Re-open
                </Button>
              )}
            </div>
          </Section>
        </aside>
      </div>
    </div>
  );

}

