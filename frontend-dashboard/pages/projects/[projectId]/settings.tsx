import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";

import PageAccessNotice from "../../../components/access/PageAccessNotice";
import DashboardLayout from "../../../components/layout/DashboardLayout";
import SectionTabs from "../../../components/navigation/SectionTabs";
import { useVisibility } from "../../../hooks/useVisibility";
import { projectService, type ProjectSettings } from "../../../services/projectService";
import { useAuthStore } from "../../../store/authStore";

const EMPTY_SETTINGS_FORM: Omit<ProjectSettings, "project_id"> = {
  auto_assign: false,
  assignment_mode: "manual",
  default_agent_id: null,
  max_open_per_agent: 25,
  allow_takeover: true,
  allow_manual_reply: true,
  allow_bot_resume: false,
  show_campaign: true,
  show_flow: true,
  show_list: true,
  allowed_platforms: [],
  default_campaign_id: null,
  default_list_id: null,
};

const PLATFORM_OPTIONS = ["whatsapp", "website", "facebook", "instagram", "telegram", "api"];

export default function ProjectSettingsPage() {
  const router = useRouter();
  const { projectId } = router.query;
  const source = router.query.from === "project" ? "project" : "settings";
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);
  const activeProject = useAuthStore((state) => state.activeProject);
  const setActiveProject = useAuthStore((state) => state.setActiveProject);
  const hasWorkspacePermission = useAuthStore((state) => state.hasWorkspacePermission);
  const getProjectRole = useAuthStore((state) => state.getProjectRole);
  const { canViewPage, isPlatformOperator, isReadOnly } = useVisibility();
  const [settingsForm, setSettingsForm] = useState(EMPTY_SETTINGS_FORM);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const activeWorkspaceId = activeWorkspace?.workspace_id || "";
  const canViewProjectsPage = canViewPage("projects");
  const canManageProjects = isPlatformOperator || (activeWorkspaceId
    ? hasWorkspacePermission(activeWorkspaceId, "edit_projects")
    : false);
  const canDeleteProject = isPlatformOperator || (activeWorkspaceId
    ? hasWorkspacePermission(activeWorkspaceId, "delete_projects")
    : false);
  const selectedProjectRole = projectId ? getProjectRole(String(projectId)) : null;
  const canManageSelectedProject =
    !isReadOnly && (isPlatformOperator || canManageProjects || selectedProjectRole === "project_admin");

  const tabs = useMemo(
    () =>
      isPlatformOperator
        ? [{ label: "Project Settings", href: `/projects/${projectId}/settings?from=project` }]
        : source === "project"
        ? [
            { label: "Project Settings", href: `/projects/${projectId}/settings?from=project` },
            { label: "Members", href: "/users-access/members" },
          ]
        : [
            { label: "Workspace Settings", href: "/settings" },
            { label: "Project Settings", href: `/projects/${projectId}/settings?from=settings` },
            ...(activeWorkspace?.workspace_id
              ? [{ label: "Billing", href: `/workspaces/${activeWorkspace.workspace_id}/billing` }]
              : []),
          ],
    [activeWorkspace?.workspace_id, isPlatformOperator, projectId, source]
  );

  useEffect(() => {
    if (!projectId || !canViewProjectsPage) {
      setSettingsForm(EMPTY_SETTINGS_FORM);
      return;
    }

    setLoading(true);
    setError("");
    projectService
      .getSettings(String(projectId))
      .then((settings) => {
        setSettingsForm({
          auto_assign: settings.auto_assign,
          assignment_mode: settings.assignment_mode,
          default_agent_id: settings.default_agent_id || null,
          max_open_per_agent: settings.max_open_per_agent,
          allow_takeover: settings.allow_takeover,
          allow_manual_reply: settings.allow_manual_reply,
          allow_bot_resume: settings.allow_bot_resume,
          show_campaign: settings.show_campaign,
          show_flow: settings.show_flow,
          show_list: settings.show_list,
          allowed_platforms: Array.isArray(settings.allowed_platforms) ? settings.allowed_platforms : [],
          default_campaign_id: settings.default_campaign_id || null,
          default_list_id: settings.default_list_id || null,
        });
      })
      .catch((err: any) => {
        console.error("Failed to load project settings", err);
        setSettingsForm(EMPTY_SETTINGS_FORM);
        setError(err?.response?.data?.error || "Failed to load project settings");
      })
      .finally(() => setLoading(false));
  }, [projectId, canViewProjectsPage]);

  useEffect(() => {
    if (!router.isReady || !projectId || !canViewProjectsPage || canManageSelectedProject) {
      return;
    }
    router.replace(`/projects/${projectId}`).catch(() => undefined);
  }, [canManageSelectedProject, canViewProjectsPage, projectId, router]);

  const handleSave = async () => {
    if (!projectId) {
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");
      await projectService.updateSettings(String(projectId), settingsForm);
      setSuccess("Project settings saved.");
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to save project settings");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!projectId || !canDeleteProject) {
      return;
    }
    if (deleteConfirm.trim().toLowerCase() !== "delete my project") {
      setError('Type "delete my project" to confirm deletion.');
      return;
    }

    try {
      setDeleting(true);
      setError("");
      setSuccess("");
      await projectService.delete(String(projectId));
      if (activeProject?.id === String(projectId)) {
        setActiveProject(null);
      }
      router.replace("/projects").catch(() => undefined);
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to delete project");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <DashboardLayout>
      {!canViewProjectsPage ? (
        <PageAccessNotice
          title="Project settings are restricted for this role"
          description="Project settings are only available to users with workspace project access or assigned project roles."
          href="/projects"
          ctaLabel="Open projects"
        />
      ) : !canManageSelectedProject ? (
        <PageAccessNotice
          title="Project settings require project management access"
          description="Only workspace admins and project admins can open project settings."
          href={`/projects/${projectId}`}
          ctaLabel="Open project overview"
        />
      ) : (
        <div className="mx-auto max-w-6xl space-y-6">
          <section className="rounded-[1.25rem] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)]">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
              Settings
            </div>
            <h1 className="mt-2 text-[1.35rem] font-semibold tracking-tight text-[var(--text)]">
              Workspace and project controls
            </h1>
            <SectionTabs items={tabs} currentPath={router.asPath.split("?")[0] || ""} className="mt-4" />
          </section>

          {error ? <section className="rounded-[1.5rem] border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</section> : null}
          {success ? <section className="rounded-[1.5rem] border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{success}</section> : null}

          <section className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-3 text-sm text-[var(--text)]">
                <input type="checkbox" checked={settingsForm.auto_assign} disabled={!canManageSelectedProject || loading} onChange={(event) => setSettingsForm((current) => ({ ...current, auto_assign: event.target.checked }))} />
                <span>Auto assign conversations</span>
              </label>
              <label className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-3 text-sm text-[var(--text)]">
                <input type="checkbox" checked={settingsForm.allow_takeover} disabled={!canManageSelectedProject || loading} onChange={(event) => setSettingsForm((current) => ({ ...current, allow_takeover: event.target.checked }))} />
                <span>Allow takeover</span>
              </label>
              <label className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-3 text-sm text-[var(--text)]">
                <input type="checkbox" checked={settingsForm.allow_manual_reply} disabled={!canManageSelectedProject || loading} onChange={(event) => setSettingsForm((current) => ({ ...current, allow_manual_reply: event.target.checked }))} />
                <span>Allow manual reply</span>
              </label>
              <label className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-3 text-sm text-[var(--text)]">
                <input type="checkbox" checked={settingsForm.allow_bot_resume} disabled={!canManageSelectedProject || loading} onChange={(event) => setSettingsForm((current) => ({ ...current, allow_bot_resume: event.target.checked }))} />
                <span>Allow bot resume</span>
              </label>
              <label className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-3 text-sm text-[var(--text)]">
                <input type="checkbox" checked={settingsForm.show_campaign} disabled={!canManageSelectedProject || loading} onChange={(event) => setSettingsForm((current) => ({ ...current, show_campaign: event.target.checked }))} />
                <span>Show campaigns</span>
              </label>
              <label className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-3 text-sm text-[var(--text)]">
                <input type="checkbox" checked={settingsForm.show_flow} disabled={!canManageSelectedProject || loading} onChange={(event) => setSettingsForm((current) => ({ ...current, show_flow: event.target.checked }))} />
                <span>Show flows</span>
              </label>
            </div>

            <div className="mt-5">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                Allowed platforms
              </div>
              <div className="grid gap-2 md:grid-cols-3">
                {PLATFORM_OPTIONS.map((platform) => (
                  <label key={platform} className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-3 text-sm text-[var(--text)]">
                    <input
                      type="checkbox"
                      checked={settingsForm.allowed_platforms.includes(platform)}
                      disabled={!canManageSelectedProject || loading}
                      onChange={(event) =>
                        setSettingsForm((current) => ({
                          ...current,
                          allowed_platforms: event.target.checked
                            ? [...current.allowed_platforms, platform]
                            : current.allowed_platforms.filter((item) => item !== platform),
                        }))
                      }
                    />
                    <span>{platform}</span>
                  </label>
                ))}
              </div>
            </div>

            <button type="button" onClick={handleSave} disabled={!canManageSelectedProject || saving || loading} className="mt-5 rounded-2xl bg-slate-900 px-4 py-3 text-[11px] font-black uppercase tracking-[0.2em] text-white disabled:opacity-50">
              {saving ? "Saving..." : "Save settings"}
            </button>
          </section>

          {canDeleteProject ? (
            <section className="rounded-[1.5rem] border border-rose-300/70 bg-rose-50 p-6 shadow-sm">
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-rose-700">
                Danger Zone
              </div>
              <h2 className="mt-3 text-xl font-semibold tracking-tight text-rose-950">
                Delete this project
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-rose-900/80">
                This will permanently remove the project if no dependent campaigns, bots, flows, integrations, or conversations still exist.
              </p>
              <p className="mt-2 text-sm font-medium text-rose-900">
                Type <span className="font-black">delete my project</span> to confirm.
              </p>
              <div className="mt-4 flex flex-col gap-3 md:max-w-xl">
                <input
                  value={deleteConfirm}
                  onChange={(event) => setDeleteConfirm(event.target.value)}
                  placeholder="delete my project"
                  className="w-full rounded-2xl border border-rose-200 bg-surface px-4 py-3 text-sm text-text-main outline-none"
                />
                <button
                  type="button"
                  onClick={handleDeleteProject}
                  disabled={deleting || deleteConfirm.trim().toLowerCase() !== "delete my project"}
                  className="inline-flex items-center justify-center rounded-2xl border border-rose-400 bg-rose-600 px-4 py-3 text-[11px] font-black uppercase tracking-[0.2em] text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:border-rose-200 disabled:bg-rose-200 disabled:text-rose-500"
                >
                  {deleting ? "Deleting..." : "Delete project"}
                </button>
              </div>
            </section>
          ) : null}
        </div>
      )}
    </DashboardLayout>
  );
}
