import { useCallback, useEffect, useReducer, useRef } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { api } from "@/lib/tauri";
import type { AgentMessage } from "@/components/agent/ConversationView";

type AgentPhase = "idle" | "running" | "question" | "finished" | "error";

interface AgentState {
  phase: AgentPhase;
  messages: AgentMessage[];
  pendingQuestion: string | null;
  result: { frontmatter?: Record<string, unknown>; body?: string; note?: string } | null;
  error: string | null;
}

type AgentAction =
  | { type: "RESET" }
  | { type: "STARTED" }
  | { type: "DELTA"; text: string }
  | { type: "TOOL_CALL"; name: string; args: unknown }
  | { type: "QUESTION"; text: string }
  | { type: "USER_RESPONDED"; text: string }
  | { type: "FINISHED"; result: AgentState["result"] }
  | { type: "ERROR"; message: string };

function reducer(state: AgentState, action: AgentAction): AgentState {
  switch (action.type) {
    case "RESET":
      return initialState;
    case "STARTED":
      return { ...state, phase: "running", messages: [], error: null, result: null };
    case "DELTA": {
      const last = state.messages[state.messages.length - 1];
      if (last && last.role === "assistant") {
        const updated = [...state.messages];
        updated[updated.length - 1] = { ...last, content: last.content + action.text };
        return { ...state, messages: updated };
      }
      return {
        ...state,
        messages: [...state.messages, { role: "assistant", content: action.text }],
      };
    }
    case "TOOL_CALL":
      return {
        ...state,
        messages: [
          ...state.messages,
          { role: "tool", content: JSON.stringify(action.args, null, 2), toolName: action.name },
        ],
      };
    case "QUESTION":
      return { ...state, phase: "question", pendingQuestion: action.text };
    case "USER_RESPONDED":
      return {
        ...state,
        phase: "running",
        pendingQuestion: null,
        messages: [...state.messages, { role: "user", content: action.text }],
      };
    case "FINISHED":
      return { ...state, phase: "finished", result: action.result };
    case "ERROR":
      return { ...state, phase: "error", error: action.message };
    default:
      return state;
  }
}

const initialState: AgentState = {
  phase: "idle",
  messages: [],
  pendingQuestion: null,
  result: null,
  error: null,
};

export function useAgentRun(runId: string | null) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const unlistenersRef = useRef<UnlistenFn[]>([]);

  useEffect(() => {
    if (!runId) return;

    dispatch({ type: "STARTED" });

    const setup = async () => {
      const u1 = await listen<{ text: string }>("agent:delta", (e) => {
        dispatch({ type: "DELTA", text: e.payload.text });
      });
      const u2 = await listen<{ name: string; args: unknown }>("agent:tool_call", (e) => {
        dispatch({ type: "TOOL_CALL", name: e.payload.name, args: e.payload.args });
      });
      const u3 = await listen<{ text: string }>("agent:question", (e) => {
        dispatch({ type: "QUESTION", text: e.payload.text });
      });
      const u4 = await listen<{ result: AgentState["result"] }>("agent:finished", (e) => {
        dispatch({ type: "FINISHED", result: e.payload.result });
      });
      const u5 = await listen<{ message: string }>("agent:error", (e) => {
        dispatch({ type: "ERROR", message: e.payload.message });
      });
      unlistenersRef.current = [u1, u2, u3, u4, u5];
    };

    setup();

    return () => {
      unlistenersRef.current.forEach((unlisten) => unlisten());
      unlistenersRef.current = [];
    };
  }, [runId]);

  const respond = useCallback(
    async (text: string) => {
      if (!runId) return;
      dispatch({ type: "USER_RESPONDED", text });
      await api.agentRespond(runId, text);
    },
    [runId]
  );

  const cancel = useCallback(async () => {
    if (!runId) return;
    await api.agentCancel(runId);
    dispatch({ type: "ERROR", message: "Cancelled by user" });
  }, [runId]);

  const reset = useCallback(() => dispatch({ type: "RESET" }), []);

  return {
    ...state,
    isRunning: state.phase === "running",
    respond,
    cancel,
    reset,
  };
}
