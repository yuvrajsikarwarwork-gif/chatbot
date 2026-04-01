import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, CheckCheck, ChevronDown, CircleAlert } from "lucide-react";
import { useRouter } from "next/router";

import { notificationService, type NotificationItem } from "../../services/notificationService";
import { useAuthStore } from "../../store/authStore";

function timeAgo(value?: string | null) {
  if (!value) {
    return "just now";
  }

  const diffMs = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function NotificationBell() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const loadNotifications = async () => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    setLoading(true);
    try {
      const data = await notificationService.list(12);
      setNotifications(Array.isArray(data.notifications) ? data.notifications : []);
      setUnreadCount(Number(data.unreadCount || 0));
    } catch (err) {
      console.error("Failed to load notifications", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadNotifications();
  }, [user?.id]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current) {
        return;
      }

      if (!menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const recentNotifications = useMemo(() => notifications.slice(0, 8), [notifications]);

  const handleNotificationClick = async (notification: NotificationItem) => {
    try {
      if (!notification.is_read) {
        await notificationService.markRead(notification.id);
      }
      setNotifications((current) =>
        current.map((item) => (item.id === notification.id ? { ...item, is_read: true } : item))
      );
      setUnreadCount((current) => Math.max(0, current - (notification.is_read ? 0 : 1)));
      setOpen(false);
      if (notification.workspace_id) {
        await router.push(`/workspaces/${notification.workspace_id}`);
      }
    } catch (err) {
      console.error("Failed to open notification", err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationService.markAllRead();
      setNotifications((current) => current.map((item) => ({ ...item, is_read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error("Failed to mark notifications read", err);
    }
  };

  if (!user) {
    return null;
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((current) => !current);
          void loadNotifications();
        }}
        className="relative flex h-10 w-10 items-center justify-center rounded-full border border-border-main bg-surface text-text-main shadow-sm transition hover:border-primary/30 hover:bg-primary-fade hover:text-primary"
      >
        <Bell size={16} />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full border border-white bg-rose-600 px-1 text-[10px] font-black text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-12 z-50 w-[360px] overflow-hidden rounded-[1.25rem] border border-border-main bg-surface shadow-[0_24px_60px_rgba(15,23,42,0.22)]">
          <div className="flex items-center justify-between border-b border-border-main bg-canvas px-4 py-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text-muted">
                Notifications
              </div>
              <div className="text-sm font-semibold text-text-main">
                {unreadCount ? `${unreadCount} unread` : "All caught up"}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleMarkAllRead}
                disabled={!unreadCount}
                className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CheckCheck size={12} className="mr-1 inline" />
                Mark all read
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full border border-border-main bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-text-muted transition hover:bg-surface"
              >
                <ChevronDown size={12} className="mr-1 inline" />
                Close
              </button>
            </div>
          </div>

          <div className="max-h-[420px] overflow-y-auto p-2">
            {loading ? (
              <div className="rounded-[1rem] border border-dashed border-border-main bg-canvas px-4 py-6 text-sm text-text-muted">
                Loading notifications...
              </div>
            ) : recentNotifications.length ? (
              <div className="space-y-2">
                {recentNotifications.map((notification) => {
                  const isSupportRequest = notification.type === "support_request";
                  return (
                    <button
                      key={notification.id}
                      type="button"
                      onClick={() => handleNotificationClick(notification)}
                      className={`w-full rounded-[1rem] border px-4 py-3 text-left transition hover:border-primary/30 hover:bg-primary-fade ${
                        notification.is_read
                          ? "border-border-main bg-canvas"
                          : "border-amber-300 bg-amber-50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            {isSupportRequest ? (
                              <CircleAlert size={14} className="text-amber-700" />
                            ) : null}
                            <div className="truncate text-sm font-semibold text-text-main">
                              {notification.message}
                            </div>
                          </div>
                          <div className="mt-1 text-xs uppercase tracking-[0.14em] text-text-muted">
                            {notification.type.replace(/_/g, " ")} · {timeAgo(notification.created_at)}
                          </div>
                        </div>
                        <span
                          className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${
                            notification.is_read
                              ? "border-slate-300 bg-slate-100 text-slate-700"
                              : "border-amber-300 bg-amber-100 text-amber-800"
                          }`}
                        >
                          {notification.is_read ? "Read" : "New"}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-[1rem] border border-dashed border-border-main bg-canvas px-4 py-6 text-sm text-text-muted">
                No notifications yet.
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

