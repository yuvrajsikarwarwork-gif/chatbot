import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, UserCog, Users } from "lucide-react";

import PageAccessNotice from "../../components/access/PageAccessNotice";
import UsersAccessTabs from "../../components/access/UsersAccessTabs";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { useVisibility } from "../../hooks/useVisibility";
import { WORKSPACE_ROLES } from "../../lib/accessAdmin";
import { refreshPermissionSnapshot } from "../../services/permissionSnapshotService";
import { workspaceMembershipService, type WorkspaceMember } from "../../services/workspaceMembershipService";
import { useAuthStore } from "../../store/authStore";
import { confirmAction } from "../../store/uiStore";

const EMPTY_FORM = {
  userId: "",
  email: "",
  role: "editor",
  status: "active",
};

const ROLE_LABELS: Record<string, string> = {
  workspace_admin: "Workspace Admin",
  workspace_owner: "Workspace Owner",
  project_admin: "Project Admin",
  super_admin: "Super Admin",
  editor: "Editor",
  agent: "Agent",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  online: "Online",
  invited: "Invited",
  inactive: "Inactive",
};

function formatRoleLabel(role: string) {
  if (!role) return "Member";
  return ROLE_LABELS[role] || role.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatStatusLabel(status: string) {
  if (!status) return "Inactive";
  return STATUS_LABELS[status] || status.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function isOnlineStatus(status: string) {
  return status === "active" || status === "online";
}

export default function UsersAccessMembersPage() {
  const currentUserId = useAuthStore((state) => state.user?.id || "");
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);
  const hasWorkspacePermission = useAuthStore((state) => state.hasWorkspacePermission);
  const { canViewPage, isReadOnly } = useVisibility();
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingMemberId, setEditingMemberId] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const activeWorkspaceId = activeWorkspace?.workspace_id || "";
  const canViewUsersAccessPage = canViewPage("users_access");
  const canManageMembers = activeWorkspaceId
    ? hasWorkspacePermission(activeWorkspaceId, "manage_users") ||
      hasWorkspacePermission(activeWorkspaceId, "manage_permissions")
    : false;
  const canEditMembers = canManageMembers && !isReadOnly;

  const loadMembers = async () => {
    if (!activeWorkspaceId || !canManageMembers) {
      setMembers([]);
      return;
    }

    setLoading(true);
    try {
      setError("");
      const rows = await workspaceMembershipService.list(activeWorkspaceId);
      setMembers(Array.isArray(rows) ? rows : []);
    } catch (err: any) {
      console.error("Failed to load workspace members", err);
      setMembers([]);
      setError(err?.response?.data?.error || "Failed to load workspace members");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMembers().catch(console.error);
  }, [activeWorkspaceId, canManageMembers]);

  const activeCounts = useMemo(
    () => ({
      total: members.length,
      active: members.filter((member) => member.status === "active").length,
      invited: members.filter((member) => member.status === "invited").length,
    }),
    [members]
  );

  const handleSave = async () => {
    if (!activeWorkspaceId || !canEditMembers) {
      setError("Select a workspace before managing members.");
      return;
    }

    if (!form.userId.trim() && !form.email.trim()) {
      setError("Enter a user id or invite email.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");
      await workspaceMembershipService.upsert(activeWorkspaceId, {
        userId: form.userId.trim() || undefined,
        email: form.email.trim() || undefined,
        role: form.role,
        status: form.status,
      });
      await refreshPermissionSnapshot();
      setForm(EMPTY_FORM);
      setEditingMemberId("");
      setSuccess(editingMemberId ? "Workspace member updated." : "Workspace member saved.");
      await loadMembers();
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to save workspace member");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (member: WorkspaceMember) => {
    if (member.user_id === currentUserId) {
      setError("You cannot remove or alter your own admin account.");
      return;
    }
    setEditingMemberId(member.user_id);
    setError("");
    setSuccess("");
    setForm({
      userId: member.user_id || "",
      email: member.email || "",
      role: member.role || "editor",
      status: member.status || "active",
    });
  };

  const handleRemove = async (member: WorkspaceMember) => {
    if (member.user_id === currentUserId) {
      setError("You cannot remove your own account from the workspace.");
      return;
    }
    if (
      !(await confirmAction(
        "Remove workspace member",
        "This will revoke workspace access for the selected member.",
        "Remove"
      ))
    ) {
      return;
    }

    try {
      setError("");
      await workspaceMembershipService.remove(activeWorkspaceId, member.user_id);
      await refreshPermissionSnapshot();
      if (editingMemberId === member.user_id) {
        setEditingMemberId("");
        setForm(EMPTY_FORM);
      }
      await loadMembers();
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to remove workspace member");
    }
  };

  return (
    <DashboardLayout>
      {!canViewUsersAccessPage ? (
        <PageAccessNotice
          title="Members are restricted for this role"
          description="Workspace member access is only available inside the users and permissions area."
          href="/users-access"
          ctaLabel="Open users and permissions"
        />
      ) : !canManageMembers ? (
        <PageAccessNotice
          title="Member management is restricted for this role"
          description="This screen requires workspace user or permission management access because member lists are now protected server-side."
          href="/users-access"
          ctaLabel="Open access hub"
        />
      ) : (
        <div className="mx-auto max-w-7xl space-y-6">
          <UsersAccessTabs activeHref="/users-access/members" />
          <section className="rounded-[1.9rem] border border-border-main bg-surface p-6 shadow-sm">
            <div className="max-w-3xl">
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted">
                Members
              </div>
              <h1 className="mt-3 text-[1.6rem] font-semibold tracking-tight text-text-main">
                Workspace members and invitations
              </h1>
              <p className="mt-2 text-sm leading-6 text-text-muted">
                Add team members, update membership state, and keep workspace roles clean without opening the full workspace admin page.
              </p>
            </div>
          </section>

          <div className="grid gap-4 md:grid-cols-3">
            {[
              { label: "Members", value: activeCounts.total, icon: Users },
              { label: "Active", value: activeCounts.active, icon: UserCog },
              { label: "Invited", value: activeCounts.invited, icon: Plus },
            ].map((card) => {
              const Icon = card.icon;
              return (
                <div
                  key={card.label}
                  className="rounded-[1.2rem] border border-border-main bg-surface px-4 py-4 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                      {card.label}
                    </div>
                    <Icon size={16} className="text-text-muted" />
                  </div>
                  <div className="mt-3 text-2xl font-semibold text-text-main">{card.value}</div>
                </div>
              );
            })}
          </div>

          <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
            <section className="rounded-[1.9rem] border border-border-main bg-surface p-6 shadow-sm">
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-white">
                  <Plus size={18} />
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                    Member Editor
                  </div>
                  <div className="text-lg font-semibold tracking-tight text-text-main">
                    {editingMemberId ? "Update workspace member" : "Add or invite member"}
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                  <input
                    className="w-full rounded-2xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    placeholder="Existing user id"
                    value={form.userId}
                    disabled={!canEditMembers}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, userId: event.target.value }))
                    }
                />
                  <input
                    className="w-full rounded-2xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    placeholder="Invite email"
                    value={form.email}
                    disabled={!canEditMembers}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, email: event.target.value }))
                    }
                />
                  <select
                    className="w-full rounded-2xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    value={form.role}
                    disabled={!canEditMembers}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, role: event.target.value }))
                    }
                >
                  {WORKSPACE_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {formatRoleLabel(role)}
                    </option>
                  ))}
                </select>
                  <select
                    className="w-full rounded-2xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    value={form.status}
                    disabled={!canEditMembers}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, status: event.target.value }))
                    }
                >
                  <option value="active">Active</option>
                  <option value="invited">Invited</option>
                  <option value="inactive">Inactive</option>
                </select>

                {error ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                ) : null}

                {success ? (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                    {success}
                  </div>
                ) : null}

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving || !canEditMembers}
                    className="flex-1 rounded-2xl bg-primary px-4 py-3 text-[11px] font-black uppercase tracking-[0.2em] text-white disabled:opacity-60"
                  >
                    {saving ? "Saving..." : editingMemberId ? "Save member" : "Add member"}
                  </button>
                  {editingMemberId ? (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingMemberId("");
                        setForm(EMPTY_FORM);
                        setError("");
                        setSuccess("");
                      }}
                      className="rounded-2xl border border-border-main bg-surface px-4 py-3 text-[11px] font-black uppercase tracking-[0.2em] text-text-main"
                    >
                      Cancel
                    </button>
                  ) : null}
                </div>
              </div>
            </section>

            <section className="rounded-[1.5rem] border border-border-main bg-surface p-6 shadow-sm">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                Workspace directory
              </div>
              <div className="mt-4 space-y-3">
                {loading ? (
                  <div className="rounded-xl border border-dashed border-border-main bg-canvas px-4 py-6 text-sm text-text-muted">
                    Loading members...
                  </div>
                ) : members.length ? (
                  members.map((member) => {
                    const isSelf = member.user_id === currentUserId;

                    return (
                      <div
                        key={`${member.workspace_id}-${member.user_id}`}
                        className="rounded-[1.15rem] border border-border-main bg-canvas p-4"
                      >
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                          <div>
                            <div className="text-sm font-semibold text-text-main">
                              {member.name || member.email || member.user_id}
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <span className="rounded-full border border-border-main bg-canvas px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                                {formatRoleLabel(member.role)}
                              </span>
                              <span
                                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${
                                  isOnlineStatus(member.status)
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                    : "border-border-main bg-canvas text-text-muted"
                                }`}
                              >
                                <span
                                  className={`h-2 w-2 rounded-full ${
                                    isOnlineStatus(member.status) ? "bg-emerald-500" : "bg-text-muted"
                                  }`}
                                />
                                {formatStatusLabel(member.status)}
                              </span>
                            </div>
                            <div className="mt-2 text-sm text-text-muted">
                              {member.email || member.provisioned_user_email || member.user_id}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {isSelf ? (
                              <span
                                className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-amber-700"
                                title="You cannot remove or alter your own admin account."
                              >
                                Self protected
                              </span>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleEdit(member)}
                                  disabled={!canEditMembers}
                                  title="You cannot remove or alter your own admin account."
                                  className="rounded-xl border border-border-main bg-surface px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-text-main disabled:opacity-50"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRemove(member)}
                                  disabled={!canEditMembers}
                                  title="You cannot remove or alter your own admin account."
                                  className="rounded-xl border border-red-500/30 bg-transparent px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-red-500 hover:bg-red-500/10 hover:border-red-500/50 disabled:opacity-50"
                                >
                                  <span className="inline-flex items-center gap-2">
                                    <Trash2 size={12} />
                                    Remove
                                  </span>
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-xl border border-dashed border-border-main bg-canvas px-4 py-6 text-sm text-text-muted">
                    No workspace members found for the active workspace.
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

