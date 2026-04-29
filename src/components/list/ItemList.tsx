import { useState } from "react";
import { ChevronDown, GripHorizontal } from "lucide-react";
import type { Item, ItemStatus } from "@/types";
import { cn, STATUS_CONFIG, formatDateShort } from "@/lib/utils";

interface ItemListProps {
  items: Item[];
  onItemClick: (item: Item) => void;
}

const STATUS_ORDER: ItemStatus[] = [
  "in_progress",
  "todo",
  "backlog",
  "done",
  "canceled",
  "duplicate",
];

export function ItemList({ items, onItemClick }: ItemListProps) {
  const groups = STATUS_ORDER.flatMap((status) => {
    const group = items.filter((i) => i.status === status);
    if (group.length === 0) { return []; }
    return [{ status, items: group }];
  });

  return (
    <div>
      {groups.map(({ status, items: groupItems }) => (
        <StatusGroup
          key={status}
          status={status}
          items={groupItems}
          onItemClick={onItemClick}
        />
      ))}
    </div>
  );
}

function StatusGroup({
  status,
  items,
  onItemClick,
}: {
  status: ItemStatus;
  items: Item[];
  onItemClick: (item: Item) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;

  return (
    <div className="mb-1">
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="flex items-center gap-2 w-full px-3 py-2 rounded-md hover:bg-accent/40 transition-colors group text-left"
      >
        <ChevronDown
          className={cn(
            "w-3.5 h-3.5 text-muted-foreground/60 transition-transform duration-150",
            collapsed && "-rotate-90"
          )}
        />
        <Icon className={cn("w-3.5 h-3.5", cfg.color)} />
        <span className="text-sm font-medium text-foreground">{cfg.label}</span>
        <span className="text-xs text-muted-foreground ml-1">{items.length}</span>
      </button>

      {!collapsed && (
        <div>
          {items.map((item) => (
            <ItemRow key={item.id} item={item} onClick={() => onItemClick(item)} />
          ))}
        </div>
      )}
    </div>
  );
}

function ItemRow({ item, onClick }: { item: Item; onClick: () => void }) {
  const cfg = STATUS_CONFIG[item.status];
  const Icon = cfg.icon;

  return (
    <div
      onClick={onClick}
      className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-accent/40 cursor-pointer transition-colors group"
    >
      <GripHorizontal className="w-3.5 h-3.5 text-muted-foreground/20 opacity-0 group-hover:opacity-100 shrink-0 transition-opacity" />
      <span className="text-xs text-muted-foreground font-mono w-24 shrink-0">
        {item.external_id}
      </span>
      <Icon className={cn("w-3.5 h-3.5 shrink-0", cfg.color)} />
      <span className="text-sm text-foreground flex-1 truncate">{item.title}</span>
      <span className="text-xs text-muted-foreground shrink-0">
        {formatDateShort(item.created_date)}
      </span>
    </div>
  );
}
