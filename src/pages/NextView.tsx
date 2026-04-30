import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useMemo, useState, useEffect, useRef } from "react";
import { Zap, Lock, X, ChevronDown, Check, ArrowUpRight } from "lucide-react";
import { useNextItems, type SortMode } from "@/hooks/useNextItems";
import {
  PriorityNone, PriorityUrgent, PriorityHigh, PriorityMedium, PriorityLow,
} from "@/components/ui/PriorityIcon";
import { cn } from "@/lib/utils";
import type { Priority } from "@/types";
import type { ScoredItem } from "@/hooks/useNextItems";

function PriorityIcon({ priority, size = 14 }: { priority: Priority | null; size?: number }) {
  const p = priority ?? "Nenhuma";
  if (p === "Urgente") { return <PriorityUrgent size={size} className="text-red-400" />; }
  if (p === "Alta") { return <PriorityHigh size={size} className="text-orange-400" />; }
  if (p === "Média") { return <PriorityMedium size={size} className="text-yellow-400" />; }
  if (p === "Baixa") { return <PriorityLow size={size} className="text-blue-400" />; }
  return <PriorityNone size={size} className="text-muted-foreground/40" />;
}

function scopeLabel(scope: string): string {
  const parts = scope.split("/");
  return parts[parts.length - 1] ?? scope;
}

function FilterPill({
  label,
  options,
  active,
  onSelect,
}: {
  label: string;
  options: string[];
  active: string | null;
  onSelect: (v: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) { return; }
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const isActive = active !== null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-colors",
          isActive
            ? "border-primary/40 bg-primary/10 text-primary"
            : "border-border text-muted-foreground hover:text-foreground hover:bg-accent"
        )}
      >
        <span>{isActive ? `${label}: ${active}` : label}</span>
        {isActive ? (
          <X
            className="w-3 h-3 shrink-0"
            onClick={(e) => { e.stopPropagation(); onSelect(null); setOpen(false); }}
          />
        ) : (
          <ChevronDown className="w-3 h-3 shrink-0 opacity-50" />
        )}
      </button>

      {open && options.length > 0 && (
        <div className="absolute top-full left-0 mt-1 z-50 min-w-[130px] bg-popover border border-border rounded-lg shadow-lg overflow-hidden py-1">
          <button
            type="button"
            onClick={() => { onSelect(null); setOpen(false); }}
            className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-accent transition-colors"
          >
            <span className={cn("w-3 h-3 shrink-0", active === null ? "opacity-100" : "opacity-0")}>
              <Check className="w-3 h-3" />
            </span>
            All
          </button>
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => { onSelect(opt); setOpen(false); }}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-accent transition-colors"
            >
              <span className={cn("w-3 h-3 shrink-0", active === opt ? "opacity-100" : "opacity-0")}>
                <Check className="w-3 h-3" />
              </span>
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ItemRow({ s, rank, onClick }: { s: ScoredItem; rank: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 px-4 py-3 text-sm w-full text-left transition-colors hover:bg-accent/40"
    >
      <span className="text-xs text-muted-foreground/50 w-5 text-right shrink-0 tabular-nums">
        {rank}
      </span>
      <span className="shrink-0">
        <PriorityIcon priority={s.item.priority as Priority} size={13} />
      </span>
      <span className="font-mono text-[11px] text-muted-foreground shrink-0 w-16">
        {s.item.external_id}
      </span>
      <span className="flex-1 truncate text-xs">{s.item.title}</span>
      <div className="flex items-center gap-1 shrink-0">
        {s.labelMultiplier > 1 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 tabular-nums">
            ×{Number.isInteger(s.labelMultiplier) ? s.labelMultiplier : s.labelMultiplier.toFixed(1)}
          </span>
        )}
        {s.unblocks > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary tabular-nums">
            ↑{s.unblocks}
          </span>
        )}
      </div>
    </button>
  );
}

function BlockedRow({ s, rank, onClick }: { s: ScoredItem; rank: number; onClick: () => void }) {
  const preview = s.blockedBy.slice(0, 2).join(", ");
  const overflow = s.blockedBy.length > 2 ? ` +${s.blockedBy.length - 2}` : "";
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 px-4 py-3 text-sm w-full text-left transition-colors hover:bg-accent/40 opacity-50"
    >
      <span className="text-xs text-muted-foreground/50 w-5 text-right shrink-0">
        <Lock className="w-3 h-3" />
      </span>
      <span className="shrink-0">
        <PriorityIcon priority={s.item.priority as Priority} size={13} />
      </span>
      <span className="font-mono text-[11px] text-muted-foreground shrink-0 w-16">
        {s.item.external_id}
      </span>
      <span className="flex-1 truncate text-xs">{s.item.title}</span>
      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground shrink-0">
        blocked by {preview}{overflow}
      </span>
    </button>
  );
}

export function NextView() {
  const { repoId } = useParams<{ repoId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const sortMode = (searchParams.get("sort") ?? "score") as SortMode;
  const scored = useNextItems(repoId!, sortMode);

  const activeScope = searchParams.get("scope");
  const activeType = searchParams.get("type");

  const setFilter = (key: "scope" | "type", value: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (value === null) {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    setSearchParams(next, { replace: true });
  };

  const allScopes = useMemo(
    () => [...new Set(scored.map((s) => s.item.scope).filter(Boolean))].sort(),
    [scored],
  );
  const allTypes = useMemo(
    () => [...new Set(scored.map((s) => s.item.type).filter(Boolean))].sort(),
    [scored],
  );

  const scopeOptions = allScopes.map(scopeLabel);
  const activeRawScope = activeScope
    ? (allScopes.find((s) => scopeLabel(s) === activeScope) ?? null)
    : null;

  const filtered = useMemo(
    () =>
      scored.filter((s) => {
        if (activeRawScope && s.item.scope !== activeRawScope) {
          return false;
        }
        if (activeType && s.item.type !== activeType) {
          return false;
        }
        return true;
      }),
    [scored, activeRawScope, activeType],
  );

  const ready = filtered.filter((s) => s.ready);
  const blocked = filtered.filter((s) => !s.ready);
  const hasFilters = activeScope !== null || activeType !== null;

  if (scored.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        No todo or backlog items found.
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center gap-2">
        <Zap className="w-4 h-4 fill-amber-400 text-amber-400" />
        <h1 className="text-sm font-semibold">Next Up</h1>
        <span className="text-xs text-muted-foreground/50">
          {ready.length} ready · {blocked.length} blocked
        </span>

        {(scopeOptions.length > 1 || allTypes.length > 1) && (
          <>
            <div className="w-px h-3.5 bg-border mx-1" />
            {scopeOptions.length > 1 && (
              <FilterPill
                label="Scope"
                options={scopeOptions}
                active={activeScope}
                onSelect={(v) => setFilter("scope", v)}
              />
            )}
            {allTypes.length > 1 && (
              <FilterPill
                label="Type"
                options={allTypes}
                active={activeType}
                onSelect={(v) => setFilter("type", v)}
              />
            )}
          </>
        )}

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              if (sortMode === "impact") { next.delete("sort"); } else { next.set("sort", "impact"); }
              setSearchParams(next, { replace: true });
            }}
            className={cn(
              "flex items-center gap-1 text-[11px] px-2 py-1 rounded-full border transition-colors",
              sortMode === "impact"
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground hover:bg-accent"
            )}
          >
            <ArrowUpRight className="w-3 h-3" />
            Impacto primeiro
          </button>
          {hasFilters && (
            <button
              type="button"
              onClick={() => setSearchParams(sortMode === "impact" ? { sort: "impact" } : {}, { replace: true })}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-3 h-3" />
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-12">
          No items match the current filters.
        </p>
      )}

      {ready.length > 0 && (
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-secondary/40 border-b border-border flex items-center gap-2">
            <span className="text-xs font-medium">Ready to start</span>
            <span className="text-[10px] text-muted-foreground/50">{ready.length}</span>
          </div>
          {ready.map((s, i) => (
            <div key={s.item.id} className={cn(i > 0 && "border-t border-border")}>
              <ItemRow
                s={s}
                rank={i + 1}
                onClick={() => navigate(`/repos/${repoId}/items/${s.item.id}`)}
              />
            </div>
          ))}
        </div>
      )}

      {blocked.length > 0 && (
        <div className="border border-border/50 rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-secondary/20 border-b border-border/50 flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Blocked</span>
            <span className="text-[10px] text-muted-foreground/50">{blocked.length}</span>
          </div>
          {blocked.map((s, i) => (
            <div key={s.item.id} className={cn(i > 0 && "border-t border-border/50")}>
              <BlockedRow
                s={s}
                rank={ready.length + i + 1}
                onClick={() => navigate(`/repos/${repoId}/items/${s.item.id}`)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
