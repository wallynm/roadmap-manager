import { useState } from "react";
import { MessageSquare, Bot, User } from "lucide-react";
import type { Comment } from "@/types";
import { useAddComment } from "@/hooks/useItems";
import { toast } from "sonner";

interface CommentListProps {
  comments: Comment[];
  itemId: string;
}

export function CommentList({ comments, itemId }: CommentListProps) {
  const [newComment, setNewComment] = useState("");
  const [showInput, setShowInput] = useState(false);
  const addComment = useAddComment();

  const handleSubmit = () => {
    if (!newComment.trim()) return;
    addComment.mutate(
      { itemId, body: newComment.trim() },
      {
        onSuccess: () => {
          setNewComment("");
          setShowInput(false);
          toast.success("Comment added");
        },
      }
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <MessageSquare className="w-4 h-4" />
          Comments ({comments.length})
        </h3>
        <button
          onClick={() => setShowInput(!showInput)}
          className="text-xs text-primary hover:underline"
        >
          + Add comment
        </button>
      </div>

      {comments.map((comment) => (
        <div key={comment.id} className="border-l-2 border-border pl-3 py-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            {comment.is_agent ? (
              <Bot className="w-3 h-3" />
            ) : (
              <User className="w-3 h-3" />
            )}
            <span className="font-medium">
              {comment.author}
              {comment.is_agent ? " (auto)" : ""}
            </span>
            <span>·</span>
            <span>{new Date(comment.created_at).toLocaleString("pt-BR")}</span>
          </div>
          <div className="text-sm text-foreground">{comment.body}</div>
        </div>
      ))}

      {showInput && (
        <div className="space-y-2">
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Write a comment..."
            className="w-full bg-secondary border border-border rounded px-3 py-2 text-sm min-h-[60px] resize-y"
            autoFocus
          />
          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              disabled={!newComment.trim() || addComment.isPending}
              className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50"
            >
              Submit
            </button>
            <button
              onClick={() => { setShowInput(false); setNewComment(""); }}
              className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
