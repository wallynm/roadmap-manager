import { useState } from "react";
import { MessageSquare, Bot, User, Pencil, Trash2 } from "lucide-react";
import type { Comment } from "@/types";
import { useAddComment, useEditComment, useDeleteComment } from "@/hooks/useItems";
import { Textarea } from "@/components/ui/Input";
import { toast } from "sonner";

interface CommentListProps {
  comments: Comment[];
  itemId: string;
}

export function CommentList({ comments, itemId }: CommentListProps) {
  const [newComment, setNewComment] = useState("");
  const [showInput, setShowInput] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const addComment = useAddComment();
  const editComment = useEditComment();
  const deleteComment = useDeleteComment();

  const handleSubmit = () => {
    if (!newComment.trim()) { return; }
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

  const handleEditStart = (comment: Comment) => {
    setEditingId(comment.id);
    setEditBody(comment.body);
  };

  const handleEditSave = (comment: Comment) => {
    if (!editBody.trim()) { return; }
    editComment.mutate(
      { itemId, author: comment.author, createdAt: comment.created_at, newBody: editBody.trim() },
      {
        onSuccess: () => {
          setEditingId(null);
          toast.success("Comment updated");
        },
      }
    );
  };

  const handleDelete = (comment: Comment) => {
    deleteComment.mutate(
      { itemId, author: comment.author, createdAt: comment.created_at },
      {
        onSuccess: () => {
          toast.success("Comment deleted");
        },
      }
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
          <MessageSquare className="w-3.5 h-3.5" />
          Comments ({comments.length})
        </h3>
        <button
          onClick={() => setShowInput(!showInput)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          + Add comment
        </button>
      </div>

      {comments.map((comment) => (
        <div key={comment.id} className="border-l-2 border-border pl-3 py-1 group/comment">
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
            <span>{comment.created_at}</span>
            {!comment.is_agent && (
              <div className="ml-auto opacity-0 group-hover/comment:opacity-100 flex items-center gap-1 transition-opacity">
                <button
                  onClick={() => handleEditStart(comment)}
                  className="p-0.5 hover:text-foreground transition-colors"
                  title="Edit"
                >
                  <Pencil className="w-3 h-3" />
                </button>
                <button
                  onClick={() => handleDelete(comment)}
                  disabled={deleteComment.isPending}
                  className="p-0.5 hover:text-red-400 transition-colors disabled:opacity-40"
                  title="Delete"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
          {editingId === comment.id ? (
            <div className="space-y-2">
              <Textarea
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                size="md"
                className="w-full bg-secondary/60 min-h-[60px] resize-none"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  disabled={!editBody.trim() || editComment.isPending}
                  onClick={() => handleEditSave(comment)}
                  className="px-3 py-1.5 text-xs font-medium rounded-md bg-primary/15 text-primary hover:bg-primary/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {editComment.isPending ? "Saving…" : "Save"}
                </button>
                <button
                  onClick={() => setEditingId(null)}
                  className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="text-sm text-foreground">{comment.body}</div>
          )}
        </div>
      ))}

      {showInput && (
        <div className="space-y-2">
          <Textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Write a comment..."
            size="md"
            className="w-full bg-secondary/60 min-h-[72px] resize-none focus:ring-2 focus:ring-primary/60 placeholder:text-muted-foreground/50"
            autoFocus
          />
          <div className="flex gap-2">
            <button
              disabled={!newComment.trim() || addComment.isPending}
              onClick={handleSubmit}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-primary/15 text-primary hover:bg-primary/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {addComment.isPending ? "Saving…" : "Submit"}
            </button>
            <button
              onClick={() => { setShowInput(false); setNewComment(""); }}
              className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
