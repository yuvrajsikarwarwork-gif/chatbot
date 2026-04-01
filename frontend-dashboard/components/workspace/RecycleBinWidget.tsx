import { useEffect, useMemo, useState } from "react";
import { History, RotateCcw, Trash2 } from "lucide-react";

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

export default function RecycleBinWidget({
  items,
  onRestore,
}: {
  items: WorkspaceHistoryRow[];
  onRestore: (workspaceId: string) => void;
}) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const rows = useMemo(() => {
    return [...items]
      .filter((workspace) => workspace.deleted_at || String(workspace.status || "").toLowerCase() === "archived")
      .sort((a, b) => {
        const aTime = new Date(a.deleted_at || a.updated_at || a.created_at || 0).getTime();
        const bTime = new Date(b.deleted_at || b.updated_at || b.created_at || 0).getTime();
        return bTime - aTime;
      })
      .slice(0, 4);
  }, [items]);

  if (!rows.length) {
    return null;
  }

  return (
    <aside className="fixed bottom-6 right-6 z-40 hidden w-[360px] overflow-hidden rounded-[1.5rem] border border-border-main bg-surface shadow-[0_18px_40px_rgba(15,23,42,0.16)] xl:block">
      <div className="flex items-center justify-between border-b border-border-main bg-canvas px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
            <Trash2 size={16} />
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted">
              Recycle Bin
            </div>
            <div className="text-sm font-semibold text-text-main">
              Recently deleted / archived
            </div>
          </div>
        </div>
        <History size={16} className="text-text-muted" />
      </div>

      <div className="max-h-[420px] overflow-y-auto p-3">
        <div className="space-y-3">
          {rows.map((workspace) => {
            const isDeleted = Boolean(workspace.deleted_at);
            const countdown = formatCountdown(workspace, now);
            const canRestore = workspace.restore_available !== false && !workspace.purge_expired;
            return (
              <div key={workspace.id} className="rounded-[1rem] border border-border-main bg-canvas p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-text-main">{workspace.name}</div>
                    <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-text-muted">
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
                    <span className="rounded-full border border-border-main bg-white px-3 py-1.5 text-[11px] font-semibold text-text-muted">
                      Recreate workspace
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
