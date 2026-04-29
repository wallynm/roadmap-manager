import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  MouseSensor,
  TouchSensor,
  closestCorners,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useState } from "react";
import type { Item, ItemStatus } from "@/types";
import { KanbanColumn } from "./KanbanColumn";
import { ItemCard } from "./ItemCard";
import { useUpdateItem } from "@/hooks/useItems";
import { toast } from "sonner";

const COLUMNS: { id: ItemStatus; label: string; emoji: string }[] = [
  { id: "backlog", label: "Backlog", emoji: "📋" },
  { id: "todo", label: "Todo", emoji: "⬜" },
  { id: "in_progress", label: "In Progress", emoji: "🔄" },
  { id: "done", label: "Done", emoji: "✅" },
];

interface KanbanBoardProps {
  items: Item[];
  onItemClick: (item: Item) => void;
}

export function KanbanBoard({ items, onItemClick }: KanbanBoardProps) {
  const [activeItem, setActiveItem] = useState<Item | null>(null);
  const updateItem = useUpdateItem();

  const mouseSensor = useSensor(MouseSensor, {
    activationConstraint: { distance: 8 },
  });
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: { delay: 200, tolerance: 5 },
  });
  const sensors = useSensors(mouseSensor, touchSensor);

  const handleDragStart = (event: DragStartEvent) => {
    const item = items.find((i) => i.id === event.active.id);
    if (item) setActiveItem(item);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveItem(null);
    const { active, over } = event;
    if (!over) return;

    const itemId = active.id as string;
    const newStatus = over.id as ItemStatus;
    const item = items.find((i) => i.id === itemId);

    if (!item || item.status === newStatus) return;

    updateItem.mutate(
      { id: itemId, status: newStatus },
      {
        onError: (err) => {
          toast.error(`Failed: ${err}`);
        },
        onSuccess: (updated) => {
          toast.success(`${updated.external_id} → ${newStatus}`);
        },
      }
    );
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 h-full overflow-x-auto pb-4">
        {COLUMNS.map((col) => (
          <KanbanColumn
            key={col.id}
            id={col.id}
            label={col.label}
            emoji={col.emoji}
            items={items.filter((i) => i.status === col.id)}
            onItemClick={onItemClick}
          />
        ))}
      </div>
      <DragOverlay>
        {activeItem && <ItemCard item={activeItem} onClick={() => {}} isDragging />}
      </DragOverlay>
    </DndContext>
  );
}
