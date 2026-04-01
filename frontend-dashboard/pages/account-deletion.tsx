import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { workspaceService, type WorkspaceExportRequest } from "../services/workspaceService";
import { useAuthStore } from "../store/authStore";
import { notify } from "../store/uiStore";

function formatDate(value?: string | null) {
  if (!value) {
    return "Pending";
  }

  try {
    return new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export default function AccountDeletionPage() {
  const user = useAuthStore((state) => state.user);
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);
  const setPermissionSnapshot = useAuthStore((state) => state.setPermissionSnapshot);
  const memberships = useAuthStore((state) => state.memberships);
  const projectAccesses = useAuthStore((state) => state.projectAccesses);
  const resolvedAccess = useAuthStore((state) => state.resolvedAccess);
  const [exportRequests, setExportRequests] = useState<WorkspaceExportRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [requestingExport, setRequestingExport] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const workspaceId = String(activeWorkspace?.workspace_id || "").trim();
  const canManageRecovery = useMemo(() => {
    const role = String(activeWorkspace?.role || "").toLowerCase();
    return ["workspace_admin", "workspace_owner", "admin"].includes(role);
  }, [activeWorkspace?.role]);

  const purgeAfterLabel = formatDate(activeWorkspace?.workspace_purge_after);

  const loadExports = async () => {
    if (!workspaceId || !canManageRecovery) {
      setExportRequests([]);
      return;
    }

    setLoading(true);
    try {
      const rows = await workspaceService.listExportRequests(workspaceId);
      setExportRequests(rows);
    } catch (err: any) {
      notify(err?.response?.data?.error || "Failed to load export history.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadExports().catch(console.error);
  }, [workspaceId, canManageRecovery]);

  const handleRestore = async () => {
    if (!workspaceId) {
      return;
    }

    setRestoring(true);
    try {
      const restored = await workspaceService.selfRestore(workspaceId);
      const nextMemberships = memberships.map((membership) =>
        membership.workspace_id === workspaceId
          ? {
              ...membership,
              workspace_deleted_at: null,
              workspace_purge_after: null,
            }
          : membership
      );

      setPermissionSnapshot({
        user,
        memberships: nextMemberships,
        activeWorkspace:
          activeWorkspace
            ? {
                ...activeWorkspace,
                workspace_deleted_at: null,
                workspace_purge_after: null,
                workspace_status: restored.status,
              }
            : null,
        projectAccesses,
        resolvedAccess,
      });
      notify("Workspace restored. You can access the dashboard again.", "success");
    } catch (err: any) {
      notify(err?.response?.data?.error || "Failed to restore workspace.", "error");
    } finally {
      setRestoring(false);
    }
  };

  const handleRequestExport = async () => {
    if (!workspaceId) {
      return;
    }

    setRequestingExport(true);
    try {
      await workspaceService.requestExport(workspaceId);
      notify("Export requested. We’ll email a secure download link when it is ready.", "success");
      await loadExports();
    } catch (err: any) {
      notify(err?.response?.data?.error || "Failed to request export.", "error");
    } finally {
      setRequestingExport(false);
    }
  };

  const handleDownload = async (jobId: string) => {
    if (!workspaceId) {
      return;
    }

    try {
      const result = await workspaceService.downloadExport(workspaceId, jobId);
      const url = URL.createObjectURL(result.blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = result.fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      notify(err?.response?.data?.error || "Failed to download export.", "error");
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(15,118,110,0.22),transparent_38%),linear-gradient(180deg,#071513,#0d1f1a_48%,#f5efe6_100%)] px-4 py-12">
      <div className="mx-auto max-w-5xl space-y-6">
        <section className="overflow-hidden rounded-[2rem] border border-[rgba(255,255,255,0.14)] bg-[rgba(7,22,18,0.72)] p-8 text-white shadow-[0_30px_120px_rgba(0,0,0,0.35)] backdrop-blur-xl">
          <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-emerald-200/80">
            Account Scheduled For Deletion
          </div>
          <h1 className="mt-4 text-4xl font-black tracking-[-0.04em]">
            {activeWorkspace?.workspace_name || "Workspace"} is queued for permanent deletion.
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-emerald-50/80">
            Your account is hidden from normal product use while retention is active. You can restore access before{" "}
            <span className="font-semibold text-white">{purgeAfterLabel}</span> or request an export of your workspace data.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <div className="rounded-[1.5rem] border border-white/10 bg-surface/5 p-5">
              <div className="text-[10px] uppercase tracking-[0.22em] text-emerald-100/70">Workspace</div>
              <div className="mt-2 text-lg font-semibold">{activeWorkspace?.workspace_name || "Unknown workspace"}</div>
            </div>
            <div className="rounded-[1.5rem] border border-white/10 bg-surface/5 p-5">
              <div className="text-[10px] uppercase tracking-[0.22em] text-emerald-100/70">Deletion Scheduled</div>
              <div className="mt-2 text-lg font-semibold">{formatDate(activeWorkspace?.workspace_deleted_at)}</div>
            </div>
            <div className="rounded-[1.5rem] border border-white/10 bg-surface/5 p-5">
              <div className="text-[10px] uppercase tracking-[0.22em] text-emerald-100/70">Permanent Purge</div>
              <div className="mt-2 text-lg font-semibold">{purgeAfterLabel}</div>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            {canManageRecovery ? (
              <>
                <button
                  type="button"
                  onClick={handleRestore}
                  disabled={restoring}
                  className="rounded-[1rem] bg-surface px-5 py-3 text-sm font-semibold text-text-main transition duration-200 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {restoring ? "Restoring..." : "Restore Account"}
                </button>
                <button
                  type="button"
                  onClick={handleRequestExport}
                  disabled={requestingExport}
                  className="rounded-[1rem] border border-white/20 bg-surface/10 px-5 py-3 text-sm font-semibold text-white transition duration-200 hover:bg-surface/15 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {requestingExport ? "Queueing export..." : "Export My Data"}
                </button>
              </>
            ) : null}
            <Link
              href="/logout"
              className="rounded-[1rem] border border-white/15 px-5 py-3 text-sm font-semibold text-emerald-50/90 transition duration-200 hover:bg-surface/10"
            >
              Sign out
            </Link>
          </div>

          {!canManageRecovery ? (
            <div className="mt-5 rounded-[1.25rem] border border-amber-200/20 bg-amber-100/10 px-4 py-3 text-sm text-amber-100">
              Your role can view this status, but only a workspace admin can restore the account or request a data export.
            </div>
          ) : (
            <div className="mt-5 rounded-[1.25rem] border border-white/10 bg-black/15 px-4 py-3 text-sm text-emerald-50/80">
              Integrations were disabled when deletion was scheduled. If you restore the workspace, reconnect external channels before going live again.
            </div>
          )}
        </section>

        {canManageRecovery ? (
          <section className="rounded-[2rem] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)]">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
                  Export History
                </div>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--text)]">
                  Recovery exports and audit trail
                </h2>
              </div>
              <button
                type="button"
                onClick={() => loadExports().catch(console.error)}
                disabled={loading}
                className="rounded-[1rem] border border-[var(--line)] px-4 py-2 text-sm text-[var(--text)] transition duration-200 hover:bg-[var(--surface-strong)] disabled:opacity-60"
              >
                {loading ? "Refreshing..." : "Refresh"}
              </button>
            </div>

            <div className="mt-5 space-y-3">
              {exportRequests.length ? (
                exportRequests.map((job) => (
                  <div
                    key={job.id}
                    className="rounded-[1.25rem] border border-[var(--line)] bg-[var(--surface-strong)] p-4"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="text-sm font-semibold text-[var(--text)]">
                          {job.fileName || `Export request ${job.id.slice(0, 8)}`}
                        </div>
                        <div className="mt-1 text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
                          {job.status} • requested {formatDate(job.requestedAt)}
                          {job.completedAt ? ` • completed ${formatDate(job.completedAt)}` : ""}
                        </div>
                        <div className="mt-2 text-sm text-[var(--muted)]">
                          {job.emailedTo
                            ? `Secure download link emailed to ${job.emailedTo}`
                            : "Email will be sent when the export is ready."}
                        </div>
                      </div>
                      {job.status === "completed" ? (
                        <button
                          type="button"
                          onClick={() => handleDownload(job.id)}
                          className="rounded-[1rem] border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800 transition duration-200 hover:bg-emerald-100"
                        >
                          Download
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-[1.25rem] border border-dashed border-[var(--line)] bg-[var(--surface-strong)] px-4 py-8 text-sm text-[var(--muted)]">
                  No recovery exports have been requested yet.
                </div>
              )}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
