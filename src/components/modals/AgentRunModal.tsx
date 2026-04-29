import { X, Loader2, Check, AlertTriangle } from "lucide-react";
import { useAgentRun } from "@/hooks/useAgentRun";
import { useCreateItem } from "@/hooks/useItems";
import { ConversationView } from "@/components/agent/ConversationView";
import { Button } from "@/components/ui/Button";
import { toast } from "sonner";

interface AgentRunModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  runId: string | null;
  repoId: string;
}

export function AgentRunModal({ open, onOpenChange, runId, repoId }: AgentRunModalProps) {
  const agent = useAgentRun(runId);
  const createItem = useCreateItem();

  if (!open || !runId) {
    return null;
  }

  const handleSave = () => {
    if (!agent.result) {
      return;
    }
    const fm = agent.result.frontmatter || {};

    createItem.mutate(
      {
        repoId,
        itemType: (fm.type as string) || "improvement",
        title: (fm.title as string) || "Untitled",
        body: agent.result.body || "",
        priority: fm.priority as string | undefined,
        labels: fm.labels as string[] | undefined,
      },
      {
        onSuccess: (item) => {
          toast.success(`${item.external_id} created via agent`);
          agent.reset();
          onOpenChange(false);
        },
        onError: (err) => {
          toast.error(`Save failed: ${err}`);
        },
      }
    );
  };

  const handleCancel = () => {
    agent.cancel();
    agent.reset();
    onOpenChange(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleCancel}
    >
      <div
        className="bg-card border border-border rounded-xl w-full max-w-2xl shadow-2xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            {agent.isRunning && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
            {agent.phase === "finished" && <Check className="w-4 h-4 text-green-400" />}
            {agent.phase === "error" && <AlertTriangle className="w-4 h-4 text-destructive" />}
            <span className="text-sm text-muted-foreground">Agent run</span>
          </div>
          <Button variant="ghost" size="icon" onClick={handleCancel}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <ConversationView
            messages={agent.messages}
            isRunning={agent.isRunning}
            onUserRespond={agent.phase === "question" ? agent.respond : undefined}
            questionPending={agent.pendingQuestion}
          />

          {agent.phase === "error" && (
            <div className="mt-4 p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
              <p className="text-sm text-destructive">{agent.error}</p>
            </div>
          )}

          {agent.phase === "finished" && agent.result && (
            <div className="mt-4 border border-border rounded-lg overflow-hidden">
              <div className="px-4 py-2 bg-secondary text-xs text-muted-foreground font-medium">
                Preview
              </div>
              <div className="p-4 space-y-2">
                {agent.result.frontmatter && (
                  <div className="font-mono text-xs text-muted-foreground space-y-0.5">
                    {Object.entries(agent.result.frontmatter).map(([k, v]) => (
                      <div key={k}>
                        <span className="text-primary">{k}:</span>{" "}
                        {typeof v === "object" ? JSON.stringify(v) : String(v)}
                      </div>
                    ))}
                  </div>
                )}
                {agent.result.body && (
                  <pre className="text-sm text-foreground whitespace-pre-wrap mt-3 pt-3 border-t border-border">
                    {agent.result.body}
                  </pre>
                )}
                {agent.result.note && (
                  <div className="text-sm text-foreground mt-2">
                    <span className="text-muted-foreground">Note: </span>
                    {agent.result.note}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border shrink-0">
          <Button variant="secondary" size="lg" onClick={handleCancel}>
            Cancel
          </Button>
          {agent.phase === "finished" && agent.result?.frontmatter && (
            <Button variant="solid" size="lg" loading={createItem.isPending} onClick={handleSave}>
              Save & commit
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
