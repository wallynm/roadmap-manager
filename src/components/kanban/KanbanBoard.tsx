import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { useState, useEffect, useRef } from "react";
import type { Item, ItemStatus } from "@/types";
import { KanbanColumn } from "./KanbanColumn";
import { ItemCard } from "./ItemCard";
import { useUpdateItem } from "@/hooks/useItems";
import { toast } from "sonner";
import { STATUS_CONFIG } from "@/lib/utils";

const COLUMNS: { id: ItemStatus; label: string }[] = [
  { id: "backlog",     label: "Backlog" },
  { id: "todo",        label: "Todo" },
  { id: "in_progress", label: "In Progress" },
  { id: "done",        label: "Done" },
];

type Cols = Record<ItemStatus, Item[]>;

function buildCols(items: Item[]): Cols {
  const cols = Object.fromEntries(COLUMNS.map((c) => [c.id, [] as Item[]])) as Cols;
  for (const item of items) {
    if (cols[item.status as ItemStatus]) {
      cols[item.status as ItemStatus].push(item);
    }
  }
  return cols;
}

function findColOf(cols: Cols, id: UniqueIdentifier): ItemStatus | null {
  for (const [colId, items] of Object.entries(cols)) {
    if (items.some((i) => i.id === id)) { return colId as ItemStatus; }
  }
  return null;
}

interface KanbanBoardProps {
  items: Item[];
  onItemClick: (item: Item) => void;
}

export function KanbanBoard({ items, onItemClick }: KanbanBoardProps) {
  const [cols, setCols] = useState<Cols>(() => buildCols(items));
  const [activeId, setActiveId] = useState<string | null>(null);
  const pendingMove = useRef(false);
  const updateItem = useUpdateItem();

  // Sync external item updates when not dragging and no mutation in flight.
  // pendingMove prevents the stale-items flash right after drop, before the
  // mutation resolves and React Query updates the items prop.
  useEffect(() => {
    if (!activeId && !pendingMove.current) { setCols(buildCols(items)); }
  }, [items, activeId]);

  const mouseSensor = useSensor(MouseSensor, { activationConstraint: { distance: 8 } });
  const touchSensor = useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } });
  const sensors = useSensors(mouseSensor, touchSensor);

  const activeItem = activeId
    ? Object.values(cols).flat().find((i) => i.id === activeId) ?? null
    : null;

  const handleDragStart = ({ active }: DragStartEvent) => {
    setActiveId(active.id as string);
  };

  const handleDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) { return; }

    const activeCol = findColOf(cols, active.id);
    if (!activeCol) { return; }

    // Over a column header droppable (id = column status string)
    const isColTarget = COLUMNS.some((c) => c.id === over.id);
    const overCol = isColTarget
      ? (over.id as ItemStatus)
      : findColOf(cols, over.id);

    if (!overCol || activeCol === overCol) {
      // Reorder within same column
      if (!isColTarget && activeCol) {
        setCols((prev) => {
          const col = prev[activeCol];
          const oldIdx = col.findIndex((i) => i.id === active.id);
          const newIdx = col.findIndex((i) => i.id === over.id);
          if (oldIdx === -1 || newIdx === -1 || oldIdx === newIdx) { return prev; }
          return { ...prev, [activeCol]: arrayMove(col, oldIdx, newIdx) };
        });
      }
      return;
    }

    // Cross-column move
    setCols((prev) => {
      const srcItems = [...prev[activeCol]];
      const dstItems = [...prev[overCol]];
      const srcIdx = srcItems.findIndex((i) => i.id === active.id);
      if (srcIdx === -1) { return prev; }

      const [moved] = srcItems.splice(srcIdx, 1);
      const overIdx = dstItems.findIndex((i) => i.id === over.id);
      const insertAt = overIdx === -1 ? dstItems.length : overIdx;
      dstItems.splice(insertAt, 0, moved);

      return { ...prev, [activeCol]: srcItems, [overCol]: dstItems };
    });
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    const prevActiveId = activeId;
    setActiveId(null);

    if (!over || !prevActiveId) { return; }

    const newCol = findColOf(cols, active.id);
    const originalItem = items.find((i) => i.id === prevActiveId);
    if (!newCol || !originalItem || originalItem.status === newCol) { return; }

    pendingMove.current = true;
    updateItem.mutate(
      { id: prevActiveId, status: newCol },
      {
        onError: (err) => {
          pendingMove.current = false;
          toast.error(`Failed: ${err}`);
          setCols(buildCols(items));
        },
        onSuccess: (updated) => {
          pendingMove.current = false;
          toast.success(`${updated.external_id} → ${newCol}`);
        },
      }
    );
  };

  const handleDragCancel = () => {
    setActiveId(null);
    setCols(buildCols(items));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="flex gap-4 h-full overflow-x-auto pb-4">
        {COLUMNS.map((col) => (
          <KanbanColumn
            key={col.id}
            id={col.id}
            label={col.label}
            icon={STATUS_CONFIG[col.id].icon}
            color={STATUS_CONFIG[col.id].color}
            items={cols[col.id]}
            activeId={activeId}
            onItemClick={onItemClick}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={{ duration: 150, easing: "ease" }}>
        {activeItem && <ItemCard item={activeItem} onClick={() => {}} isOverlay />}
      </DragOverlay>
    </DndContext>
  );
}
