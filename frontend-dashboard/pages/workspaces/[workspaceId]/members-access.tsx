import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";

import PageAccessNotice from "../../../components/access/PageAccessNotice";
import DashboardLayout from "../../../components/layout/DashboardLayout";
import WorkspaceConsoleTabs from "../../../components/workspace/WorkspaceConsoleTabs";
import WorkspaceStatusBanner from "../../../components/workspace/WorkspaceStatusBanner";
import { useVisibility } from "../../../hooks/useVisibility";
import { workspaceMembershipService, type WorkspaceMember } from "../../../services/workspaceMembershipService";
import { workspaceService, type Workspace } from "../../../services/workspaceService";
import { useAuthStore } from "../../../store/authStore";
import { confirmAction, notify } from "../../../store/uiStore";

export default function WorkspaceMembersAccessPage() {
  const router = useRouter();
  const { workspaceId } = router.query;
  const { canManagePermissions, canManageUsers, isPlatformOperator, isReadOnly } = useVisibility();
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const normalizedWorkspaceId = String(workspaceId || "").trim();
  const canViewPageAccess =
    isPlatformOperator ||
    (activeWorkspace?.workspace_id === normalizedWorkspaceId &&
      (canManageUsers || canManagePermissions));
  const canMutateMembers = isPlatformOperator && !isReadOnly;

  useEffect(() => {
    if (!normalizedWorkspaceId || !canViewPageAccess) {
      setWorkspace(null);
      setMembers([]);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const [workspaceRow, memberRows] = await Promise.all([
          workspaceService.get(normalizedWorkspaceId),
          workspaceMembershipService.list(normalizedWorkspaceId),
        ]);
        if (!cancelled) {
          setWorkspace(workspaceRow);
          setMembers(Array.isArray(memberRows) ? memberRows : []);
        }
      } catch (err: any) {
        if (!cancelled) {
          setWorkspace(null);
          setMembers([]);
          setError(err?.response?.data?.error || "Failed to load workspace members.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load().catch(console.error);

    return () => {
      cancelled = true;
    };
  }, [normalizedWorkspaceId, canViewPageAccess]);

  const ownerMember = useMemo(
    () => members.find((member) => member.user_id === workspace?.owner_user_id) || null,
    [members, workspace?.owner_user_id]
  );

  const handleOwnerReset = async () => {
    const ownerEmail = ownerMember?.email || ownerMember?.provisioned_user_email;
    if (!ownerEmail) {
      setError("Primary workspace owner email is not available for reset.");
      return;
    }

    const confirmed = await confirmAction(
      "Send password reset",
      `Send a password reset email to ${ownerEmail}?`,
      "Send reset"
    );
    if (!confirmed) {
      return;
    }

    try {
      await workspaceService.emergencyResetOwnerPassword(normalizedWorkspaceId);
      notify("Emergency reset sent to the workspace owner.", "success");
    } catch (err: any) {
      const message = err?.response?.data?.error || "Failed to send emergency reset.";
      setError(message);
      notify(message, "error");
    }
  };

  return (
    <DashboardLayout>
      {!canViewPageAccess ? (
        <PageAccessNotice
          title="Workspace members are restricted for this role"
          description="Workspace team visibility is available to platform operators and workspace permission managers."
          href="/workspaces"
          ctaLabel="Open workspaces"
        />
      ) : loading || !workspace ? (
        <div className="mx-auto max-w-7xl rounded-[1.5rem] border border-dashed border-[var(--line)] bg-[var(--surface)] px-5 py-8 text-sm text-[var(--muted)]">
          {error || "Loading workspace members..."}
        </div>
      ) : (
        <div className="mx-auto max-w-7xl space-y-6">
          <WorkspaceStatusBanner workspace={workspace} />
          <WorkspaceConsoleTabs workspaceId={workspace.id} activeSlug="members-access" />

          <section className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)]">
            <div className="max-w-3xl">
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
                Team & Members
              </div>
              <h1 className="mt-3 text-[1.6rem] font-semibold tracking-tight text-[var(--text)]">
                Member audit and emergency recovery
              </h1>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                Review who has access inside this workspace and trigger an emergency reset for the primary owner if they lose access.
              </p>
            </div>
          </section>

          {error ? (
            <section className="rounded-[1.5rem] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </section>
          ) : null}

          <section className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                  Emergency actions
                </div>
                <div className="mt-2 text-sm text-[var(--muted)]">
                  Primary owner: {ownerMember?.name || ownerMember?.email || workspace.owner_user_id}
                </div>
              </div>
              {isPlatformOperator ? (
                <button
                  type="button"
                  onClick={handleOwnerReset}
                  disabled={!canMutateMembers}
                  className="rounded-[1rem] border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800 transition duration-200 hover:bg-sky-100"
                >
                  Send owner password reset
                </button>
              ) : null}
            </div>
          </section>

          <section className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
              Workspace members
            </div>
            <div className="mt-4 space-y-3">
              {members.length ? (
                members.map((member) => {
                  const isOwner = member.user_id === workspace.owner_user_id;
                  return (
                    <div
                      key={member.user_id}
                      className="rounded-[1.1rem] border border-[var(--line)] bg-[var(--surface-strong)] p-4"
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="text-sm font-semibold text-[var(--text)]">
                            {member.name || member.email || member.user_id}
                          </div>
                          <div className="mt-1 text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
                            {member.role} · {member.status}
                            {isOwner ? " · primary owner" : ""}
                          </div>
                          <div className="mt-2 text-sm text-[var(--muted)]">
                            {member.email || member.provisioned_user_email || "No email available"}
                          </div>
                        </div>
                        <div className="rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                          {member.global_role || "workspace user"}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="rounded-[1rem] border border-dashed border-[var(--line)] bg-[var(--surface-strong)] px-4 py-6 text-sm text-[var(--muted)]">
                  No workspace members were returned for this workspace.
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </DashboardLayout>
  );
}
