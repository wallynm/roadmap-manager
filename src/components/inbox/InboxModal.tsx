import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import { Bell, Check, Eye, X } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { ModalOverlay, ModalPanel } from "@/components/ui/Modal";

let _openInbox: (() => void) | null = null;

export function openInbox() {
  _openInbox?.();
}

const TABS = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export function InboxModal() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("all");
  const queryClient = useQueryClient();

  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications"],
    queryFn: api.getNotifications,
    enabled: open,
  });

  const markAllRead = useMutation({
    mutationFn: api.markAllNotificationsRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markRead = useMutation({
    mutationFn: (id: string) => api.markNotificationRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  useEffect(() => {
    _openInbox = () => setOpen(true);
    return () => { _openInbox = null; };
  }, []);

  useEffect(() => {
    const handleOpen = () => setOpen((o) => !o);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("open-inbox", handleOpen);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("open-inbox", handleOpen);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  if (!open) {
    return null;
  }

  const unreadCount = notifications.filter((n) => n.read === 0).length;
  const visible = tab === "unread" ? notifications.filter((n) => n.read === 0) : notifications;

  return (
    <ModalOverlay align="top" layer="above" className="pt-[15vh]" onClose={() => setOpen(false)}>
      <ModalPanel className="w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">Inbox</span>
            {unreadCount > 0 && (
              <Badge variant="primary">{unreadCount}</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={() => markAllRead.mutate()}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Check className="w-3 h-3" />
                Mark all read
              </button>
            )}
            <button
              onClick={() => setOpen(false)}
              className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-3 pt-2 pb-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "px-3 py-1 text-xs font-medium rounded-full transition-colors",
                tab === t.id
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
            >
              {t.label}
              {t.id === "unread" && unreadCount > 0 && (
                <span className="ml-1.5">{unreadCount}</span>
              )}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="max-h-80 overflow-y-auto p-2 space-y-1">
          {visible.length > 0 ? (
            visible.map((notif) => (
              <div
                key={notif.id}
                className={cn(
                  "flex items-start gap-2.5 px-3 py-2.5 rounded-lg border transition-colors",
                  notif.read === 0
                    ? "border-primary/25 bg-primary/5"
                    : "border-transparent hover:bg-accent/50"
                )}
              >
                <Bell
                  className={cn(
                    "w-3.5 h-3.5 mt-0.5 shrink-0",
                    notif.read === 0 ? "text-primary" : "text-muted-foreground"
                  )}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm leading-snug">{notif.title}</p>
                  {notif.body && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                      {notif.body}
                    </p>
                  )}
                  <p className="text-[10px] text-muted-foreground/60 mt-1">
                    {new Date(notif.created_at).toLocaleString("pt-BR")}
                  </p>
                </div>
                {notif.read === 0 && (
                  <button
                    onClick={() => markRead.mutate(notif.id)}
                    className="p-1 rounded hover:bg-accent transition-colors shrink-0"
                    title="Mark as read"
                  >
                    <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                )}
              </div>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
              <Bell className="w-7 h-7 mb-2 opacity-30" />
              <p className="text-xs">
                {tab === "unread" ? "No unread notifications" : "No notifications yet"}
              </p>
            </div>
          )}
        </div>
      </ModalPanel>
    </ModalOverlay>
  );
}
