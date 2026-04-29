import { useDraggable } from "@dnd-kit/core";
import type { Item, Priority } from "@/types";
import { cn, parseLabels, parseDependsOn, formatAge, PRIORITY_CONFIG } from "@/lib/utils";

interface ItemCardProps {
  item: Item;
  onClick: () => void;
  isDragging?: boolean;
}

export function ItemCard({ item, onClick, isDragging }: ItemCardProps) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: item.id });
  const labels = parseLabels(item.labels);
  const deps = parseDependsOn(item.depends_on);
  const priorityConfig = item.priority ? PRIORITY_CONFIG[item.priority as Priority] : null;

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={onClick}
      className={cn(
        "bg-card border border-border rounded-lg p-3 cursor-pointer hover:border-primary/50 transition-colors",
        isDragging && "opacity-50 shadow-lg ring-2 ring-primary"
      )}
    >
      <div className="text-xs text-muted-foreground font-mono mb-1">{item.external_id}</div>
      <div className="text-sm font-medium text-foreground leading-tight mb-2 line-clamp-2">
        {item.title}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {priorityConfig && (
          <span className={cn("text-xs px-1.5 py-0.5 rounded", priorityConfig.bgColor, priorityConfig.color)}>
            {item.priority}
          </span>
        )}
        {labels.slice(0, 2).map((label) => (
          <span key={label} className="text-xs text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
            {label}
          </span>
        ))}
        {labels.length > 2 && (
          <span className="text-xs text-muted-foreground">+{labels.length - 2}</span>
        )}
      </div>
      {deps.length > 0 && (
        <div className="text-xs text-amber-400 mt-1.5">🔒 blocked by {deps.length}</div>
      )}
      <div className="text-xs text-muted-foreground mt-1.5">
        {formatAge(item.started_date || item.created_date)}
      </div>
    </div>
  );
}
