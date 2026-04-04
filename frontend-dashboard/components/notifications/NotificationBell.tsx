import { useEffect, useState } from "react";
import { Bell } from "lucide-react";

import AlertInboxPanel from "./AlertInboxPanel";
import { analyticsService } from "../../services/analyticsService";
import { notificationService } from "../../services/notificationService";
import { useAuthStore } from "../../store/authStore";

export default function NotificationBell() {
  const user = useAuthStore((state) => state.user);
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [alertCount, setAlertCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const loadCounts = async () => {
      if (!user) {
        setUnreadCount(0);
        setAlertCount(0);
        return;
      }

      try {
        const [general, alerts] = await Promise.all([
          notificationService.list(12),
          activeWorkspace?.workspace_id
            ? analyticsService.getWorkspaceAlerts(activeWorkspace.workspace_id, "triggered")
            : Promise.resolve({ data: [] }),
        ]);

        if (cancelled) {
          return;
        }

        setUnreadCount(Number(general.unreadCount || 0));
        const alertItems = Array.isArray(alerts?.data) ? alerts.data : Array.isArray(alerts) ? alerts : [];
        setAlertCount(alertItems.length);
      } catch (error) {
        console.error("Failed to load notification counts", error);
      }
    };

    void loadCounts();
    return () => {
      cancelled = true;
    };
  }, [user?.id, activeWorkspace?.workspace_id]);

  if (!user) {
    return null;
  }

  const badgeValue = alertCount > 0 ? alertCount : unreadCount;
  const badgeTone =
    alertCount > 0
      ? "border-white bg-rose-600 text-white"
      : unreadCount > 0
        ? "border-white bg-slate-700 text-white"
        : "";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`relative flex h-10 w-10 items-center justify-center rounded-full border shadow-sm transition ${
          alertCount > 0
            ? "border-rose-300 bg-rose-50 text-rose-700 hover:border-rose-400 hover:bg-rose-100"
            : "border-border-main bg-surface text-text-main hover:border-primary/30 hover:bg-primary-fade hover:text-primary"
        }`}
        aria-label="Open alert inbox"
      >
        <Bell size={16} />
        {badgeValue > 0 ? (
          <span
            className={`absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full border px-1 text-[10px] font-black ${badgeTone}`}
          >
            {badgeValue > 9 ? "9+" : badgeValue}
          </span>
        ) : null}
      </button>

      <AlertInboxPanel
        workspaceId={activeWorkspace?.workspace_id || null}
        isOpen={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
