import { X, Play, CheckCircle, XCircle, RotateCcw, Copy } from "lucide-react";
import type { Item, Priority } from "@/types";
import { STATUS_CONFIG, PRIORITY_CONFIG, parseLabels, parseDependsOn, formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { useStartItem, useCompleteItem, useCancelItem, usePlanItem } from "@/hooks/useItems";
import { useState } from "react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

interface ItemDetailsModalProps {
  item: Item | null;
  onClose: () => void;
}

export function ItemDetailsModal({ item, onClose }: ItemDetailsModalProps) {
  const startItem = useStartItem();
  const completeItem = useCompleteItem();
  const cancelItem = useCancelItem();
  const planItem = usePlanItem();
  const [note, setNote] = useState("");
  const [showNoteInput, setShowNoteInput] = useState(false);

  if (!item) return null;

  const statusCfg = STATUS_CONFIG[item.status];
  const priorityCfg = item.priority ? PRIORITY_CONFIG[item.priority as Priority] : null;
  const labels = parseLabels(item.labels);
  const deps = parseDependsOn(item.depends_on);

  const handleComplete = () => {
    if (showNoteInput && note) {
      completeItem.mutate({ id: item.id, note }, { onSuccess: () => { onClose(); toast.success(`${item.external_id} completed`); } });
    } else {
      setShowNoteInput(true);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl w-full max-w-3xl max-h-[85vh] overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{item.type}</span>
            <span>›</span>
            <span className="font-mono">{item.external_id}</span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-accent rounded"><X className="w-4 h-4" /></button>
        </div>

        <div className="overflow-y-auto max-h-[calc(85vh-8rem)] p-6 space-y-6">
          <h2 className="text-xl font-semibold">{item.title}</h2>

          <div className="flex items-center gap-3 flex-wrap">
            <span className={cn("text-sm px-2 py-1 rounded bg-secondary", statusCfg.color)}>
              {statusCfg.emoji} {statusCfg.label}
            </span>
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
            <div className="prose prose-invert prose-sm max-w-none">
              <ReactMarkdown>{item.body}</ReactMarkdown>
            </div>
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

        <div className="flex items-center gap-2 px-6 py-4 border-t border-border">
          {item.status === "backlog" || item.status === "todo" ? (
            <button
              onClick={() => startItem.mutate(item.id, { onSuccess: () => { onClose(); toast.success(`${item.external_id} started`); } })}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-amber-500/20 text-amber-400 rounded hover:bg-amber-500/30"
            >
              <Play className="w-3.5 h-3.5" /> Start
            </button>
          ) : null}
          {item.status !== "done" && item.status !== "canceled" && item.status !== "duplicate" && (
            <>
              <button
                onClick={handleComplete}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-emerald-500/20 text-emerald-400 rounded hover:bg-emerald-500/30"
              >
                <CheckCircle className="w-3.5 h-3.5" /> Complete
              </button>
              <button
                onClick={() => cancelItem.mutate({ id: item.id }, { onSuccess: () => { onClose(); toast.success(`${item.external_id} canceled`); } })}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-red-500/20 text-red-400 rounded hover:bg-red-500/30"
              >
                <XCircle className="w-3.5 h-3.5" /> Cancel
              </button>
            </>
          )}
          {(item.status === "done" || item.status === "canceled") && (
            <button
              onClick={() => planItem.mutate(item.id, { onSuccess: () => { onClose(); toast.success(`${item.external_id} re-opened`); } })}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-sky-500/20 text-sky-400 rounded hover:bg-sky-500/30"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Re-open
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
