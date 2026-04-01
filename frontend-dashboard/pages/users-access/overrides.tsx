import { useEffect, useMemo, useState } from "react";

import PageAccessNotice from "../../components/access/PageAccessNotice";
import UsersAccessTabs from "../../components/access/UsersAccessTabs";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { useVisibility } from "../../hooks/useVisibility";
import { PERMISSION_OPTIONS, WORKSPACE_ROLES, canonicalWorkspaceRole } from "../../lib/accessAdmin";
import { permissionService } from "../../services/permissionService";
import { refreshPermissionSnapshot } from "../../services/permissionSnapshotService";
import { workspaceMembershipService, type WorkspaceMember } from "../../services/workspaceMembershipService";
import { useAuthStore } from "../../store/authStore";

export default function UsersAccessOverridesPage() {
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);
  const hasWorkspacePermission = useAuthStore((state) => state.hasWorkspacePermission);
  const { canViewPage, isReadOnly } = useVisibility();
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [roleMatrices, setRoleMatrices] = useState<Record<string, Record<string, boolean>>>({});
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [memberPermissions, setMemberPermissions] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const activeWorkspaceId = activeWorkspace?.workspace_id || "";
  const canViewUsersAccessPage = canViewPage("users_access");
  const canManagePermissions = activeWorkspaceId
    ? hasWorkspacePermission(activeWorkspaceId, "manage_permissions")
    : false;
  const canEditPermissionOverrides = canManagePermissions && !isReadOnly;

  useEffect(() => {
    if (!activeWorkspaceId || !canManagePermissions) {
      setMembers([]);
      setRoleMatrices({});
      return;
    }

    setLoading(true);
    setError("");
    Promise.all([
      workspaceMembershipService.list(activeWorkspaceId),
      Promise.all(
        WORKSPACE_ROLES.map(async (role) => {
          const data = await permissionService.getRole(role, activeWorkspaceId);
          return [role, data.permissions || {}] as const;
        })
      ),
    ])
      .then(([memberRows, roleRows]) => {
        setMembers(memberRows);
        setRoleMatrices(Object.fromEntries(roleRows));
        setSelectedMemberId((current) =>
          memberRows.some((member) => member.user_id === current)
            ? current
            : memberRows[0]?.user_id || ""
        );
      })
      .catch((err: any) => {
        console.error("Failed to load permission overrides", err);
        setMembers([]);
        setRoleMatrices({});
        setError(err?.response?.data?.error || "Failed to load permission overrides");
      })
      .finally(() => setLoading(false));
  }, [activeWorkspaceId, canManagePermissions]);

  const selectedMember = useMemo(
    () => members.find((member) => member.user_id === selectedMemberId) || null,
    [members, selectedMemberId]
  );

  useEffect(() => {
    if (!selectedMember) {
      setMemberPermissions({});
      return;
    }

    setMemberPermissions(
      Object.fromEntries(
        PERMISSION_OPTIONS.map((option) => [
          option.key,
          Boolean(selectedMember.effective_permissions?.[option.key]),
        ])
      )
    );
  }, [selectedMember]);

  const baselineRole = selectedMember ? canonicalWorkspaceRole(selectedMember.role) : "viewer";
  const baselineMatrix = roleMatrices[baselineRole] || {};

  const handleSave = async () => {
    if (!activeWorkspaceId || !selectedMember || !canEditPermissionOverrides) {
      return;
    }

    const permissionOverrides = Object.fromEntries(
      PERMISSION_OPTIONS.flatMap((option) => {
        const desired = Boolean(memberPermissions[option.key]);
        const roleDefault = Boolean(baselineMatrix[option.key]);
        return desired === roleDefault ? [] : [[option.key, desired] as const];
      })
    );

    try {
      setSaving(true);
      setError("");
      setSuccess("");
      await permissionService.updateUser(activeWorkspaceId, selectedMember.user_id, permissionOverrides);
      await refreshPermissionSnapshot();
      const rows = await workspaceMembershipService.list(activeWorkspaceId);
      setMembers(rows);
      setSuccess("Permission overrides updated.");
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to update permission overrides");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout>
      {!canViewUsersAccessPage ? (
        <PageAccessNotice
          title="Permission overrides are restricted for this role"
          description="Open this area through users and permissions with workspace permission management access."
          href="/users-access"
          ctaLabel="Open users and permissions"
        />
      ) : !canManagePermissions ? (
        <PageAccessNotice
          title="Permission overrides require additional access"
          description="This page requires `manage_permissions` because it writes per-user exceptions on top of workspace role baselines."
          href="/users-access"
          ctaLabel="Open access hub"
        />
      ) : (
        <div className="mx-auto max-w-7xl space-y-6">
          <UsersAccessTabs activeHref="/users-access/overrides" />
          <section className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)]">
            <div className="max-w-3xl">
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
                Overrides
              </div>
              <h1 className="mt-3 text-[1.6rem] font-semibold tracking-tight text-[var(--text)]">
                Per-member permission differences
              </h1>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                These switches save only the differences from the selected member&apos;s workspace role baseline.
              </p>
            </div>
          </section>

          {error ? (
            <section className="rounded-[1.5rem] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </section>
          ) : null}

          {success ? (
            <section className="rounded-[1.5rem] border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
              {success}
            </section>
          ) : null}

          <section className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
            <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                  Workspace member
                </label>
                <select
                  className="w-full rounded-2xl border border-border-main bg-surface px-4 py-3 text-sm outline-none"
                  value={selectedMemberId}
                  onChange={(event) => setSelectedMemberId(event.target.value)}
                >
                  <option value="">Select member</option>
                  {members.map((member) => (
                    <option key={member.user_id} value={member.user_id}>
                      {member.name || member.email || member.user_id}
                    </option>
                  ))}
                </select>
                <div className="mt-3 text-sm text-[var(--muted)]">
                  Baseline role: <span className="font-semibold text-[var(--text)]">{baselineRole.replace("_", " ")}</span>
                </div>
              </div>

              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {PERMISSION_OPTIONS.map((option) => (
                  <label
                    key={option.key}
                    className="flex items-center gap-3 rounded-xl border border-border-main bg-surface px-3 py-2 text-sm text-text-muted"
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(memberPermissions[option.key])}
                      disabled={!selectedMember || loading || !canEditPermissionOverrides}
                      onChange={(event) =>
                        setMemberPermissions((current) => ({
                          ...current,
                          [option.key]: event.target.checked,
                        }))
                      }
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <button
              type="button"
              disabled={!selectedMember || saving || !canEditPermissionOverrides}
              onClick={handleSave}
              className="mt-5 rounded-2xl bg-slate-900 px-4 py-3 text-[11px] font-black uppercase tracking-[0.2em] text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving overrides..." : "Save permission overrides"}
            </button>
          </section>
        </div>
      )}
    </DashboardLayout>
  );
}
