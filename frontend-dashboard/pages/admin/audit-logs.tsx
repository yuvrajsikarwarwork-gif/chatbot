import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, History, RefreshCcw, ShieldAlert } from "lucide-react";

import DashboardLayout from "../../components/layout/DashboardLayout";
import PageAccessNotice from "../../components/access/PageAccessNotice";
import { useAuthStore } from "../../store/authStore";
import { useVisibility } from "../../hooks/useVisibility";
import { adminService, type GlobalAuditLog } from "../../services/adminService";

export default function AdminAuditLogsPage() {
  const user = useAuthStore((state) => state.user);
  const { canViewPage } = useVisibility();
  const [logs, setLogs] = useState<GlobalAuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [limit] = useState(50);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const isSuperAdmin = String(user?.role || "").trim().toLowerCase() === "super_admin";

  useEffect(() => {
    if (!isSuperAdmin) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");

    adminService
      .fetchGlobalAuditLogs(limit, offset)
      .then((result) => {
        if (cancelled) {
          return;
        }
        setLogs(result.rows || []);
        setTotal(Number(result.total || 0));
      })
      .catch((err: any) => {
        if (!cancelled) {
          setError(err?.response?.data?.error || "Failed to load audit logs");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isSuperAdmin, limit, offset]);

  const rangeLabel = useMemo(() => {
    if (!logs.length) {
      return "No events";
    }
    const start = offset + 1;
    const end = Math.min(offset + logs.length, total || offset + logs.length);
    return `${start.toLocaleString()}–${end.toLocaleString()}`;
  }, [logs.length, offset, total]);

  const pageCount = Math.max(1, Math.ceil(total / limit));
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <DashboardLayout title="Control Tower | Audit Trail">
      {!isSuperAdmin ? (
        <PageAccessNotice
          title="Audit access is restricted"
          description="Only super admin users can inspect the global governance timeline."
          href={canViewPage("workspaces") ? "/workspaces" : "/"}
          ctaLabel={canViewPage("workspaces") ? "Open workspaces" : "Open dashboard"}
        />
      ) : (
        <div className="mx-auto max-w-7xl space-y-6">
          <section className="rounded-[1.9rem] border border-border-main bg-[linear-gradient(180deg,rgba(91,33,182,0.06),rgba(255,255,255,0.98))] p-6 shadow-sm">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="max-w-2xl">
                <Link
                  href="/admin/organizations"
                  className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-text-muted transition hover:text-primary"
                >
                  <ArrowLeft size={12} />
                  Back to Control Tower
                </Link>
                <div className="mt-3 text-[10px] font-black uppercase tracking-[0.3em] text-text-muted">
                  Governance / Audit Logs
                </div>
                <h1 className="mt-2 text-[2rem] font-black tracking-[-0.04em] text-text-main">
                  Platform Audit Trail
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-text-muted">
                  Review every administrative action across the platform with explicit actor, target organization, and From → To change context.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MetricCard label="Events" value={total} icon={<History size={16} />} />
                <MetricCard label="Page" value={currentPage} icon={<ShieldAlert size={16} />} />
                <MetricCard label="Rows" value={logs.length} icon={<RefreshCcw size={16} />} />
                <MetricCard label="Range" value={rangeLabel} icon={<History size={16} />} wide />
              </div>
            </div>
          </section>

          <section className="rounded-[1.75rem] border border-border-main bg-surface shadow-sm">
            <div className="flex items-center justify-between gap-4 border-b border-border-main px-6 py-4">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.24em] text-text-muted">
                  Global governance logs
                </div>
                <div className="mt-1 text-lg font-semibold tracking-tight text-text-main">
                  {rangeLabel}
                </div>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary-fade px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-primary">
                <History size={12} />
                Read-only
              </div>
            </div>

            {loading ? (
              <div className="p-10 text-sm text-text-muted">Fetching system logs...</div>
            ) : error ? (
              <div className="p-6 text-sm text-rose-700">{error}</div>
            ) : logs.length === 0 ? (
              <div className="p-10 text-sm text-text-muted">No audit events were found.</div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left">
                    <thead className="bg-canvas text-[10px] font-black uppercase tracking-[0.22em] text-text-muted">
                      <tr>
                        <th className="px-6 py-4">Timestamp</th>
                        <th className="px-6 py-4">Actor</th>
                        <th className="px-6 py-4">Action</th>
                        <th className="px-6 py-4">Target Org</th>
                        <th className="px-6 py-4">Diff</th>
                        <th className="px-6 py-4">Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-main">
                      {logs.map((log) => (
                        <tr key={log.id} className="group hover:bg-canvas/60 align-top">
                          <td className="px-6 py-4 whitespace-nowrap text-[11px] text-text-muted">
                            {formatRelativeTime(log.created_at)}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <span className="text-xs font-bold text-text-main">{log.actor_name || "Unknown actor"}</span>
                              <span className="text-[9px] text-text-muted">{log.actor_email || "n/a"}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="inline-flex rounded-full border border-primary/20 bg-primary-fade px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-primary">
                              {String(log.action || "").replace(/_/g, " ")}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <span className="text-xs font-medium text-text-main">{log.target_org_name || "n/a"}</span>
                              <span className="mt-1 text-[10px] font-mono text-text-muted">{log.target_org_id || log.workspace_id || log.entity_id}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <AuditDiff oldData={log.old_data} newData={log.new_data} />
                          </td>
                          <td className="px-6 py-4">
                            <p className="max-w-xs text-[11px] italic text-text-muted" title={log.reason || ""}>
                              {log.reason ? `"${log.reason}"` : "No reason recorded"}
                            </p>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-main px-6 py-4">
                  <div className="text-[10px] font-black uppercase tracking-[0.22em] text-text-muted">
                    Showing {rangeLabel} of {total.toLocaleString()} events
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setOffset((current) => Math.max(0, current - limit))}
                      disabled={offset === 0}
                      className="rounded-xl border border-border-main bg-surface px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-text-main transition hover:border-primary/30 hover:bg-primary-fade disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      onClick={() => setOffset((current) => current + limit)}
                      disabled={offset + limit >= total}
                      className="rounded-xl border border-border-main bg-surface px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-text-main transition hover:border-primary/30 hover:bg-primary-fade disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </DashboardLayout>
  );
}

function MetricCard({
  label,
  value,
  icon,
  wide = false,
}: {
  label: string;
  value: number | string;
  icon: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={`rounded-[1.25rem] border border-border-main bg-white/85 px-4 py-3 shadow-sm backdrop-blur ${wide ? "sm:col-span-2" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[9px] font-black uppercase tracking-[0.22em] text-text-muted">{label}</div>
        <div className="rounded-lg border border-border-main bg-canvas p-1.5 text-text-muted">{icon}</div>
      </div>
      <div className="mt-3 text-2xl font-black tracking-tight text-text-main">
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
    </div>
  );
}

function AuditDiff({
  oldData,
  newData,
}: {
  oldData?: Record<string, any> | null;
  newData?: Record<string, any> | null;
}) {
  const oldQuotaMessages = oldData?.quota_messages;
  const newQuotaMessages = newData?.quota_messages;
  const oldQuotaTokens = oldData?.quota_ai_tokens;
  const newQuotaTokens = newData?.quota_ai_tokens;

  if (oldQuotaMessages !== undefined || newQuotaMessages !== undefined || oldQuotaTokens !== undefined || newQuotaTokens !== undefined) {
    return (
      <div className="space-y-1 font-mono text-[10px]">
        {oldQuotaMessages !== undefined || newQuotaMessages !== undefined ? (
          <div className="flex items-center gap-2">
            <span className="text-text-muted line-through">{formatValue(oldQuotaMessages)}</span>
            <span className="text-text-muted">→</span>
            <span className="font-bold text-primary">{formatValue(newQuotaMessages)}</span>
            <span className="text-text-muted">msg</span>
          </div>
        ) : null}
        {oldQuotaTokens !== undefined || newQuotaTokens !== undefined ? (
          <div className="flex items-center gap-2">
            <span className="text-text-muted line-through">{formatValue(oldQuotaTokens)}</span>
            <span className="text-text-muted">→</span>
            <span className="font-bold text-primary">{formatValue(newQuotaTokens)}</span>
            <span className="text-text-muted">tokens</span>
          </div>
        ) : null}
      </div>
    );
  }

  const oldKeys = oldData ? Object.keys(oldData) : [];
  const newKeys = newData ? Object.keys(newData) : [];
  const hasMeaningfulChange = oldKeys.length > 0 || newKeys.length > 0;

  if (!hasMeaningfulChange) {
    return <span className="text-[10px] italic text-text-muted">Metadata event</span>;
  }

  return (
    <div className="max-w-xs space-y-1 text-[10px] text-text-muted">
      <div className="font-black uppercase tracking-[0.18em] text-text-muted">Metadata updated</div>
      <div className="truncate">
        Old: {previewJson(oldData)}
      </div>
      <div className="truncate">
        New: {previewJson(newData)}
      </div>
    </div>
  );
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "n/a";
  }
  const num = Number(value);
  if (Number.isFinite(num)) {
    return num.toLocaleString();
  }
  return String(value);
}

function previewJson(value?: Record<string, any> | null) {
  if (!value) {
    return "n/a";
  }
  try {
    return JSON.stringify(value).slice(0, 120);
  } catch {
    return "unavailable";
  }
}

function formatRelativeTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "n/a";
  }
  const diffMs = Date.now() - date.getTime();
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));
  if (diffHours < 1) {
    const diffMinutes = Math.max(1, Math.round(diffMs / (1000 * 60)));
    return `${diffMinutes}m ago`;
  }
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}
