import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  SlidersHorizontal, ChevronRight, X, ArrowUpDown, Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { STATUS_CONFIG, PRIORITY_CONFIG, parseLabels } from "@/lib/utils";
import type { ActiveFilters } from "@/hooks/usePrefs";
import type { Item, ItemStatus, Priority } from "@/types";
import { Button } from "@/components/ui/Button";

// ─── shared menu content styles ───────────────────────────────────────────────

const CONTENT_CLS =
  "z-50 min-w-[200px] rounded-xl border border-border bg-popover p-1 shadow-2xl " +
  "data-[state=open]:animate-in data-[state=closed]:animate-out " +
  "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 " +
  "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95";

const ITEM_CLS =
  "relative flex cursor-default select-none items-center gap-2.5 rounded-md px-2.5 py-1.5 " +
  "text-xs text-foreground outline-none transition-colors " +
  "focus:bg-accent/60 data-[highlighted]:bg-accent/60 data-[disabled]:pointer-events-none data-[disabled]:opacity-50";

const SEPARATOR_CLS = "my-1 h-px bg-border mx-1";

const LABEL_CLS = "px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50";

// ─── types ────────────────────────────────────────────────────────────────────

export interface SortOption {
  field: string;
  dir: "asc" | "desc";
  label: string;
}

interface FilterBarProps {
  items: Item[];
  filters: ActiveFilters;
  onFiltersChange: (f: ActiveFilters) => void;
  sortIdx: number;
  onSortChange: (idx: number) => void;
  sortOptions: SortOption[];
}

// ─── helpers ──────────────────────────────────────────────────────────────────

const STATUSES: ItemStatus[] = ["backlog", "todo", "in_progress", "done", "canceled", "duplicate"];
const PRIORITIES: Priority[] = ["Urgente", "Alta", "Média", "Baixa", "Nenhuma"];

function CheckIcon({ checked }: { checked: boolean }) {
  return (
    <span className="w-3.5 h-3.5 shrink-0 flex items-center justify-center">
      {checked && <Check className="w-3 h-3 text-primary" />}
    </span>
  );
}

// ─── sub-menu for a list of toggleable options ────────────────────────────────

function FilterSubMenu({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <DropdownMenu.Sub>
      <DropdownMenu.SubTrigger className={cn(ITEM_CLS, "justify-between")}>
        <span className="flex items-center gap-2.5">
          {icon}
          {label}
        </span>
        <ChevronRight className="w-3 h-3 text-muted-foreground/50" />
      </DropdownMenu.SubTrigger>
      <DropdownMenu.Portal>
        <DropdownMenu.SubContent
          className={CONTENT_CLS}
          sideOffset={4}
          alignOffset={-4}
        >
          {children}
        </DropdownMenu.SubContent>
      </DropdownMenu.Portal>
    </DropdownMenu.Sub>
  );
}

// ─── active filter chip ───────────────────────────────────────────────────────

interface ChipProps {
  label: string;
  onRemove: () => void;
}

function FilterChip({ label, onRemove }: ChipProps) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-primary/15 text-primary border border-primary/20">
      {label}
      <button
        onClick={onRemove}
        className="hover:text-foreground transition-colors"
      >
        <X className="w-2.5 h-2.5" />
      </button>
    </span>
  );
}

// ─── StatusIcon ───────────────────────────────────────────────────────────────

function StatusDot({ status }: { status: ItemStatus }) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return <Icon className={cn("w-3.5 h-3.5", cfg.color)} />;
}

function PriorityDot({ priority }: { priority: Priority }) {
  const cfg = PRIORITY_CONFIG[priority];
  const Icon = cfg.icon;
  return <Icon size={13} className={cfg.color} />;
}

// ─── main component ───────────────────────────────────────────────────────────

export function FilterBar({
  items,
  filters,
  onFiltersChange,
  sortIdx,
  onSortChange,
  sortOptions,
}: FilterBarProps) {
  const availableTypes = [...new Set(items.map((i) => i.type).filter(Boolean))].sort();
  const availableLabels = [...new Set(
    items.flatMap((i) => parseLabels(i.labels))
  )].sort();

  const toggle = <T extends string>(arr: T[], val: T): T[] =>
    arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];

  const set = (patch: Partial<ActiveFilters>) =>
    onFiltersChange({ ...filters, ...patch });

  const totalActive =
    filters.statuses.length +
    filters.priorities.length +
    filters.types.length +
    filters.labels.length;

  const currentSort = sortOptions[sortIdx];

  // Build chips
  const chips: { label: string; onRemove: () => void }[] = [
    ...filters.statuses.map((s) => ({
      label: `Status: ${STATUS_CONFIG[s].label}`,
      onRemove: () => set({ statuses: filters.statuses.filter((x) => x !== s) }),
    })),
    ...filters.priorities.map((p) => ({
      label: `Priority: ${p}`,
      onRemove: () => set({ priorities: filters.priorities.filter((x) => x !== p) }),
    })),
    ...filters.types.map((t) => ({
      label: `Type: ${t}`,
      onRemove: () => set({ types: filters.types.filter((x) => x !== t) }),
    })),
    ...filters.labels.map((l) => ({
      label: `Label: ${l}`,
      onRemove: () => set({ labels: filters.labels.filter((x) => x !== l) }),
    })),
  ];

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {/* Sort menu */}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <Button variant={sortIdx > 0 ? "primary" : "secondary"} size="sm" active={sortIdx > 0}>
            <ArrowUpDown className="w-3 h-3" />
            {sortIdx > 0 ? currentSort.label : "Sort"}
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className={CONTENT_CLS} align="end" sideOffset={6}>
            <p className={LABEL_CLS}>Sort by</p>
            {sortOptions.map((opt, i) => (
              <DropdownMenu.Item
                key={i}
                onSelect={() => onSortChange(i)}
                className={cn(ITEM_CLS, i === sortIdx && "text-primary")}
              >
                <CheckIcon checked={i === sortIdx} />
                {opt.label}
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      {/* Filter menu */}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <Button variant={totalActive > 0 ? "primary" : "secondary"} size="sm" active={totalActive > 0}>
            <SlidersHorizontal className="w-3 h-3" />
            {totalActive > 0 ? `Filter (${totalActive})` : "Filter"}
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className={CONTENT_CLS} align="end" sideOffset={6}>
            <p className={LABEL_CLS}>Add filter</p>

            {/* Status */}
            <FilterSubMenu
              label="Status"
              icon={<StatusDot status="todo" />}
            >
              <p className={LABEL_CLS}>Status</p>
              {STATUSES.map((s) => {
                const cfg = STATUS_CONFIG[s];
                const Icon = cfg.icon;
                const active = filters.statuses.includes(s);
                return (
                  <DropdownMenu.Item
                    key={s}
                    onSelect={(e) => { e.preventDefault(); set({ statuses: toggle(filters.statuses, s) }); }}
                    className={cn(ITEM_CLS, active && "text-primary")}
                  >
                    <CheckIcon checked={active} />
                    <Icon className={cn("w-3.5 h-3.5", cfg.color)} />
                    {cfg.label}
                  </DropdownMenu.Item>
                );
              })}
            </FilterSubMenu>

            {/* Priority */}
            <FilterSubMenu
              label="Priority"
              icon={<PriorityDot priority="Alta" />}
            >
              <p className={LABEL_CLS}>Priority</p>
              {PRIORITIES.map((p) => {
                const active = filters.priorities.includes(p);
                return (
                  <DropdownMenu.Item
                    key={p}
                    onSelect={(e) => { e.preventDefault(); set({ priorities: toggle(filters.priorities, p) }); }}
                    className={cn(ITEM_CLS, active && "text-primary")}
                  >
                    <CheckIcon checked={active} />
                    <PriorityDot priority={p} />
                    {p}
                  </DropdownMenu.Item>
                );
              })}
            </FilterSubMenu>

            {/* Type */}
            {availableTypes.length > 0 && (
              <FilterSubMenu
                label="Type"
                icon={<span className="w-3.5 h-3.5 text-[10px] font-semibold text-muted-foreground/70 uppercase flex items-center">T</span>}
              >
                <p className={LABEL_CLS}>Type</p>
                {availableTypes.map((t) => {
                  const active = filters.types.includes(t);
                  return (
                    <DropdownMenu.Item
                      key={t}
                      onSelect={(e) => { e.preventDefault(); set({ types: toggle(filters.types, t) }); }}
                      className={cn(ITEM_CLS, active && "text-primary")}
                    >
                      <CheckIcon checked={active} />
                      <span className="capitalize">{t}</span>
                    </DropdownMenu.Item>
                  );
                })}
              </FilterSubMenu>
            )}

            {/* Labels */}
            {availableLabels.length > 0 && (
              <FilterSubMenu
                label="Labels"
                icon={<span className="w-3.5 h-3.5 rounded border border-muted-foreground/30 shrink-0" />}
              >
                <p className={LABEL_CLS}>Labels</p>
                {availableLabels.map((l) => {
                  const active = filters.labels.includes(l);
                  return (
                    <DropdownMenu.Item
                      key={l}
                      onSelect={(e) => { e.preventDefault(); set({ labels: toggle(filters.labels, l) }); }}
                      className={cn(ITEM_CLS, active && "text-primary")}
                    >
                      <CheckIcon checked={active} />
                      <span className="w-2 h-2 rounded-full bg-primary/50 shrink-0" />
                      {l}
                    </DropdownMenu.Item>
                  );
                })}
              </FilterSubMenu>
            )}

            {totalActive > 0 && (
              <>
                <div className={SEPARATOR_CLS} />
                <DropdownMenu.Item
                  onSelect={() => onFiltersChange({ statuses: [], priorities: [], types: [], labels: [] })}
                  className={cn(ITEM_CLS, "text-muted-foreground")}
                >
                  <X className="w-3.5 h-3.5" />
                  Clear all filters
                </DropdownMenu.Item>
              </>
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      {/* Active filter chips */}
      {chips.map((chip) => (
        <FilterChip key={chip.label} label={chip.label} onRemove={chip.onRemove} />
      ))}

      {/* Clear all chips shortcut */}
      {chips.length > 1 && (
        <Button
          variant="ghost"
          size="icon"
          title="Clear all filters"
          onClick={() => onFiltersChange({ statuses: [], priorities: [], types: [], labels: [] })}
        >
          <X className="w-3 h-3" />
        </Button>
      )}
    </div>
  );
}
