import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Item, ItemStatus } from "@/types";
import { ItemCard } from "./ItemCard";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { useCreateItem, useUpdateItem } from "@/hooks/useItems";
import { toast } from "sonner";
import { useState, useRef } from "react";

interface KanbanColumnProps {
  id: ItemStatus;
  label: string;
  icon: LucideIcon;
  color: string;
  items: Item[];
  activeId: string | null;
  onItemClick: (item: Item) => void;
  repoId?: string;
}

export function KanbanColumn({
  id, label, icon: Icon, color, items, activeId, onItemClick, repoId,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const createItem = useCreateItem();
  const updateItem = useUpdateItem();

  const itemIds = items.map((i) => i.id);

  function startCreating() {
    setIsCreating(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function cancelCreating() {
    setIsCreating(false);
    setNewTitle("");
  }

  function handleCreate() {
    const title = newTitle.trim();
    cancelCreating();
    if (!title || !repoId) { return; }

    createItem.mutate(
      { repoId, itemType: "improvement", title, body: `# ${title}\n\nTODO` },
      {
        onSuccess: (item) => {
          if (id !== "todo") {
            updateItem.mutate(
              { id: item.id, status: id },
              { onError: (err) => toast.error(`Status update failed: ${err}`) }
            );
          }
        },
        onError: (err) => toast.error(`Failed to create: ${err}`),
      }
    );
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") { e.preventDefault(); handleCreate(); }
    if (e.key === "Escape") { cancelCreating(); }
  }

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

          {isCreating ? (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg ring-1 ring-primary/30 bg-primary/5">
              <Plus className="w-3 h-3 text-primary/50 shrink-0" />
              <input
                ref={inputRef}
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={cancelCreating}
                placeholder="Issue title…"
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
              />
            </div>
          ) : repoId ? (
            <Button variant="add" size="sm" onClick={startCreating} className="mt-1">
              <Plus className="w-3 h-3" />
              Add item
            </Button>
          ) : null}
        </div>
      </SortableContext>
    </div>
  );
}
