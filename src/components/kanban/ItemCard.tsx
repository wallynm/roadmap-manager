import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Lock } from "lucide-react";
import type { Item, Priority } from "@/types";
import { cn, parseLabels, parseDependsOn, formatAge, PRIORITY_CONFIG } from "@/lib/utils";

interface ItemCardProps {
  item: Item;
  onClick: () => void;
  isGhost?: boolean;   // rendered in-place as placeholder while dragging
  isOverlay?: boolean; // rendered in DragOverlay as the floating card
}

const PRIORITY_BORDER: Record<string, string> = {
  Urgente: "border-l-red-600",
  Alta:    "border-l-red-400",
  Média:   "border-l-amber-400",
  Baixa:   "border-l-sky-400",
  Nenhuma: "border-l-transparent",
};

export function ItemCard({ item, onClick, isGhost = false, isOverlay = false }: ItemCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const labels = parseLabels(item.labels);
  const deps = parseDependsOn(item.depends_on);
  const priorityConfig = item.priority ? PRIORITY_CONFIG[item.priority as Priority] : null;
  const borderClass = item.priority
    ? PRIORITY_BORDER[item.priority] ?? "border-l-transparent"
    : "border-l-transparent";

  // Ghost: shown in the column at the insertion point while card is being dragged
  if (isGhost) {
    return (
      <div
        ref={setNodeRef}
        style={{ ...style, minHeight: "76px" }}
        className={cn(
          "rounded-lg border border-dashed border-border bg-secondary/20",
          "border-l-[3px]",
          borderClass,
          "pointer-events-none opacity-60"
        )}
      />
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={onClick}
      className={cn(
        "bg-card border border-border rounded-lg p-3 cursor-pointer select-none",
        "hover:border-primary/50 transition-colors",
        "border-l-[3px]",
        borderClass,
        isOverlay && "shadow-2xl ring-1 ring-primary/40 cursor-grabbing rotate-1 scale-[1.02]"
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs text-muted-foreground font-mono">{item.external_id}</span>
        {priorityConfig && item.priority !== "Nenhuma" && (
          <priorityConfig.icon
            size={12}
            className={priorityConfig.color}
          />
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
