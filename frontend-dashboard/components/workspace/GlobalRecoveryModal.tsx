import { useEffect, useMemo, useState } from "react";
import { ChevronDown, RotateCcw, Trash2 } from "lucide-react";

import type { WorkspaceHistoryRow } from "../../services/workspaceService";

function formatCountdown(row: WorkspaceHistoryRow, now: number) {
  if (row.purge_expired) {
    return "Retention expired";
  }

  if (typeof row.purge_days_remaining === "number") {
    const days = Math.max(0, Math.ceil(row.purge_days_remaining));
    return `${days} day${days === 1 ? "" : "s"} remaining`;
  }

  if (!row.purge_after) {
    return row.deleted_at ? "Archived" : "Recently deleted";
  }

  const expiry = new Date(row.purge_after).getTime();
  const diffMs = Math.max(0, expiry - now);
  const totalMinutes = Math.ceil(diffMs / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return `${days}d ${hours}h left`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m left`;
  }
  return `${Math.max(1, minutes)}m left`;
}

export default function GlobalRecoveryModal({
  open,
  items,
  onClose,
  onRestore,
}: {
  open: boolean;
  items: WorkspaceHistoryRow[];
  onClose: () => void;
  onRestore: (workspaceId: string) => void;
}) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!open) {
      return;
    }

    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [open]);

  const rows = useMemo(() => {
    return [...items]
      .filter((workspace) => workspace.deleted_at || String(workspace.status || "").toLowerCase() === "archived")
      .sort((a, b) => {
        const aTime = new Date(a.deleted_at || a.updated_at || a.created_at || 0).getTime();
        const bTime = new Date(b.deleted_at || b.updated_at || b.created_at || 0).getTime();
        return bTime - aTime;
      })
      .slice(0, 12);
  }, [items]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Recently deleted and archived workspaces"
        className="w-full max-w-3xl overflow-hidden rounded-[1.5rem] border border-border-main bg-surface shadow-[0_28px_80px_rgba(15,23,42,0.28)]"
      >
        <div className="flex items-center justify-between border-b border-border-main bg-canvas px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-100 text-rose-700">
              <Trash2 size={18} />
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted">
                Recovery
              </div>
              <div className="text-base font-semibold text-text-main">
                Recently deleted / archived
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-100 px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-slate-700 transition hover:bg-slate-200"
          >
            <ChevronDown size={14} />
            Close
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-5">
          <div className="space-y-3">
            {rows.length ? (
              rows.map((workspace) => {
                const isDeleted = Boolean(workspace.deleted_at);
                const countdown = formatCountdown(workspace, now);
                const canRestore = workspace.restore_available !== false && !workspace.purge_expired;
                return (
                  <div key={workspace.id} className="rounded-[1rem] border border-border-main bg-canvas p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-text-main">{workspace.name}</div>
                        <div className="mt-1 text-xs text-text-muted">
                          {isDeleted ? "Deleted" : "Archived"} • {countdown}
                        </div>
                      </div>
                      <span
                        className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${
                          workspace.purge_expired
                            ? "border-slate-300 bg-slate-100 text-slate-700"
                            : isDeleted
                              ? "border-rose-300 bg-rose-100 text-rose-700"
                              : "border-amber-300 bg-amber-100 text-amber-800"
                        }`}
                      >
                        {workspace.purge_expired ? "Expired" : isDeleted ? "Deleted" : "Archived"}
                      </span>
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div className="text-xs text-text-muted">
                        {workspace.purge_after
                          ? `Purge at ${new Date(workspace.purge_after).toLocaleDateString()}`
                          : "No purge scheduled"}
                      </div>
                      {canRestore ? (
                        <button
                          type="button"
                          onClick={() => onRestore(workspace.id)}
                          className="inline-flex items-center gap-2 rounded-full border border-primary bg-primary px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-white shadow-sm transition hover:opacity-95"
                        >
                          <RotateCcw size={12} />
                          {isDeleted ? "Restore" : "Unarchive"}
                        </button>
                      ) : (
                        <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1.5 text-[11px] font-semibold text-slate-600">
                          Recreate workspace
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="rounded-[1rem] border border-dashed border-border-main bg-canvas px-4 py-6 text-sm text-text-muted">
                No archived or deleted workspaces yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
