import { useDraggable } from "@dnd-kit/core";
import { Lock } from "lucide-react";
import type { Item, Priority } from "@/types";
import { cn, parseLabels, parseDependsOn, formatAge, PRIORITY_CONFIG } from "@/lib/utils";

interface ItemCardProps {
  item: Item;
  onClick: () => void;
  isDragging?: boolean;
}

const PRIORITY_BORDER: Record<string, string> = {
  Urgente: "border-l-red-600",
  Alta: "border-l-red-400",
  Média: "border-l-amber-400",
  Baixa: "border-l-sky-400",
  Nenhuma: "border-l-transparent",
};

export function ItemCard({ item, onClick, isDragging }: ItemCardProps) {
  const { attributes, listeners, setNodeRef, isDragging: isBeingDragged } = useDraggable({ id: item.id });
  const labels = parseLabels(item.labels);
  const deps = parseDependsOn(item.depends_on);
  const priorityConfig = item.priority ? PRIORITY_CONFIG[item.priority as Priority] : null;
  const borderClass = item.priority ? PRIORITY_BORDER[item.priority] ?? "border-l-transparent" : "border-l-transparent";

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onClick}
      className={cn(
        "bg-card border border-border rounded-lg p-3 cursor-pointer hover:border-primary/50 transition-colors",
        "border-l-[3px]",
        borderClass,
        isBeingDragged && "opacity-0 pointer-events-none",
        isDragging && "shadow-xl ring-1 ring-primary/40 cursor-grabbing"
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs text-muted-foreground font-mono">{item.external_id}</span>
        {priorityConfig && (
          <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded", priorityConfig.bgColor, priorityConfig.color)}>
            {item.priority}
          </span>
        )}
      </div>
      <div className="text-sm font-medium text-foreground leading-tight mb-2 line-clamp-2">
        {item.title}
      </div>
      {labels.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
          {labels.slice(0, 3).map((label) => (
            <span key={label} className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
              {label}
            </span>
          ))}
          {labels.length > 3 && (
            <span className="text-[10px] text-muted-foreground">+{labels.length - 3}</span>
          )}
        </div>
      )}
      {deps.length > 0 && (
        <div className="flex items-center gap-1 text-xs text-amber-400 mb-1">
          <Lock className="w-3 h-3" />
          <span>blocked by {deps.length}</span>
        </div>
      )}
      <div className="text-[10px] text-muted-foreground/60">
        {formatAge(item.started_date || item.created_date)}
      </div>
    </div>
  );
}
