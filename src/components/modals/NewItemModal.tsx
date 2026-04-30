import { useState } from "react";
import { X, Bot } from "lucide-react";
import { useCreateItem } from "@/hooks/useItems";
import { api } from "@/lib/tauri";
import { AgentRunModal } from "./AgentRunModal";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { ModalOverlay, ModalPanel } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface NewItemModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repoId: string;
}

const TYPES = ["improvement", "bug", "refactoring", "feature"];
const PRIORITIES = ["Urgente", "Alta", "Média", "Baixa", "Nenhuma"];

export function NewItemModal({ open, onOpenChange, repoId }: NewItemModalProps) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [itemType, setItemType] = useState("improvement");
  const [priority, setPriority] = useState("Média");
  const [labelInput, setLabelInput] = useState("");
  const [labels, setLabels] = useState<string[]>([]);
  const [useAgent, setUseAgent] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const createItem = useCreateItem();

  if (!open) {
    return null;
  }

  if (activeRunId) {
    return (
      <AgentRunModal
        open
        onOpenChange={(v) => {
          if (!v) {
            setActiveRunId(null);
            onOpenChange(false);
            resetForm();
          }
        }}
        runId={activeRunId}
        repoId={repoId}
      />
    );
  }

  function resetForm() {
    setTitle("");
    setBody("");
    setLabels([]);
    setUseAgent(false);
    setActiveRunId(null);
  }

  const handleSubmit = async () => {
    if (!title.trim()) {
      return;
    }

    if (useAgent) {
      try {
        const runId = await api.agentInvoke({
          trigger: "create",
          repoId,
          itemType,
          title: title.trim(),
          description: body || undefined,
        });
        setActiveRunId(runId);
      } catch (err) {
        toast.error(`Agent failed: ${err}`);
      }
      return;
    }

    createItem.mutate(
      {
        repoId,
        itemType,
        title: title.trim(),
        body: body || `# — ${title}\n\nTODO`,
        priority,
        labels,
      },
      {
        onSuccess: (item) => {
          toast.success(`${item.external_id} created`);
          onOpenChange(false);
          resetForm();
        },
        onError: (err) => {
          toast.error(`Failed: ${err}`);
        },
      }
    );
  };

  const addLabel = () => {
    if (labelInput.trim() && !labels.includes(labelInput.trim())) {
      setLabels([...labels, labelInput.trim()]);
      setLabelInput("");
    }
  };

  return (
    <ModalOverlay onClose={() => onOpenChange(false)}>
      <ModalPanel className="w-full max-w-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <span className="text-sm text-muted-foreground">New item</span>
          <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="p-6 space-y-4">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Issue title"
            className="w-full bg-transparent text-lg font-medium placeholder:text-muted-foreground focus:outline-none"
            autoFocus
          />

          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add description..."
            size="md"
            className="w-full min-h-[120px]"
          />

          <div className="flex flex-wrap gap-3">
            <Select
              value={itemType}
              onChange={(e) => setItemType(e.target.value)}
              size="md"
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </Select>

            <Select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              size="md"
              disabled={useAgent}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </Select>

            <div className="flex items-center gap-1">
              <Input
                value={labelInput}
                onChange={(e) => setLabelInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addLabel())}
                placeholder="Label"
                size="md"
                className="w-24"
              />
            </div>

            <button
              onClick={() => setUseAgent(!useAgent)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded text-sm border transition-colors",
                useAgent
                  ? "bg-primary/20 border-primary text-primary"
                  : "bg-secondary border-border text-muted-foreground hover:text-foreground"
              )}
            >
              <Bot className="w-3.5 h-3.5" />
              Use agent
            </button>
          </div>

          {labels.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              {labels.map((l) => (
                <span
                  key={l}
                  onClick={() => setLabels(labels.filter((x) => x !== l))}
                  className="text-xs bg-secondary text-muted-foreground px-2 py-1 rounded cursor-pointer hover:bg-destructive/20"
                >
                  {l} ×
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end px-6 py-4 border-t border-border">
          <Button
            variant="solid"
            size="lg"
            disabled={!title.trim()}
            loading={createItem.isPending}
            onClick={handleSubmit}
          >
            {useAgent ? "Start agent" : "Create issue"}
          </Button>
        </div>
      </ModalPanel>
    </ModalOverlay>
  );
}
