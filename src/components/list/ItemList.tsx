import { useState } from "react";
import { ChevronRight, GripVertical, Lock, Link2 } from "lucide-react";
import type { Item, ItemStatus, Priority } from "@/types";
import { cn, STATUS_CONFIG, PRIORITY_CONFIG, formatDateShort, parseRelatesTo } from "@/lib/utils";

export type SortField = "default" | "priority" | "created_date" | "impact";
export type SortDir = "asc" | "desc";

interface ItemListProps {
  items: Item[];
  onItemClick: (item: Item) => void;
  sortField?: SortField;
  sortDir?: SortDir;
  filterPriorities?: Priority[];
  impactMap?: Record<string, number>;
}

const STATUS_ORDER: ItemStatus[] = [
  "in_progress",
  "todo",
  "backlog",
  "done",
  "canceled",
  "duplicate",
];

const PRIORITY_ORDER: Record<string, number> = {
  Urgente: 0,
  Alta: 1,
  Média: 2,
  Baixa: 3,
  Nenhuma: 4,
};

function sortItems(items: Item[], field: SortField, dir: SortDir, impactMap?: Record<string, number>): Item[] {
  if (field === "default") { return items; }
  return [...items].sort((a, b) => {
    let cmp = 0;
    if (field === "priority") {
      const pa = PRIORITY_ORDER[a.priority ?? "Nenhuma"] ?? 4;
      const pb = PRIORITY_ORDER[b.priority ?? "Nenhuma"] ?? 4;
      cmp = pa - pb;
    } else if (field === "created_date") {
      cmp = (a.created_date ?? "").localeCompare(b.created_date ?? "");
    } else if (field === "impact") {
      const ia = impactMap?.[a.id] ?? 0;
      const ib = impactMap?.[b.id] ?? 0;
      cmp = ia - ib;
    }
    return dir === "asc" ? cmp : -cmp;
  });
}

// Build undirected connected components from relates_to within the given item set.
function buildClusters(items: Item[]): Array<Item[]> {
  const extToItem = new Map(items.map((i) => [i.external_id, i]));
  const adj = new Map<string, Set<string>>();

  for (const item of items) {
    if (!adj.has(item.external_id)) {
      adj.set(item.external_id, new Set());
    }
    for (const rel of parseRelatesTo(item.relates_to)) {
      if (!extToItem.has(rel)) { continue; }
      adj.get(item.external_id)!.add(rel);
      if (!adj.has(rel)) { adj.set(rel, new Set()); }
      adj.get(rel)!.add(item.external_id);
    }
  }

  const visited = new Set<string>();
  const clusters: Array<Item[]> = [];

  for (const item of items) {
    if (visited.has(item.external_id)) { continue; }
    visited.add(item.external_id);
    const cluster: Item[] = [item];
    const queue = [...(adj.get(item.external_id) ?? [])];
    while (queue.length > 0) {
      const extId = queue.shift()!;
      if (visited.has(extId)) { continue; }
      visited.add(extId);
      const related = extToItem.get(extId);
      if (related) {
        cluster.push(related);
        for (const next of adj.get(extId) ?? []) {
          if (!visited.has(next)) { queue.push(next); }
        }
      }
    }
    clusters.push(cluster);
  }

  return clusters;
}

export function ItemList({
  items,
  onItemClick,
  sortField = "default",
  sortDir = "asc",
  filterPriorities = [],
  impactMap = {},
}: ItemListProps) {
  const filtered = filterPriorities.length > 0
    ? items.filter((i) => filterPriorities.includes((i.priority ?? "Nenhuma") as Priority))
    : items;

  const groups = STATUS_ORDER.flatMap((status) => {
    const group = filtered.filter((i) => i.status === status);
    if (group.length === 0) { return []; }
    return [{ status, items: sortItems(group, sortField, sortDir, impactMap) }];
  });

  return (
    <div className="select-none">
      {groups.map(({ status, items: groupItems }) => (
        <StatusGroup
          key={status}
          status={status}
          items={groupItems}
          onItemClick={onItemClick}
          impactMap={impactMap}
        />
      ))}
    </div>
  );
}

function StatusGroup({
  status,
  items,
  onItemClick,
  impactMap = {},
}: {
  status: ItemStatus;
  items: Item[];
  onItemClick: (item: Item) => void;
  impactMap?: Record<string, number>;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  const clusters = buildClusters(items);

  return (
    <div className="mb-0.5">
      <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-colors group/header bg-card hover:bg-secondary/60 mt-3 first:mt-0">
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="flex items-center gap-1.5 flex-1 text-left"
        >
          <ChevronRight
            className={cn(
              "w-3 h-3 text-muted-foreground/50 transition-transform duration-150 shrink-0",
              !collapsed && "rotate-90"
            )}
          />
          <Icon className={cn("w-3.5 h-3.5 shrink-0", cfg.color)} />
          <span className="text-xs font-semibold text-foreground/80">{cfg.label}</span>
          <span className="text-[11px] text-muted-foreground/50 ml-0.5 tabular-nums">{items.length}</span>
        </button>
      </div>

      {!collapsed && (
        <div className="mb-2">
          {clusters.map((cluster, idx) =>
            cluster.length === 1 ? (
              <ItemRow
                key={cluster[0].id}
                item={cluster[0]}
                onClick={() => onItemClick(cluster[0])}
                unblocks={impactMap[cluster[0].id]}
              />
            ) : (
              <div
                key={idx}
                className="my-1 rounded-lg border border-border overflow-hidden"
              >
                <div className="flex items-center gap-1.5 px-3 py-1 bg-secondary border-b border-border/60">
                  <Link2 className="w-2.5 h-2.5 text-muted-foreground/60" />
                  <span className="text-[10px] text-muted-foreground/60 font-medium tracking-wide">
                    {cluster.length} relacionados
                  </span>
                </div>
                {cluster.map((item, i) => (
                  <div key={item.id} className={cn(i > 0 && "border-t border-border/50")}>
                    <ItemRow
                      item={item}
                      onClick={() => onItemClick(item)}
                      unblocks={impactMap[item.id]}
                    />
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

function ItemRow({ item, onClick, unblocks }: { item: Item; onClick: () => void; unblocks?: number }) {
  const cfg = STATUS_CONFIG[item.status];
  const Icon = cfg.icon;
  const priorityCfg = PRIORITY_CONFIG[(item.priority as Priority) ?? "Nenhuma"];
  const labels: string[] = (() => { try { return JSON.parse(item.labels); } catch { return []; } })();
  const deps: string[] = (() => { try { return JSON.parse(item.depends_on); } catch { return []; } })();
  const rels = parseRelatesTo(item.relates_to);

  return (
    <div
      onClick={onClick}
      className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-accent/30 cursor-pointer transition-colors group"
    >
      <GripVertical className="w-3 h-3 text-muted-foreground/20 opacity-0 group-hover:opacity-100 shrink-0 transition-opacity" />

      <div className="flex items-center gap-1.5 w-20 shrink-0">
        <priorityCfg.icon size={12} className={cn("shrink-0", priorityCfg.color)} />
        <span className="text-[11px] text-muted-foreground/60 font-mono truncate">
          {item.external_id}
        </span>
      </div>

      <Icon className={cn("w-3.5 h-3.5 shrink-0", cfg.color)} />
      <span className="text-sm text-foreground flex-1 truncate min-w-0">{item.title}</span>

      {labels.length > 0 && (
        <div className="flex items-center gap-1 shrink-0">
          {labels.slice(0, 2).map((l: string) => (
            <span key={l} className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
              {l}
            </span>
          ))}
          {labels.length > 2 && (
            <span className="text-[10px] text-muted-foreground">+{labels.length - 2}</span>
          )}
        </div>
      )}

      {deps.length > 0 && (
        <span className="flex items-center gap-0.5 text-[10px] text-amber-400 shrink-0">
          <Lock className="w-2.5 h-2.5" />
          {deps.length}
        </span>
      )}

      {rels.length > 0 && (
        <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground/50 shrink-0">
          <Link2 className="w-2.5 h-2.5" />
          {rels.length}
        </span>
      )}

      {unblocks != null && unblocks > 0 && (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary shrink-0 font-medium">
          unblocks {unblocks}
        </span>
      )}

      <span className="text-[11px] text-muted-foreground/60 w-14 text-right shrink-0">
        {formatDateShort(item.created_date)}
      </span>
    </div>
  );
}
