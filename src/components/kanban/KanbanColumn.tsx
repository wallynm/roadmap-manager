import { useDroppable } from "@dnd-kit/core";
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
  onItemClick: (item: Item) => void;
}

export function KanbanColumn({ id, label, icon: Icon, color, items, onItemClick }: KanbanColumnProps) {
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
        <Icon className={cn("w-3.5 h-3.5", color)} />
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="text-xs text-muted-foreground ml-auto">{items.length}</span>
      </div>
      <div className="flex-1 flex flex-col space-y-2 overflow-y-auto px-1">
        {items.map((item) => (
          <ItemCard key={item.id} item={item} onClick={() => onItemClick(item)} />
        ))}
        {items.length === 0 && (
          <div className="rounded-lg border-2 border-dashed border-border/50 flex-1 min-h-[200px] h-full flex items-center justify-center text-xs text-muted-foreground/50">
            Drop here
          </div>
        )}
      </div>
    </div>
  );
}
