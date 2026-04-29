import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { LucideIcon } from "lucide-react";
import type { Item, ItemStatus } from "@/types";
import { ItemCard } from "./ItemCard";
import { cn } from "@/lib/utils";

interface KanbanColumnProps {
  id: ItemStatus;
  label: string;
  icon: LucideIcon;
  color: string;
  items: Item[];
  activeId: string | null;
  onItemClick: (item: Item) => void;
}

export function KanbanColumn({
  id, label, icon: Icon, color, items, activeId, onItemClick,
}: KanbanColumnProps) {
  // Column is the fallback droppable when dragging over empty space
  const { setNodeRef, isOver } = useDroppable({ id });

  const itemIds = items.map((i) => i.id);

  return (
    <div className="flex flex-col w-72 min-w-[18rem]">
      <div className="flex items-center gap-2 px-3 py-2 mb-2">
        <Icon className={cn("w-3.5 h-3.5", color)} />
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="text-xs text-muted-foreground ml-auto">
          {items.filter((i) => i.id !== activeId).length}
        </span>
      </div>

      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={cn(
            "flex-1 flex flex-col space-y-2 overflow-y-auto px-1 rounded-lg min-h-[200px] transition-colors",
            isOver && items.length === 0 && "ring-2 ring-primary/40 bg-primary/5"
          )}
        >
          {items.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              onClick={() => onItemClick(item)}
              isGhost={item.id === activeId}
              dragActive={!!activeId}
            />
          ))}

          {items.length === 0 && (
            <div className={cn(
              "flex-1 min-h-[120px] rounded-lg border-2 border-dashed flex items-center justify-center text-xs transition-colors",
              isOver
                ? "border-primary/50 text-primary/60"
                : "border-border/40 text-muted-foreground/40"
            )}>
              Drop here
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}
