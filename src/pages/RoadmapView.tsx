import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/tauri";
import { BlockNoteEditor } from "@/components/editor/BlockNoteEditor";
import { RefreshCw, FileText, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";

export function RoadmapView() {
  const { repoId } = useParams<{ repoId: string }>();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["roadmap", repoId],
    queryFn: () => api.getRoadmap(repoId!),
    enabled: !!repoId,
  });

  const regenerate = useMutation({
    mutationFn: () => api.regenerateRoadmap(repoId!),
    onSuccess: (result) => {
      queryClient.setQueryData(["roadmap", repoId], result);
      toast.success("ROADMAP.md regenerated");
    },
    onError: (e) => toast.error(String(e)),
  });

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">ROADMAP.md</span>
          {data && (
            <Badge variant={data.exists ? "green" : "amber"}>
              {data.exists ? "exists" : "not generated"}
            </Badge>
          )}
        </div>
        <button
          onClick={() => regenerate.mutate()}
          disabled={regenerate.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-primary/15 text-primary hover:bg-primary/25 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={cn("w-3 h-3", regenerate.isPending && "animate-spin")} />
          {regenerate.isPending ? "Generating…" : "Regenerate"}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {isLoading && (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Loading…
          </div>
        )}

        {!isLoading && data && !data.exists && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
            <AlertCircle className="w-8 h-8 opacity-30" />
            <p className="text-sm">ROADMAP.md not found</p>
            <p className="text-xs opacity-60">
              Click <strong className="text-foreground">Regenerate</strong> to build it from all items
            </p>
          </div>
        )}

        {!isLoading && data?.exists && data.content && (
          <BlockNoteEditor
            key={data.path}
            markdown={data.content}
            editable={false}
          />
        )}
      </div>

      {data?.path && (
        <p className="text-[10px] text-muted-foreground/40 mt-2 shrink-0 font-mono truncate">
          {data.path}
        </p>
      )}
    </div>
  );
}
