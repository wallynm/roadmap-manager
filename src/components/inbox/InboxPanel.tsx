import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/tauri";
import { Bell, Check, Eye } from "lucide-react";

export function InboxPanel() {
  const queryClient = useQueryClient();
  const { data: notifications } = useQuery({
    queryKey: ["notifications"],
    queryFn: api.getNotifications,
  });

  const markAllRead = useMutation({
    mutationFn: api.markAllNotificationsRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markRead = useMutation({
    mutationFn: (id: string) => api.markNotificationRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const unread = notifications?.filter((n) => n.read === 0) || [];

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Bell className="w-5 h-5" />
          Inbox
          {unread.length > 0 && (
            <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full">
              {unread.length}
            </span>
          )}
        </h2>
        {unread.length > 0 && (
          <button
            onClick={() => markAllRead.mutate()}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <Check className="w-3 h-3" />
            Mark all read
          </button>
        )}
      </div>

      {notifications && notifications.length > 0 ? (
        <div className="space-y-2">
          {notifications.map((notif) => (
            <div
              key={notif.id}
              className={`flex items-start gap-3 p-3 rounded-lg border ${
                notif.read === 0 ? "border-primary/30 bg-primary/5" : "border-border"
              }`}
            >
              <div className="flex-1">
                <div className="text-sm font-medium">{notif.title}</div>
                {notif.body && (
                  <div className="text-xs text-muted-foreground mt-0.5">{notif.body}</div>
                )}
                <div className="text-xs text-muted-foreground mt-1">
                  {new Date(notif.created_at).toLocaleString("pt-BR")}
                </div>
              </div>
              {notif.read === 0 && (
                <button
                  onClick={() => markRead.mutate(notif.id)}
                  className="p-1 hover:bg-accent rounded"
                >
                  <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <Bell className="w-8 h-8 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No notifications yet</p>
        </div>
      )}
    </div>
  );
}
