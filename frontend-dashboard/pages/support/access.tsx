import { useEffect, useMemo, useState } from "react";

import PageAccessNotice from "../../components/access/PageAccessNotice";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { useVisibility } from "../../hooks/useVisibility";
import { workspaceService, type SupportRequest } from "../../services/workspaceService";
import { useAuthStore } from "../../store/authStore";

export default function SupportAccessPage() {
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);
  const user = useAuthStore((state) => state.user);
  const { canViewPage } = useVisibility();
  const [requests, setRequests] = useState<SupportRequest[]>([]);
  const [accessRows, setAccessRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const canViewSupportPage = canViewPage("support");
  const activeWorkspaceId = activeWorkspace?.workspace_id || "";
  const isPlatformOperator = ["super_admin", "developer"].includes(String(user?.role || ""));

  const load = async () => {
    if (!activeWorkspaceId || !canViewSupportPage) {
      setRequests([]);
      setAccessRows([]);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const [requestRows, grants] = await Promise.all([
        workspaceService.listSupportRequests(activeWorkspaceId),
        workspaceService.listSupportAccess(activeWorkspaceId),
      ]);
      setRequests(Array.isArray(requestRows) ? requestRows : []);
      setAccessRows(Array.isArray(grants) ? grants : []);
    } catch (err: any) {
      console.error("Failed to load support access", err);
      setRequests([]);
      setAccessRows([]);
      setError(err?.response?.data?.error || "Failed to load support access");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load().catch(console.error);
  }, [activeWorkspaceId, canViewSupportPage]);

  const pendingRequests = useMemo(
    () => requests.filter((request) => request.status === "open"),
    [requests]
  );

  return (
    <DashboardLayout>
      {!canViewSupportPage ? (
        <PageAccessNotice
          title="Support access is restricted for this role"
          description="Temporary support access is only available to workspace operators and platform support users."
          href="/support"
          ctaLabel="Open support"
        />
      ) : (
        <div className="mx-auto max-w-7xl space-y-6">
          <section className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)]">
            <div className="max-w-3xl">
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
                Support Access
              </div>
              <h1 className="mt-3 text-[1.6rem] font-semibold tracking-tight text-[var(--text)]">
                Temporary support approvals and grants
              </h1>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                Review pending support requests, approve or deny them when allowed, and confirm which temporary support grants are still active.
              </p>
            </div>
          </section>

          {error ? (
            <section className="rounded-[1.5rem] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </section>
          ) : null}

          <div className="grid gap-4 md:grid-cols-3">
            {[
              { label: "Pending approvals", value: pendingRequests.length },
              { label: "Active grants", value: accessRows.length },
              { label: "Total requests", value: requests.length },
            ].map((card) => (
              <div
                key={card.label}
                className="rounded-[1.2rem] border border-[var(--line)] bg-[var(--surface)] px-4 py-4 shadow-sm"
              >
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                  {card.label}
                </div>
                <div className="mt-3 text-2xl font-semibold text-[var(--text)]">{card.value}</div>
              </div>
            ))}
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <section className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                Pending and recent requests
              </div>
              <div className="mt-4 space-y-3">
                {loading ? (
                  <div className="rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface-strong)] px-4 py-6 text-sm text-[var(--muted)]">
                    Loading requests...
                  </div>
                ) : requests.length ? (
                  requests.map((request) => (
                    <div
                      key={request.id}
                      className="rounded-[1.1rem] border border-[var(--line)] bg-[var(--surface-strong)] p-4"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="text-sm font-semibold text-[var(--text)]">
                            {request.requested_by_name || request.requested_by_email || request.requested_by}
                          </div>
                          <div className="mt-1 text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
                            {request.status}
                            {request.target_user_id
                              ? ` · target ${request.target_user_name || request.target_user_email || request.target_user_id}`
                              : ""}
                          </div>
                          <div className="mt-3 text-sm text-[var(--text)]">{request.reason}</div>
                        </div>
                        <div className="text-xs text-[var(--muted)]">
                          {request.created_at ? new Date(request.created_at).toLocaleString() : "Unknown"}
                        </div>
                      </div>
                      {isPlatformOperator && request.status === "open" ? (
                        <div className="mt-3 flex gap-2">
                          <button
                            type="button"
                            onClick={async () => {
                              await workspaceService.approveSupportRequest(activeWorkspaceId, request.id);
                              await load();
                            }}
                            className="rounded-xl bg-slate-900 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              await workspaceService.denySupportRequest(activeWorkspaceId, request.id);
                              await load();
                            }}
                            className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-rose-700"
                          >
                            Deny
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface-strong)] px-4 py-6 text-sm text-[var(--muted)]">
                    No support requests recorded for the active workspace.
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                Active support grants
              </div>
              <div className="mt-4 space-y-3">
                {accessRows.length ? (
                  accessRows.map((row) => (
                    <div
                      key={`${row.workspace_id}-${row.user_id}`}
                      className="rounded-[1.1rem] border border-[var(--line)] bg-[var(--surface-strong)] p-4"
                    >
                      <div className="text-sm font-semibold text-[var(--text)]">
                        {row.user_name || row.user_email || row.user_id}
                      </div>
                      <div className="mt-1 text-xs text-[var(--muted)]">
                        Granted by {row.granted_by_name || row.granted_by_email || row.granted_by || "unknown"}
                      </div>
                      <div className="mt-2 text-xs text-[var(--muted)]">
                        Expires {row.expires_at ? new Date(row.expires_at).toLocaleString() : "n/a"}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface-strong)] px-4 py-6 text-sm text-[var(--muted)]">
                    No active support grants for the current workspace.
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
