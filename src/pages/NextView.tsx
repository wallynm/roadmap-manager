import { useParams, useNavigate } from "react-router-dom";
import { Zap, Lock } from "lucide-react";
import { useNextItems } from "@/hooks/useNextItems";
import {
  PriorityNone, PriorityUrgent, PriorityHigh, PriorityMedium, PriorityLow,
} from "@/components/ui/PriorityIcon";
import { cn } from "@/lib/utils";
import type { Priority } from "@/types";
import type { ScoredItem } from "@/hooks/useNextItems";

function PriorityIcon({ priority, size = 14 }: { priority: Priority | null; size?: number }) {
  const p = priority ?? "Nenhuma";
  if (p === "Urgente") { return <PriorityUrgent size={size} className="text-red-400" />; }
  if (p === "Alta") { return <PriorityHigh size={size} className="text-orange-400" />; }
  if (p === "Média") { return <PriorityMedium size={size} className="text-yellow-400" />; }
  if (p === "Baixa") { return <PriorityLow size={size} className="text-blue-400" />; }
  return <PriorityNone size={size} className="text-muted-foreground/40" />;
}

function ItemRow({ s, rank, onClick }: { s: ScoredItem; rank: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 px-4 py-3 text-sm w-full text-left transition-colors hover:bg-accent/40"
    >
      <span className="text-xs text-muted-foreground/50 w-5 text-right shrink-0 tabular-nums">
        {rank}
      </span>
      <span className="shrink-0">
        <PriorityIcon priority={s.item.priority as Priority} size={13} />
      </span>
      <span className="font-mono text-[11px] text-muted-foreground shrink-0 w-16">
        {s.item.external_id}
      </span>
      <span className="flex-1 truncate text-xs">{s.item.title}</span>
      <div className="flex items-center gap-1 shrink-0">
        {s.labelMultiplier > 1 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 tabular-nums">
            ×{Number.isInteger(s.labelMultiplier) ? s.labelMultiplier : s.labelMultiplier.toFixed(1)}
          </span>
        )}
        {s.unblocks > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary tabular-nums">
            ↑{s.unblocks}
          </span>
        )}
      </div>
    </button>
  );
}

function BlockedRow({ s, rank, onClick }: { s: ScoredItem; rank: number; onClick: () => void }) {
  const preview = s.blockedBy.slice(0, 2).join(", ");
  const overflow = s.blockedBy.length > 2 ? ` +${s.blockedBy.length - 2}` : "";
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 px-4 py-3 text-sm w-full text-left transition-colors hover:bg-accent/40 opacity-50"
    >
      <span className="text-xs text-muted-foreground/50 w-5 text-right shrink-0">
        <Lock className="w-3 h-3" />
      </span>
      <span className="shrink-0">
        <PriorityIcon priority={s.item.priority as Priority} size={13} />
      </span>
      <span className="font-mono text-[11px] text-muted-foreground shrink-0 w-16">
        {s.item.external_id}
      </span>
      <span className="flex-1 truncate text-xs">{s.item.title}</span>
      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground shrink-0">
        blocked by {preview}{overflow}
      </span>
    </button>
  );
}

export function NextView() {
  const { repoId } = useParams<{ repoId: string }>();
  const navigate = useNavigate();
  const scored = useNextItems(repoId!);

  const ready = scored.filter((s) => s.ready);
  const blocked = scored.filter((s) => !s.ready);

  if (scored.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        No todo or backlog items found.
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center gap-2">
        <Zap className="w-4 h-4 text-muted-foreground" />
        <h1 className="text-sm font-semibold">Next Up</h1>
        <span className="text-xs text-muted-foreground/50">
          {ready.length} ready · {blocked.length} blocked
        </span>
      </div>

      <p className="text-xs text-muted-foreground">
        Scored by priority × label multipliers (in configured order) × impact. Configure label weights in Settings.
      </p>

      {ready.length > 0 && (
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-secondary/40 border-b border-border flex items-center gap-2">
            <span className="text-xs font-medium">Ready to start</span>
            <span className="text-[10px] text-muted-foreground/50">{ready.length}</span>
          </div>
          {ready.map((s, i) => (
            <div key={s.item.id} className={cn(i > 0 && "border-t border-border")}>
              <ItemRow
                s={s}
                rank={i + 1}
                onClick={() => navigate(`/repos/${repoId}/items/${s.item.id}`)}
              />
            </div>
          ))}
        </div>
      )}

      {blocked.length > 0 && (
        <div className="border border-border/50 rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-secondary/20 border-b border-border/50 flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Blocked</span>
            <span className="text-[10px] text-muted-foreground/50">{blocked.length}</span>
          </div>
          {blocked.map((s, i) => (
            <div key={s.item.id} className={cn(i > 0 && "border-t border-border/50")}>
              <BlockedRow
                s={s}
                rank={ready.length + i + 1}
                onClick={() => navigate(`/repos/${repoId}/items/${s.item.id}`)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
