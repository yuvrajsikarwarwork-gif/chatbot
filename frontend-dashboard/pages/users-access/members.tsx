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

export default function UsersAccessMembersPage() {
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);
  const hasWorkspacePermission = useAuthStore((state) => state.hasWorkspacePermission);
  const { canViewPage } = useVisibility();
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
    if (!activeWorkspaceId) {
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
          <section className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)]">
            <div className="max-w-3xl">
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
                Members
              </div>
              <h1 className="mt-3 text-[1.6rem] font-semibold tracking-tight text-[var(--text)]">
                Workspace members and invitations
              </h1>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
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
                  className="rounded-[1.2rem] border border-[var(--line)] bg-[var(--surface)] px-4 py-4 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                      {card.label}
                    </div>
                    <Icon size={16} className="text-[var(--muted)]" />
                  </div>
                  <div className="mt-3 text-2xl font-semibold text-[var(--text)]">{card.value}</div>
                </div>
              );
            })}
          </div>

          <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
            <section className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white">
                  <Plus size={18} />
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                    Member Editor
                  </div>
                  <div className="text-lg font-semibold tracking-tight text-[var(--text)]">
                    {editingMemberId ? "Update workspace member" : "Add or invite member"}
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <input
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
                  placeholder="Existing user id"
                  value={form.userId}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, userId: event.target.value }))
                  }
                />
                <input
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
                  placeholder="Invite email"
                  value={form.email}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, email: event.target.value }))
                  }
                />
                <select
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
                  value={form.role}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, role: event.target.value }))
                  }
                >
                  {WORKSPACE_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role.replace("_", " ")}
                    </option>
                  ))}
                </select>
                <select
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
                  value={form.status}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, status: event.target.value }))
                  }
                >
                  <option value="active">active</option>
                  <option value="invited">invited</option>
                  <option value="inactive">inactive</option>
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
                    disabled={saving}
                    className="flex-1 rounded-2xl bg-slate-900 px-4 py-3 text-[11px] font-black uppercase tracking-[0.2em] text-white disabled:opacity-60"
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
                      className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-[11px] font-black uppercase tracking-[0.2em] text-[var(--text)]"
                    >
                      Cancel
                    </button>
                  ) : null}
                </div>
              </div>
            </section>

            <section className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                Workspace directory
              </div>
              <div className="mt-4 space-y-3">
                {loading ? (
                  <div className="rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface-strong)] px-4 py-6 text-sm text-[var(--muted)]">
                    Loading members...
                  </div>
                ) : members.length ? (
                  members.map((member) => (
                    <div
                      key={`${member.workspace_id}-${member.user_id}`}
                      className="rounded-[1.15rem] border border-[var(--line)] bg-[var(--surface-strong)] p-4"
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <div className="text-sm font-semibold text-[var(--text)]">
                            {member.name || member.email || member.user_id}
                          </div>
                          <div className="mt-1 text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
                            {member.role} • {member.status}
                          </div>
                          <div className="mt-2 text-sm text-[var(--muted)]">
                            {member.email || member.provisioned_user_email || member.user_id}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => handleEdit(member)}
                            className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text)]"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemove(member)}
                            className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-rose-700"
                          >
                            <span className="inline-flex items-center gap-2">
                              <Trash2 size={12} />
                              Remove
                            </span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface-strong)] px-4 py-6 text-sm text-[var(--muted)]">
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
