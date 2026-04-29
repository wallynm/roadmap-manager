import { X, Play, CheckCircle, XCircle, RotateCcw, Save } from "lucide-react";
import type { Item, Priority } from "@/types";
import { STATUS_CONFIG, PRIORITY_CONFIG, parseLabels, parseDependsOn, formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { useStartItem, useCompleteItem, useCancelItem, usePlanItem, useUpdateItem } from "@/hooks/useItems";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { BlockNoteEditor } from "@/components/editor/BlockNoteEditor";
import { Button } from "@/components/ui/Button";

interface ItemDetailsModalProps {
  item: Item | null;
  onClose: () => void;
}

export function ItemDetailsModal({ item, onClose }: ItemDetailsModalProps) {
  const startItem = useStartItem();
  const completeItem = useCompleteItem();
  const cancelItem = useCancelItem();
  const planItem = usePlanItem();
  const updateItem = useUpdateItem();

  const [note, setNote] = useState("");
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const bodyRef = useRef("");

  useEffect(() => {
    if (item) {
      setEditTitle(item.title);
      bodyRef.current = item.body ?? "";
      setNote("");
      setShowNoteInput(false);
    }
  }, [item?.id]);

  if (!item) {
    return null;
  }

  const statusCfg = STATUS_CONFIG[item.status];
  const priorityCfg = item.priority ? PRIORITY_CONFIG[item.priority as Priority] : null;
  const labels = parseLabels(item.labels);
  const deps = parseDependsOn(item.depends_on);

  const handleSave = () => {
    updateItem.mutate(
      { id: item.id, title: editTitle, body: bodyRef.current },
      { onSuccess: () => toast.success(`${item.external_id} saved`) }
    );
  };

  const handleComplete = () => {
    if (showNoteInput && note) {
      completeItem.mutate(
        { id: item.id, note },
        { onSuccess: () => { onClose(); toast.success(`${item.external_id} completed`); } }
      );
    } else {
      setShowNoteInput(true);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-xl w-full max-w-3xl max-h-[85vh] overflow-hidden shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{item.type}</span>
            <span>›</span>
            <span className="font-mono">{item.external_id}</span>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-6 space-y-5">
          <input
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            className="w-full bg-transparent border-0 border-b border-border px-0 py-1 text-xl font-semibold focus:outline-none focus:border-primary"
          />

          <div className="flex items-center gap-3 flex-wrap">
            {(() => {
              const Icon = statusCfg.icon;
              return (
                <span className={cn("flex items-center gap-1.5 text-sm px-2 py-1 rounded bg-secondary", statusCfg.color)}>
                  <Icon className="w-3.5 h-3.5" />
                  {statusCfg.label}
                </span>
              );
            })()}
            {priorityCfg && (
              <span className={cn("text-sm px-2 py-1 rounded", priorityCfg.bgColor, priorityCfg.color)}>
                {item.priority}
              </span>
            )}
            {labels.map((l) => (
              <span key={l} className="text-xs bg-secondary text-muted-foreground px-2 py-1 rounded">{l}</span>
            ))}
          </div>

          <div className="flex gap-4 text-xs text-muted-foreground">
            {item.created_date && <span>Created {formatDate(item.created_date)}</span>}
            {item.started_date && <span>Started {formatDate(item.started_date)}</span>}
            {item.completed_date && <span>Completed {formatDate(item.completed_date)}</span>}
          </div>

          <div className="border-t border-border pt-4">
            <BlockNoteEditor
              key={item.id}
              markdown={item.body ?? ""}
              editable
              onChange={(md) => { bodyRef.current = md; }}
            />
          </div>

          {deps.length > 0 && (
            <div className="border-t border-border pt-4">
              <h3 className="text-sm font-medium mb-2">Dependencies ({deps.length})</h3>
              <div className="space-y-1">
                {deps.map((d) => (
                  <div key={d} className="text-sm text-muted-foreground flex items-center gap-2">
                    <span className="text-amber-400">🔒</span>
                    <span className="font-mono">{d}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {showNoteInput && (
            <div className="border-t border-border pt-4">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Resolution note (optional)..."
                className="w-full bg-secondary border border-border rounded px-3 py-2 text-sm min-h-[80px] resize-y"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-6 py-4 border-t border-border shrink-0">
          <Button variant="primary" loading={updateItem.isPending} onClick={handleSave}>
            <Save className="w-3.5 h-3.5" />
            Save
          </Button>

          {(item.status === "backlog" || item.status === "todo") && (
            <Button
              variant="warning"
              onClick={() => startItem.mutate(item.id, { onSuccess: () => { onClose(); toast.success(`${item.external_id} started`); } })}
            >
              <Play className="w-3.5 h-3.5" /> Start
            </Button>
          )}

          {item.status !== "done" && item.status !== "canceled" && item.status !== "duplicate" && (
            <>
              <Button variant="success" onClick={handleComplete}>
                <CheckCircle className="w-3.5 h-3.5" /> Complete
              </Button>
              <Button
                variant="danger"
                onClick={() => cancelItem.mutate({ id: item.id }, { onSuccess: () => { onClose(); toast.success(`${item.external_id} canceled`); } })}
              >
                <XCircle className="w-3.5 h-3.5" /> Cancel
              </Button>
            </>
          )}

          {(item.status === "done" || item.status === "canceled") && (
            <Button
              variant="info"
              onClick={() => planItem.mutate(item.id, { onSuccess: () => { onClose(); toast.success(`${item.external_id} re-opened`); } })}
            >
              <RotateCcw className="w-3.5 h-3.5" /> Re-open
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
