import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";

import PageAccessNotice from "../../../components/access/PageAccessNotice";
import DashboardLayout from "../../../components/layout/DashboardLayout";
import WorkspaceConsoleTabs from "../../../components/workspace/WorkspaceConsoleTabs";
import WorkspaceStatusBanner from "../../../components/workspace/WorkspaceStatusBanner";
import { useVisibility } from "../../../hooks/useVisibility";
import { authService } from "../../../services/authService";
import { workspaceService, type SupportRequest, type Workspace } from "../../../services/workspaceService";
import { useAuthStore } from "../../../store/authStore";
import { confirmAction, notify } from "../../../store/uiStore";

export default function WorkspaceSupportAccessPage() {
  const router = useRouter();
  const { workspaceId } = router.query;
  const { isPlatformOperator, isWorkspaceAdmin, isReadOnly } = useVisibility();
  const user = useAuthStore((state) => state.user);
  const memberships = useAuthStore((state) => state.memberships);
  const projectAccesses = useAuthStore((state) => state.projectAccesses);
  const setPermissionSnapshot = useAuthStore((state) => state.setPermissionSnapshot);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [requests, setRequests] = useState<SupportRequest[]>([]);
  const [accessRows, setAccessRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [consentNote, setConsentNote] = useState("");

  const normalizedWorkspaceId = String(workspaceId || "").trim();
  const canViewSupportTab = isPlatformOperator || isWorkspaceAdmin;
  const canMutateSupportAccess = isPlatformOperator && !isReadOnly;

  const load = async () => {
    if (!normalizedWorkspaceId || !canViewSupportTab) {
      setWorkspace(null);
      setRequests([]);
      setAccessRows([]);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const [workspaceRow, requestRows, grants] = await Promise.all([
        workspaceService.get(normalizedWorkspaceId),
        workspaceService.listSupportRequests(normalizedWorkspaceId),
        workspaceService.listSupportAccess(normalizedWorkspaceId),
      ]);
      setWorkspace(workspaceRow);
      setRequests(Array.isArray(requestRows) ? requestRows : []);
      setAccessRows(Array.isArray(grants) ? grants : []);
    } catch (err: any) {
      console.error("Failed to load workspace support access", err);
      setWorkspace(null);
      setRequests([]);
      setAccessRows([]);
      setError(err?.response?.data?.error || "Failed to load support access.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load().catch(console.error);
  }, [normalizedWorkspaceId, canViewSupportTab]);

  const pendingRequests = useMemo(
    () => requests.filter((request) => request.status === "open"),
    [requests]
  );

  const handleEnterWorkspace = async () => {
    if (!workspace) {
      return;
    }

    try {
      const session = await authService.startSupportSession({
        workspaceId: workspace.id,
        consentConfirmed,
        consentNote,
      });
      setPermissionSnapshot({
        user: session.user || user,
        memberships,
        activeWorkspace: session.activeWorkspace,
        projectAccesses,
        activeProject: null,
        resolvedAccess: session.resolvedAccess,
      });
      notify("Support session started.", "success");
      router.replace(`/workspaces/${workspace.id}`).catch(() => undefined);
    } catch (err: any) {
      const message = err?.response?.data?.error || "Failed to start support session.";
      setError(message);
      notify(message, "error");
    }
  };

  const handleApprove = async (request: SupportRequest) => {
    const confirmed = await confirmAction(
      "Approve support access",
      `Grant temporary support access for request from ${request.requested_by_name || request.requested_by_email || request.requested_by}?`,
      "Approve"
    );
    if (!confirmed) {
      return;
    }

    try {
      await workspaceService.approveSupportRequest(normalizedWorkspaceId, request.id);
      notify("Support request approved.", "success");
      await load();
    } catch (err: any) {
      const message = err?.response?.data?.error || "Failed to approve support request.";
      setError(message);
      notify(message, "error");
    }
  };

  const handleDeny = async (request: SupportRequest) => {
    const confirmed = await confirmAction(
      "Deny support access",
      `Deny support access request from ${request.requested_by_name || request.requested_by_email || request.requested_by}?`,
      "Deny"
    );
    if (!confirmed) {
      return;
    }

    try {
      await workspaceService.denySupportRequest(normalizedWorkspaceId, request.id);
      notify("Support request denied.", "success");
      await load();
    } catch (err: any) {
      const message = err?.response?.data?.error || "Failed to deny support request.";
      setError(message);
      notify(message, "error");
    }
  };

  const handleRevoke = async (row: any) => {
    const targetName = row.user_name || row.user_email || row.user_id;
    const confirmed = await confirmAction(
      "Revoke support grant",
      `Revoke active support access for ${targetName}?`,
      "Revoke"
    );
    if (!confirmed) {
      return;
    }

    try {
      await workspaceService.revokeSupportAccess(normalizedWorkspaceId, row.user_id);
      notify("Support access revoked.", "success");
      await load();
    } catch (err: any) {
      const message = err?.response?.data?.error || "Failed to revoke support access.";
      setError(message);
      notify(message, "error");
    }
  };

  return (
    <DashboardLayout>
      {!canViewSupportTab ? (
        <PageAccessNotice
          title="Support access is restricted for this role"
          description="Temporary support access is limited to platform operators."
          href="/workspaces"
          ctaLabel="Open workspaces"
        />
      ) : loading || !workspace ? (
        <div className="mx-auto max-w-7xl rounded-[1.5rem] border border-dashed border-[var(--line)] bg-[var(--surface)] px-5 py-8 text-sm text-[var(--muted)]">
          {error || "Loading support access..."}
        </div>
      ) : (
        <div className="mx-auto max-w-7xl space-y-6">
          <WorkspaceStatusBanner workspace={workspace} />
          <WorkspaceConsoleTabs workspaceId={workspace.id} activeSlug="support-access" />

          <section className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)]">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
                  Support Access
                </div>
                <h1 className="mt-3 text-[1.6rem] font-semibold tracking-tight text-[var(--text)]">
                  Temporary access, consent, and support entry
                </h1>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                  Review support requests, manage active grants, and only then step inside the workspace with a fully audited support session.
                </p>
              </div>
              {isPlatformOperator ? (
                <div className="space-y-3">
                  <label className="flex max-w-md items-start gap-3 rounded-[1rem] border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-3 text-sm text-[var(--text)]">
                    <input
                      type="checkbox"
                      checked={consentConfirmed}
                      onChange={(event) => setConsentConfirmed(event.target.checked)}
                      className="mt-1"
                    />
                    <span>
                      I confirm the client approved temporary support entry for this workspace.
                    </span>
                  </label>
                  <textarea
                    value={consentNote}
                    onChange={(event) => setConsentNote(event.target.value)}
                    rows={3}
                    placeholder="Optional consent note, ticket id, or customer approval reference"
                    className="w-full max-w-md rounded-[1rem] border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-3 text-sm text-[var(--text)]"
                  />
                  <button
                    type="button"
                    onClick={handleEnterWorkspace}
                    disabled={!consentConfirmed || !canMutateSupportAccess}
                    className="rounded-[1.05rem] border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800 transition duration-200 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Enter Workspace
                  </button>
                </div>
              ) : (
                <div className="space-y-3 rounded-[1rem] border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-4 text-sm text-[var(--text)]">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
                    Workspace admin support shortcut
                  </div>
                  <p className="text-[var(--muted)]">
                    Need help from a super admin or platform operator? Create a support request and they can approve temporary access from the platform support console.
                  </p>
                  <a
                    href="/support/new"
                    className="inline-flex items-center rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700 transition hover:bg-emerald-100"
                  >
                    Create Support Request
                  </a>
                </div>
              )}
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
                {requests.length ? (
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
                              ? ` Â· target ${request.target_user_name || request.target_user_email || request.target_user_id}`
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
                            onClick={() => handleApprove(request)}
                            disabled={!canMutateSupportAccess}
                            className="rounded-xl bg-slate-900 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeny(request)}
                            disabled={!canMutateSupportAccess}
                            className="rounded-xl border border-rose-200 bg-surface px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-rose-700"
                          >
                            Deny
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface-strong)] px-4 py-6 text-sm text-[var(--muted)]">
                    No support requests recorded for this workspace.
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
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
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
                        {isPlatformOperator ? (
                          <button
                            type="button"
                            onClick={() => handleRevoke(row)}
                            disabled={!canMutateSupportAccess}
                            className="rounded-xl border border-rose-200 bg-surface px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-rose-700"
                          >
                            Revoke
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface-strong)] px-4 py-6 text-sm text-[var(--muted)]">
                    No active support grants for this workspace.
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
