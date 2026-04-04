import { useEffect, useMemo, useState } from "react";
import { CheckCheck, Clock3, PanelRightClose, Radar, RotateCcw } from "lucide-react";
import { useRouter } from "next/router";

import { analyticsService, type OptimizationAlertItem } from "../../services/analyticsService";
import { notificationService, type NotificationItem } from "../../services/notificationService";

type InboxTab = "general" | "optimizer";

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

function formatFailureRate(value: number) {
  return `${Math.round((Number(value || 0) || 0) * 100)}%`;
}

function getAlertTone(alert: OptimizationAlertItem) {
  const failureRate = Number(alert.failureRate || 0);
  if (alert.status === "resolved") {
    return {
      border: "border-emerald-200",
      bg: "bg-emerald-50",
      label: "Resolved",
      labelTone: "text-emerald-700",
    };
  }

  if (alert.status === "acknowledged") {
    return {
      border: "border-amber-200",
      bg: "bg-amber-50",
      label: "Acknowledged",
      labelTone: "text-amber-700",
    };
  }

  if (failureRate >= 0.5) {
    return {
      border: "border-rose-200",
      bg: "bg-rose-50",
      label: "Critical",
      labelTone: "text-rose-700",
    };
  }

  return {
    border: "border-orange-200",
    bg: "bg-orange-50",
    label: "Warning",
    labelTone: "text-orange-700",
  };
}

type AlertInboxPanelProps = {
  workspaceId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onJumpToNode?: (flowId?: string | null, nodeId?: string | null) => void | Promise<void>;
};

export default function AlertInboxPanel({ workspaceId, isOpen, onClose, onJumpToNode }: AlertInboxPanelProps) {
  const router = useRouter();
  const [tab, setTab] = useState<InboxTab>("optimizer");
  const [loading, setLoading] = useState(false);
  const [generalNotifications, setGeneralNotifications] = useState<NotificationItem[]>([]);
  const [optimizerAlerts, setOptimizerAlerts] = useState<OptimizationAlertItem[]>([]);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [pendingResolveId, setPendingResolveId] = useState<string | null>(null);
  const [resolutionNote, setResolutionNote] = useState("");

  const unreadGeneralCount = useMemo(
    () => generalNotifications.filter((notification) => !notification.is_read).length,
    [generalNotifications]
  );
  const activeAlertCount = useMemo(
    () => optimizerAlerts.filter((alert) => alert.status === "triggered").length,
    [optimizerAlerts]
  );

  const loadInbox = async () => {
    if (!workspaceId) {
      setGeneralNotifications([]);
      setOptimizerAlerts([]);
      return;
    }

    setLoading(true);
    try {
      const [generalRes, alertRes] = await Promise.all([
        notificationService.list(20),
        analyticsService.getWorkspaceAlerts(workspaceId),
      ]);

      setGeneralNotifications(Array.isArray(generalRes.notifications) ? generalRes.notifications : []);
      setOptimizerAlerts(Array.isArray(alertRes?.data) ? alertRes.data : Array.isArray(alertRes) ? alertRes : []);
    } catch (error) {
      console.error("Failed to load inbox data", error);
      setGeneralNotifications([]);
      setOptimizerAlerts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      void loadInbox();
    }
  }, [isOpen, workspaceId]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const handleMarkGeneralRead = async (notification: NotificationItem) => {
    try {
      if (!notification.is_read) {
        await notificationService.markRead(notification.id);
      }
      setGeneralNotifications((current) =>
        current.map((item) => (item.id === notification.id ? { ...item, is_read: true } : item))
      );
    } catch (error) {
      console.error("Failed to mark notification as read", error);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationService.markAllRead();
      setGeneralNotifications((current) => current.map((item) => ({ ...item, is_read: true })));
    } catch (error) {
      console.error("Failed to mark notifications as read", error);
    }
  };

  const handleResolveStart = (alertId: string, existingNote?: string | null) => {
    setPendingResolveId(alertId);
    setResolutionNote(String(existingNote || "").trim());
  };

  const handleResolveCancel = () => {
    setPendingResolveId(null);
    setResolutionNote("");
  };

  const handleAlertStatus = async (
    alertId: string,
    status: "acknowledged" | "resolved",
    note?: string
  ) => {
    if (!workspaceId) {
      return;
    }

    setMarkingId(alertId);
    try {
      await analyticsService.updateAlertStatus(workspaceId, alertId, status, note);
      setOptimizerAlerts((current) =>
        current.map((alert) =>
          alert.id === alertId
            ? {
                ...alert,
                status,
                ...(status === "resolved" ? { resolutionNote: note || alert.resolutionNote || null } : {}),
              }
            : alert
        )
      );
      if (status === "resolved") {
        handleResolveCancel();
      }
    } catch (error) {
      console.error("Failed to update alert status", error);
    } finally {
      setMarkingId(null);
    }
  };

  const handleFixNow = async (alert: OptimizationAlertItem) => {
    if (onJumpToNode) {
      await onJumpToNode(alert.flowId || null, alert.nodeId || null);
      onClose();
      return;
    }

    const params = new URLSearchParams();
    if (alert.flowId) {
      params.set("flowId", alert.flowId);
    }
    if (alert.nodeId) {
      params.set("nodeId", alert.nodeId);
    }
    await router.push(`/flows${params.toString() ? `?${params.toString()}` : ""}`);
    onClose();
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[120]">
      <button
        type="button"
        aria-label="Close alert inbox backdrop"
        className="absolute inset-0 cursor-default bg-slate-950/35 backdrop-blur-[2px]"
        onClick={onClose}
      />

      <aside className="absolute right-0 top-0 flex h-full w-full max-w-[440px] flex-col overflow-hidden border-l border-border-main bg-surface shadow-[0_30px_80px_rgba(15,23,42,0.3)]">
        <div className="flex items-start justify-between gap-4 border-b border-border-main bg-canvas px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-text-muted">
              <Radar size={13} className="text-primary" />
              Alert Triage Center
            </div>
            <h3 className="mt-2 text-base font-semibold text-text-main">Notifications and optimizer alerts</h3>
            <p className="mt-1 text-xs leading-5 text-text-muted">
              Separate routine system events from critical AI failures, then acknowledge or resolve each spike.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-border-main bg-white p-2 text-text-muted transition hover:border-primary/30 hover:text-primary"
            title="Close inbox"
          >
            <PanelRightClose size={16} />
          </button>
        </div>

        <div className="border-b border-border-main bg-surface px-5 py-3">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setTab("optimizer")}
              className={`rounded-2xl border px-3 py-2 text-left transition ${
                tab === "optimizer"
                  ? "border-rose-200 bg-rose-50 text-rose-800"
                  : "border-border-main bg-canvas text-text-muted hover:border-primary/30 hover:text-primary"
              }`}
            >
              <div className="text-[10px] font-black uppercase tracking-[0.16em]">Optimizer</div>
              <div className="mt-1 text-sm font-semibold">{activeAlertCount} active spikes</div>
            </button>
            <button
              type="button"
              onClick={() => setTab("general")}
              className={`rounded-2xl border px-3 py-2 text-left transition ${
                tab === "general"
                  ? "border-primary/25 bg-primary-fade text-primary"
                  : "border-border-main bg-canvas text-text-muted hover:border-primary/30 hover:text-primary"
              }`}
            >
              <div className="text-[10px] font-black uppercase tracking-[0.16em]">General</div>
              <div className="mt-1 text-sm font-semibold">{unreadGeneralCount} unread items</div>
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {loading ? (
            <div className="flex flex-1 items-center justify-center px-6 py-10 text-sm text-text-muted">
              Scanning alerts...
            </div>
          ) : tab === "optimizer" ? (
            <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar p-4">
              {optimizerAlerts.length ? (
                <div className="space-y-3">
                  {optimizerAlerts.map((alert) => {
                    const tone = getAlertTone(alert);
                    return (
                      <div
                        key={alert.id}
                        className={`rounded-3xl border ${tone.border} ${tone.bg} p-4 shadow-sm`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className={`text-[10px] font-black uppercase tracking-[0.18em] ${tone.labelTone}`}>
                              {tone.label}
                            </div>
                            <div className="mt-1 text-sm font-semibold text-text-main">
                              {formatFailureRate(alert.failureRate)} failure rate
                            </div>
                            <div className="mt-1 text-xs text-text-muted">
                              Node {String(alert.nodeId || "").slice(0, 8)} · {String(alert.nodeType || "node").replace(/_/g, " ")}
                            </div>
                          </div>
                          <div className="rounded-full border border-white/70 bg-white/70 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-text-muted">
                            {timeAgo(alert.createdAt)}
                          </div>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-text-muted">
                          <div className="rounded-2xl border border-white/70 bg-white/80 px-3 py-2">
                            <div className="text-[9px] font-black uppercase tracking-[0.16em] text-text-muted">Attempts</div>
                            <div className="mt-1 text-sm font-semibold text-text-main">{alert.totalAttempts}</div>
                          </div>
                          <div className="rounded-2xl border border-white/70 bg-white/80 px-3 py-2">
                            <div className="text-[9px] font-black uppercase tracking-[0.16em] text-text-muted">Confidence</div>
                            <div className="mt-1 text-sm font-semibold text-text-main">
                              {typeof alert.avgConfidence === "number" ? `${Math.round(alert.avgConfidence * 100)}%` : "n/a"}
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 rounded-2xl border border-white/70 bg-white/80 p-3">
                          <div className="text-[9px] font-black uppercase tracking-[0.16em] text-text-muted">Sample Inputs</div>
                          <div className="mt-2 space-y-1.5">
                            {(alert.sampleInputs || []).slice(0, 3).map((sample, index) => (
                              <div
                                key={`${alert.id}-sample-${index}`}
                                className="rounded-xl bg-canvas px-3 py-2 text-[11px] text-text-main"
                              >
                                {sample}
                              </div>
                            ))}
                            {!alert.sampleInputs?.length ? (
                              <div className="text-[11px] text-text-muted">No sample inputs captured.</div>
                            ) : null}
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          {alert.status === "triggered" ? (
                            pendingResolveId === alert.id ? (
                              <div className="w-full space-y-2 rounded-2xl border border-rose-200 bg-white/90 p-3">
                                <div className="text-[9px] font-black uppercase tracking-[0.16em] text-rose-700">
                                  Resolution Note
                                </div>
                                <textarea
                                  value={resolutionNote}
                                  onChange={(event) => setResolutionNote(event.target.value)}
                                  rows={3}
                                  placeholder="Describe the fix you applied..."
                                  className="w-full rounded-2xl border border-border-main bg-surface px-3 py-2 text-xs text-text-main outline-none transition focus:border-primary/40"
                                />
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={handleResolveCancel}
                                    className="rounded-full border border-slate-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-700 transition hover:bg-slate-50"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleAlertStatus(alert.id, "resolved", resolutionNote.trim())}
                                    disabled={markingId === alert.id || !resolutionNote.trim()}
                                    className="rounded-full border border-emerald-600 bg-emerald-600 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    Confirm Resolve
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleAlertStatus(alert.id, "acknowledged")}
                                  disabled={markingId === alert.id}
                                  className="rounded-full border border-slate-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <CheckCheck size={12} className="mr-1 inline" />
                                  Acknowledge
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleResolveStart(alert.id, alert.resolutionNote)}
                                  className="rounded-full border border-emerald-600 bg-emerald-600 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white shadow-sm transition hover:bg-emerald-700"
                                >
                                  Resolve
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleFixNow(alert)}
                                  className="rounded-full border border-rose-600 bg-rose-600 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white shadow-sm transition hover:bg-rose-700"
                                >
                                  Fix in Optimizer
                                </button>
                              </>
                            )
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleResolveStart(alert.id, alert.resolutionNote)}
                              disabled={markingId === alert.id || alert.status === "resolved"}
                              className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <RotateCcw size={12} className="mr-1 inline" />
                              {alert.status === "acknowledged" ? "Mark Resolved" : "Resolved"}
                            </button>
                          )}
                        </div>
                        {alert.resolutionNote && alert.status === "resolved" ? (
                          <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                            <span className="text-[9px] font-black uppercase tracking-[0.16em] text-emerald-700">
                              Resolution Note
                            </span>
                            <div className="mt-1 whitespace-pre-wrap">{alert.resolutionNote}</div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex h-full items-center justify-center rounded-3xl border border-dashed border-border-main bg-canvas px-6 py-12 text-center">
                  <div>
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-700">
                      <Clock3 size={18} />
                    </div>
                    <div className="mt-4 text-sm font-semibold text-text-main">No active optimizer alerts</div>
                    <div className="mt-2 text-xs leading-5 text-text-muted">
                      The alert inbox is clear. Triggered spikes will appear here until they are acknowledged or resolved.
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar p-4">
              <div className="flex items-center justify-between rounded-3xl border border-border-main bg-canvas px-4 py-3">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.16em] text-text-muted">System Notifications</div>
                  <div className="mt-1 text-sm font-semibold text-text-main">
                    {unreadGeneralCount ? `${unreadGeneralCount} unread` : "All caught up"}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  disabled={!unreadGeneralCount}
                  className="rounded-full border border-slate-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Mark all read
                </button>
              </div>

              <div className="mt-4 space-y-2">
                {generalNotifications.length ? (
                  generalNotifications.map((notification) => (
                    <button
                      key={notification.id}
                      type="button"
                      onClick={() => handleMarkGeneralRead(notification)}
                      className={`w-full rounded-3xl border px-4 py-3 text-left transition hover:border-primary/30 hover:bg-primary-fade ${
                        notification.is_read
                          ? "border-border-main bg-surface"
                          : "border-amber-300 bg-amber-50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-text-main">{notification.message}</div>
                          <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-text-muted">
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
                  ))
                ) : (
                  <div className="rounded-3xl border border-dashed border-border-main bg-surface px-6 py-10 text-center text-sm text-text-muted">
                    No system notifications yet.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
