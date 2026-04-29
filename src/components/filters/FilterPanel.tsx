import type { ItemStatus, Priority } from "@/types";
import { cn } from "@/lib/utils";

interface FilterPanelProps {
  activeStatus: string | null;
  activePriority: string | null;
  activeType: string | null;
  onStatusChange: (status: string | null) => void;
  onPriorityChange: (priority: string | null) => void;
  onTypeChange: (type: string | null) => void;
}

const STATUSES: { id: ItemStatus; label: string }[] = [
  { id: "backlog", label: "Backlog" },
  { id: "todo", label: "Todo" },
  { id: "in_progress", label: "In Progress" },
  { id: "done", label: "Done" },
  { id: "canceled", label: "Canceled" },
];

const PRIORITIES: Priority[] = ["Urgente", "Alta", "Média", "Baixa", "Nenhuma"];
const TYPES = ["improvement", "bug", "refactoring", "feature"];

export function FilterPanel({
  activeStatus,
  activePriority,
  activeType,
  onStatusChange,
  onPriorityChange,
  onTypeChange,
}: FilterPanelProps) {
  return (
    <div className="flex flex-wrap gap-4 p-3 bg-card border border-border rounded-lg">
      <div className="space-y-1">
        <span className="text-xs text-muted-foreground">Status</span>
        <div className="flex gap-1">
          <FilterChip active={!activeStatus} onClick={() => onStatusChange(null)} label="All" />
          {STATUSES.map((s) => (
            <FilterChip
              key={s.id}
              active={activeStatus === s.id}
              onClick={() => onStatusChange(activeStatus === s.id ? null : s.id)}
              label={s.label}
            />
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <span className="text-xs text-muted-foreground">Priority</span>
        <div className="flex gap-1">
          <FilterChip active={!activePriority} onClick={() => onPriorityChange(null)} label="All" />
          {PRIORITIES.map((p) => (
            <FilterChip
              key={p}
              active={activePriority === p}
              onClick={() => onPriorityChange(activePriority === p ? null : p)}
              label={p}
            />
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <span className="text-xs text-muted-foreground">Type</span>
        <div className="flex gap-1">
          <FilterChip active={!activeType} onClick={() => onTypeChange(null)} label="All" />
          {TYPES.map((t) => (
            <FilterChip
              key={t}
              active={activeType === t}
              onClick={() => onTypeChange(activeType === t ? null : t)}
              label={t}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-2 py-0.5 text-xs rounded transition-colors",
        active
          ? "bg-primary/20 text-primary border border-primary/30"
          : "text-muted-foreground hover:text-foreground border border-transparent hover:border-border"
      )}
    >
      {label}
    </button>
  );
}
