import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";

import PageAccessNotice from "../../components/access/PageAccessNotice";
import UsersAccessTabs from "../../components/access/UsersAccessTabs";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { useVisibility } from "../../hooks/useVisibility";
import { PROJECT_ROLE_OPTIONS } from "../../lib/accessAdmin";
import { refreshPermissionSnapshot } from "../../services/permissionSnapshotService";
import { projectService, type ProjectAccessSummary, type ProjectSummary } from "../../services/projectService";
import { useAuthStore } from "../../store/authStore";

const EMPTY_FORM = {
  userId: "",
  role: "editor",
  status: "active",
};

export default function UsersAccessProjectAccessPage() {
  const router = useRouter();
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);
  const activeProject = useAuthStore((state) => state.activeProject);
  const hasWorkspacePermission = useAuthStore((state) => state.hasWorkspacePermission);
  const getProjectRole = useAuthStore((state) => state.getProjectRole);
  const { canViewPage, isPlatformOperator, isReadOnly } = useVisibility();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [summary, setSummary] = useState<ProjectAccessSummary | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const routeProjectId = typeof router.query.projectId === "string" ? router.query.projectId : "";

  const activeWorkspaceId = activeWorkspace?.workspace_id || "";
  const canViewUsersAccessPage = canViewPage("users_access");
  const canManageUsers = activeWorkspaceId
    ? hasWorkspacePermission(activeWorkspaceId, "manage_users")
    : false;
  const selectedProjectRole = selectedProjectId ? getProjectRole(selectedProjectId) : null;
  const canViewProjectRoles =
    isPlatformOperator || canManageUsers || selectedProjectRole === "project_admin";
  const canEditProjectRoles = !isReadOnly && canViewProjectRoles;
  const canAssignProjectAdmin = !isReadOnly && (isPlatformOperator || canManageUsers);

  useEffect(() => {
    if (!activeWorkspaceId || !canViewUsersAccessPage) {
      setProjects([]);
      setSelectedProjectId("");
      return;
    }

    projectService
      .list(activeWorkspaceId)
      .then((rows) => {
        setProjects(rows);
        setSelectedProjectId((current) =>
          rows.some((project) => project.id === current)
            ? current
            : routeProjectId && rows.some((project) => project.id === routeProjectId)
            ? routeProjectId
            : activeProject?.id && rows.some((project) => project.id === activeProject.id)
            ? activeProject.id
            : rows.find((project) => project.is_default)?.id || rows[0]?.id || ""
        );
      })
      .catch((err) => {
        console.error("Failed to load projects", err);
        setProjects([]);
        setSelectedProjectId("");
      });
  }, [activeProject?.id, activeWorkspaceId, canViewUsersAccessPage, routeProjectId]);

  useEffect(() => {
    if (!selectedProjectId || !canViewProjectRoles) {
      setSummary(null);
      return;
    }

    setLoading(true);
    setError("");
    projectService
      .getAccess(selectedProjectId)
      .then((data) => setSummary(data))
      .catch((err: any) => {
        console.error("Failed to load project access", err);
        setSummary(null);
        setError(err?.response?.data?.error || "Failed to load project access");
      })
      .finally(() => setLoading(false));
  }, [canViewProjectRoles, selectedProjectId]);

  const availableMembers = useMemo(() => summary?.workspaceMembers || [], [summary]);

  const handleSave = async () => {
    if (!selectedProjectId || !form.userId || !canEditProjectRoles) {
      setError("Choose a project member first.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");
      await projectService.assignUser(selectedProjectId, form);
      await refreshPermissionSnapshot();
      setForm(EMPTY_FORM);
      setSummary(await projectService.getAccess(selectedProjectId));
      setSuccess("Project role saved.");
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to update project access");
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async (userId: string) => {
    if (!canEditProjectRoles) {
      return;
    }
    try {
      setSaving(true);
      setError("");
      setSuccess("");
      await projectService.revokeUser(selectedProjectId, userId);
      await refreshPermissionSnapshot();
      setSummary(await projectService.getAccess(selectedProjectId));
      setSuccess("Project role revoked.");
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to revoke project access");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout>
      {!canViewUsersAccessPage ? (
        <PageAccessNotice
          title="Project access is restricted for this role"
          description="Open this page through users and permissions with project or workspace access management rights."
          href="/users-access"
          ctaLabel="Open users and permissions"
        />
      ) : (
        <div className="mx-auto max-w-7xl space-y-6">
          <UsersAccessTabs activeHref="/users-access/project-access" />
          <section className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)]">
            <div className="max-w-3xl">
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
                Project Access
              </div>
              <h1 className="mt-3 text-[1.6rem] font-semibold tracking-tight text-[var(--text)]">
                Project-only delegation
              </h1>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                Keep project-level access separate from workspace membership so project admins can delegate without expanding tenant-wide control.
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
            <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
              <div className="space-y-3">
                <select
                  className="w-full rounded-2xl border border-border-main bg-surface px-4 py-3 text-sm outline-none"
                  value={selectedProjectId}
                  disabled={!canEditProjectRoles}
                  onChange={(event) => setSelectedProjectId(event.target.value)}
                >
                  <option value="">Select project</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>

                <select
                  className="w-full rounded-2xl border border-border-main bg-surface px-4 py-3 text-sm outline-none"
                  value={form.userId}
                  disabled={!canEditProjectRoles}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, userId: event.target.value }))
                  }
                >
                  <option value="">Choose workspace member</option>
                  {availableMembers.map((member) => (
                    <option key={member.user_id} value={member.user_id}>
                      {member.name || member.email || member.user_id} ({member.role})
                    </option>
                  ))}
                </select>

                <select
                  className="w-full rounded-2xl border border-border-main bg-surface px-4 py-3 text-sm outline-none"
                  value={form.role}
                  disabled={!canEditProjectRoles}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, role: event.target.value }))
                  }
                >
                  {PROJECT_ROLE_OPTIONS.filter(
                    (role) => role !== "project_admin" || canAssignProjectAdmin
                  ).map((role) => (
                    <option key={role} value={role}>
                      {role.replace("_", " ")}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  disabled={saving || !selectedProjectId || !canEditProjectRoles}
                  onClick={handleSave}
                  className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-[11px] font-black uppercase tracking-[0.2em] text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save project role"}
                </button>
              </div>

              <div className="space-y-3">
                {loading ? (
                  <div className="rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface-strong)] px-4 py-6 text-sm text-[var(--muted)]">
                    Loading project roles...
                  </div>
                ) : summary?.access?.length ? (
                  summary.access.map((row) => (
                    <div
                      key={row.id}
                      className="rounded-[1.1rem] border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-4"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <div className="text-sm font-semibold text-[var(--text)]">
                            {row.user_name || row.user_email || row.user_id}
                          </div>
                          <div className="mt-1 text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
                            {row.role} • {row.status}
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={saving || !canEditProjectRoles}
                          onClick={() => handleRevoke(row.user_id)}
                          className="rounded-xl border border-rose-200 bg-surface px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-rose-700 disabled:opacity-50"
                        >
                          Revoke
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface-strong)] px-4 py-6 text-sm text-[var(--muted)]">
                    No project role assignments exist yet for this project.
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      )}
    </DashboardLayout>
  );
}
