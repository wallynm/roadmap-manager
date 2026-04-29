import { TrendingUp, RefreshCw } from "lucide-react";
import { useParams } from "react-router-dom";
import { useImpactRanking, useImpactRankingCache } from "@/hooks/useValidation";
import { cn } from "@/lib/utils";

export function ImpactView() {
  const { repoId } = useParams<{ repoId: string }>();

  const { data: cached } = useImpactRankingCache(repoId!);
  const { data: fresh, isFetching, refetch, dataUpdatedAt } = useImpactRanking(repoId!);

  const ranking = fresh ?? cached ?? null;
  const isInitialLoad = isFetching && !ranking;

  const lastUpdated = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold">Impact Ranking</h1>
          {isFetching && (
            <span className="text-xs text-muted-foreground/50">recalculating...</span>
          )}
          {!isFetching && lastUpdated && (
            <span className="text-xs text-muted-foreground/50">
              updated {lastUpdated}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
            "bg-secondary hover:bg-secondary/80 text-foreground",
            "disabled:opacity-50"
          )}
        >
          <RefreshCw className={cn("w-3 h-3", isFetching && "animate-spin")} />
          Recalculate
        </button>
      </div>

      <p className="text-xs text-muted-foreground">
        Items ranked by how many others they transitively unblock. Delivering the top items first maximizes flow.
      </p>

      {isInitialLoad && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground text-sm gap-2">
          <RefreshCw className="w-6 h-6 opacity-40 animate-spin" />
          <p>Calculating...</p>
        </div>
      )}

      {!isInitialLoad && ranking && ranking.length === 0 && (
        <p className="text-xs text-muted-foreground px-4 py-8 text-center">
          No active items with dependents found.
        </p>
      )}

      {!isInitialLoad && ranking && ranking.length > 0 && (
        <div className={cn("border border-border rounded-lg overflow-hidden", isFetching && "opacity-60")}>
          {ranking.map((item, i) => (
            <div
              key={item.id}
              className={cn(
                "flex items-center gap-4 px-4 py-3 text-sm",
                i !== 0 && "border-t border-border"
              )}
            >
              <span className="text-xs text-muted-foreground w-6 text-right shrink-0">
                {i + 1}.
              </span>
              <span className="font-mono text-xs flex-1">{item.external_id}</span>
              {item.unblocks > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-primary/15 text-primary shrink-0">
                  unblocks {item.unblocks}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
