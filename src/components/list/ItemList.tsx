import type { Item, Priority } from "@/types";
import { cn, STATUS_CONFIG, PRIORITY_CONFIG, parseLabels, formatDate } from "@/lib/utils";

interface ItemListProps {
  items: Item[];
  onItemClick: (item: Item) => void;
}

export function ItemList({ items, onItemClick }: ItemListProps) {
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="px-3 py-2 text-xs font-medium text-muted-foreground w-24">ID</th>
            <th className="px-3 py-2 text-xs font-medium text-muted-foreground w-32">Status</th>
            <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Title</th>
            <th className="px-3 py-2 text-xs font-medium text-muted-foreground w-24">Priority</th>
            <th className="px-3 py-2 text-xs font-medium text-muted-foreground w-40">Labels</th>
            <th className="px-3 py-2 text-xs font-medium text-muted-foreground w-28">Created</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const statusCfg = STATUS_CONFIG[item.status];
            const labels = parseLabels(item.labels);
            const priorityCfg = item.priority ? PRIORITY_CONFIG[item.priority as Priority] : null;

            return (
              <tr
                key={item.id}
                onClick={() => onItemClick(item)}
                className="border-b border-border/50 hover:bg-accent/50 cursor-pointer transition-colors"
              >
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                  {item.external_id}
                </td>
                <td className="px-3 py-2">
                  <span className={cn("text-xs", statusCfg.color)}>
                    {statusCfg.emoji} {statusCfg.label}
                  </span>
                </td>
                <td className="px-3 py-2 text-foreground truncate max-w-[300px]">
                  {item.title}
                </td>
                <td className="px-3 py-2">
                  {priorityCfg && (
                    <span className={cn("text-xs", priorityCfg.color)}>{item.priority}</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex gap-1 flex-wrap">
                    {labels.slice(0, 2).map((l) => (
                      <span key={l} className="text-xs bg-secondary px-1.5 py-0.5 rounded text-muted-foreground">
                        {l}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {formatDate(item.created_date)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
