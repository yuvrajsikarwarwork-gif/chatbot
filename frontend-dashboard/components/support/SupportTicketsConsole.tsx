import { useCallback, useEffect, useMemo, useState } from "react";
import { ShieldCheck, Ticket, Users } from "lucide-react";

import PageAccessNotice from "../access/PageAccessNotice";
import DashboardLayout from "../layout/DashboardLayout";
import { useVisibility } from "../../hooks/useVisibility";
import { useAuthStore } from "../../store/authStore";
import { workspaceService } from "../../services/workspaceService";

export default function SupportTicketsConsole() {
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);
  const user = useAuthStore((state) => state.user);
  const { canViewPage, isPlatformOperator } = useVisibility();
  const [requests, setRequests] = useState<any[]>([]);
  const [accessRows, setAccessRows] = useState<any[]>([]);
  const [workspaceCount, setWorkspaceCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const canViewTicketsPage = canViewPage("tickets") || canViewPage("support");

  const reload = useCallback(async () => {
    if (!canViewTicketsPage) {
      setRequests([]);
      setAccessRows([]);
      setWorkspaceCount(0);
      return;
    }

    if (!isPlatformOperator && !activeWorkspace?.workspace_id) {
      setRequests([]);
      setAccessRows([]);
      setWorkspaceCount(0);
      return;
    }

    setLoading(true);
    setError("");
    try {
      if (isPlatformOperator) {
        const workspaces = await workspaceService.list();
        const workspaceRows = Array.isArray(workspaces) ? workspaces : [];
        const workspaceData = await Promise.all(
          workspaceRows.map(async (workspace: any) => {
            const [requestRows, access] = await Promise.all([
              workspaceService.listSupportRequests(workspace.id),
              workspaceService.listSupportAccess(workspace.id),
            ]);

            return {
              requests: Array.isArray(requestRows)
                ? requestRows.map((row) => ({
                    ...row,
                    workspace_id: row.workspace_id || workspace.id,
                    workspace_name: row.workspace_name || workspace.name,
                  }))
                : [],
              accessRows: Array.isArray(access)
                ? access.map((row) => ({
                    ...row,
                    workspace_id: row.workspace_id || workspace.id,
                    workspace_name: row.workspace_name || workspace.name,
                  }))
                : [],
            };
          })
        );

        setWorkspaceCount(workspaceRows.length);
        setRequests(workspaceData.flatMap((entry) => entry.requests));
        setAccessRows(workspaceData.flatMap((entry) => entry.accessRows));
      } else {
        const [requestRows, access] = await Promise.all([
          workspaceService.listSupportRequests(activeWorkspace!.workspace_id),
          workspaceService.listSupportAccess(activeWorkspace!.workspace_id),
        ]);
        setWorkspaceCount(1);
        setRequests(Array.isArray(requestRows) ? requestRows : []);
        setAccessRows(Array.isArray(access) ? access : []);
      }
    } catch (err: any) {
      console.error("Failed to load support console", err);
      setError(err?.response?.data?.error || "Failed to load support console");
      setRequests([]);
      setAccessRows([]);
      setWorkspaceCount(0);
    } finally {
      setLoading(false);
    }
  }, [activeWorkspace?.workspace_id, canViewTicketsPage, isPlatformOperator]);

  useEffect(() => {
    reload().catch(console.error);
  }, [reload]);

  const openRequests = useMemo(
    () => requests.filter((row) => row.status === "open").length,
    [requests]
  );

  return (
    <DashboardLayout>
      {!canViewTicketsPage ? (
        <PageAccessNotice
          title="Support console is restricted for this role"
          description="Support requests are only visible to workspace admins and platform operators handling temporary access."
          href="/support"
          ctaLabel="Open support"
        />
      ) : !isPlatformOperator && !activeWorkspace?.workspace_id ? (
        <div className="mx-auto max-w-4xl space-y-6">
          <section className="rounded-[1.9rem] border border-[var(--glass-border)] bg-[var(--glass-surface)] p-6 shadow-[var(--shadow-soft)] backdrop-blur-2xl">
            <h1 className="text-[1.7rem] font-black tracking-[-0.03em] text-text-main">
              Support Requests
            </h1>
            <p className="mt-2 text-sm leading-6 text-text-muted">
              Select a workspace first to review support requests and temporary access history.
            </p>
          </section>
        </div>
      ) : (
        <div className="mx-auto max-w-6xl space-y-6">
          <section className="rounded-[1.9rem] border border-[var(--glass-border)] bg-[var(--glass-surface)] p-6 shadow-[var(--shadow-soft)] backdrop-blur-2xl">
            <h1 className="text-[1.7rem] font-black tracking-[-0.03em] text-text-main">
              Support Requests
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">
              {isPlatformOperator
                ? "Review support requests, approval history, and temporary support-access grants across all workspaces."
                : "Review support requests, approval history, and temporary support-access grants for the active workspace."}
            </p>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {[
                { label: "Open requests", value: openRequests, icon: Ticket },
                { label: "Total requests", value: requests.length, icon: ShieldCheck },
                isPlatformOperator
                  ? { label: "Workspaces covered", value: workspaceCount, icon: Users }
                  : { label: "Active support grants", value: accessRows.length, icon: Users },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.label}
                    className="rounded-[1.3rem] border border-border-main bg-canvas px-4 py-4 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-primary/30 hover:bg-primary-fade"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text-muted">
                        {item.label}
                      </div>
                      <Icon size={16} className="shrink-0 text-text-muted" />
                    </div>
                    <div className="mt-3 text-2xl font-semibold text-text-main">{item.value}</div>
                  </div>
                );
              })}
            </div>
          </section>

          {error ? (
            <section className="rounded-[1.5rem] border border-rose-300/40 bg-rose-500/10 p-4 text-sm text-rose-200">
              {error}
            </section>
          ) : null}

          <section className="rounded-[1.65rem] border border-border-main bg-surface p-6 shadow-sm">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
              Request History
            </div>
            <div className="mt-4 space-y-3">
              {loading ? (
                <div className="rounded-xl border border-dashed border-border-main bg-canvas px-4 py-6 text-sm text-text-muted">
                  Loading support requests...
                </div>
              ) : requests.length ? (
                requests.map((request) => (
                  <div
                    key={request.id}
                    className="rounded-[1.2rem] border border-border-main bg-canvas p-4 shadow-sm transition duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-primary-fade"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0">
                        <div className="break-words text-sm font-semibold text-text-main">
                          {request.requested_by_name || request.requested_by_email || request.requested_by}
                        </div>
                        <div className="mt-1 break-words text-[11px] uppercase tracking-[0.16em] text-text-muted">
                          {[
                            request.status,
                            request.workspace_name,
                            request.target_user_id
                              ? `target ${request.target_user_name || request.target_user_email || request.target_user_id}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" | ")}
                        </div>
                        <div className="mt-3 break-words text-sm text-text-main">{request.reason}</div>
                        {request.resolution_notes ? (
                          <div className="mt-2 break-words text-xs text-text-muted">
                            Resolution: {request.resolution_notes}
                          </div>
                        ) : null}
                        {["super_admin", "developer"].includes(String(user?.role || "")) &&
                        request.status === "open" ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={async () => {
                                await workspaceService.approveSupportRequest(
                                  request.workspace_id || activeWorkspace!.workspace_id,
                                  request.id
                                );
                                await reload();
                              }}
                               className="rounded-xl bg-primary px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white shadow-sm transition duration-300 hover:-translate-y-0.5 hover:opacity-90"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                await workspaceService.denySupportRequest(
                                  request.workspace_id || activeWorkspace!.workspace_id,
                                  request.id
                                );
                                await reload();
                              }}
                               className="rounded-xl border border-rose-300/40 bg-rose-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-rose-700 transition duration-300 hover:-translate-y-0.5 hover:bg-rose-100"
                            >
                              Deny
                            </button>
                          </div>
                        ) : null}
                      </div>
                      <div className="shrink-0 text-xs text-text-muted">
                        {new Date(request.created_at).toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-border-main bg-canvas px-4 py-6 text-sm text-text-muted">
                  {isPlatformOperator
                    ? "No support requests across workspaces yet."
                    : "No support requests for the active workspace yet."}
                </div>
              )}
            </div>
          </section>

          <section className="rounded-[1.65rem] border border-border-main bg-surface p-6 shadow-sm">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
              Active Support Grants
            </div>
            <div className="mt-4 space-y-3">
              {accessRows.length ? (
                accessRows.map((row) => (
                  <div
                    key={`${row.workspace_id}-${row.user_id}`}
                    className="rounded-[1.2rem] border border-border-main bg-canvas p-4 shadow-sm transition duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-primary-fade"
                  >
                    <div className="break-words text-sm font-semibold text-text-main">
                      {row.user_name || row.user_email || row.user_id}
                    </div>
                    {row.workspace_name ? (
                      <div className="mt-1 break-words text-xs text-text-muted">
                        Workspace: {row.workspace_name}
                      </div>
                    ) : null}
                    <div className="mt-1 break-words text-xs text-text-muted">
                      Granted by {row.granted_by_name || row.granted_by_email || row.granted_by || "unknown"}
                    </div>
                    <div className="mt-2 text-xs text-text-muted">
                      Expires {row.expires_at ? new Date(row.expires_at).toLocaleString() : "n/a"}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-border-main bg-canvas px-4 py-6 text-sm text-text-muted">
                  {isPlatformOperator
                    ? "No active support grants across workspaces."
                    : "No active support grants for the active workspace."}
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </DashboardLayout>
  );
}
