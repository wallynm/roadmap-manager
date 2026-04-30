import { useState } from "react";
import { Bot, User, Wrench, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/Input";

export interface AgentMessage {
  role: "assistant" | "user" | "tool";
  content: string;
  toolName?: string;
}

interface ConversationViewProps {
  messages: AgentMessage[];
  isRunning: boolean;
  onUserRespond?: (text: string) => void;
  questionPending?: string | null;
}

export function ConversationView({
  messages,
  isRunning,
  onUserRespond,
  questionPending,
}: ConversationViewProps) {
  return (
    <div className="space-y-3 max-h-[400px] overflow-y-auto">
      {messages.map((msg, i) => (
        <div key={i} className="flex gap-2">
          <div className="shrink-0 mt-0.5">
            {msg.role === "assistant" && <Bot className="w-4 h-4 text-primary" />}
            {msg.role === "user" && <User className="w-4 h-4 text-muted-foreground" />}
            {msg.role === "tool" && <Wrench className="w-4 h-4 text-amber-400" />}
          </div>
          <div className="text-sm">
            {msg.role === "tool" && (
              <span className="text-xs text-amber-400 font-mono">
                {msg.toolName}
              </span>
            )}
            <p className="text-foreground whitespace-pre-wrap">{msg.content}</p>
          </div>
        </div>
      ))}

      {isRunning && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Thinking...</span>
        </div>
      )}

      {questionPending && onUserRespond && (
        <QuestionInput question={questionPending} onSubmit={onUserRespond} />
      )}
    </div>
  );
}

function QuestionInput({ question, onSubmit }: { question: string; onSubmit: (text: string) => void }) {
  const [value, setValue] = useState("");

  return (
    <div className="border border-primary/30 rounded-lg p-3 space-y-2">
      <p className="text-sm text-primary">{question}</p>
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && value.trim()) {
              onSubmit(value.trim());
              setValue("");
            }
          }}
          size="md"
          className="flex-1"
          placeholder="Type your answer..."
          autoFocus
        />
        <button
          onClick={() => {
            if (value.trim()) {
              onSubmit(value.trim());
              setValue("");
            }
          }}
          className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded"
        >
          Send
        </button>
      </div>
    </div>
  );
}
