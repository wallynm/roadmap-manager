import { useDroppable } from "@dnd-kit/core";
import type { Item, ItemStatus } from "@/types";
import { ItemCard } from "./ItemCard";
import { cn } from "@/lib/utils";

interface KanbanColumnProps {
  id: ItemStatus;
  label: string;
  emoji: string;
  items: Item[];
  onItemClick: (item: Item) => void;
}

export function KanbanColumn({ id, label, emoji, items, onItemClick }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col w-72 min-w-[18rem] rounded-lg",
        isOver && "ring-2 ring-primary/50"
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2 mb-2">
        <span>{emoji}</span>
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="text-xs text-muted-foreground ml-auto">{items.length}</span>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto px-1">
        {items.map((item) => (
          <ItemCard key={item.id} item={item} onClick={() => onItemClick(item)} />
        ))}
        {items.length === 0 && (
          <div className="text-center py-8 text-xs text-muted-foreground">
            Drop here
          </div>
        )}
      </div>
    </div>
  );
}
