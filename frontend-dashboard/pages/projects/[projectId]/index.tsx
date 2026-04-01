import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";

import PageAccessNotice from "../../../components/access/PageAccessNotice";
import DashboardLayout from "../../../components/layout/DashboardLayout";
import SectionTabs from "../../../components/navigation/SectionTabs";
import { useVisibility } from "../../../hooks/useVisibility";
import { projectService } from "../../../services/projectService";
import { useAuthStore } from "../../../store/authStore";

export default function ProjectOverviewPage() {
  const router = useRouter();
  const { projectId } = router.query;
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);
  const hasWorkspacePermission = useAuthStore((state) => state.hasWorkspacePermission);
  const getProjectRole = useAuthStore((state) => state.getProjectRole);
  const { canViewPage, isReadOnly } = useVisibility();
  const [project, setProject] = useState<any>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    status: "active",
    isInternal: false,
    onboardingComplete: false,
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const activeWorkspaceId = activeWorkspace?.workspace_id || "";
  const canViewProjectsPage = canViewPage("projects");
  const canManageProjects = activeWorkspaceId
    ? hasWorkspacePermission(activeWorkspaceId, "edit_projects")
    : false;
  const selectedProjectRole = project?.id ? getProjectRole(project.id) : null;
  const canManageSelectedProject =
    !isReadOnly && (canManageProjects || selectedProjectRole === "project_admin");

  const tabs = useMemo(
    () => [
      { label: "Overview", href: `/projects/${projectId}` },
      { label: "Settings", href: `/projects/${projectId}/settings?from=project` },
      { label: "Members", href: "/users-access/members" },
    ],
    [projectId]
  );
  const projectTabs = canManageSelectedProject
    ? tabs
    : tabs.filter((tab) => tab.label === "Overview");

  useEffect(() => {
    if (!projectId || !canViewProjectsPage) {
      setProject(null);
      return;
    }

    setLoading(true);
    setError("");
    projectService
      .get(String(projectId))
      .then((row) => {
        setProject(row);
        setForm({
          name: row.name || "",
          description: row.description || "",
          status: row.status || "active",
          isInternal: Boolean(row.is_internal),
          onboardingComplete: Boolean(row.onboarding_complete),
        });
      })
      .catch((err: any) => {
        console.error("Failed to load project", err);
        setProject(null);
        setError(err?.response?.data?.error || "Failed to load project");
      })
      .finally(() => setLoading(false));
  }, [projectId, canViewProjectsPage]);

  const handleSave = async () => {
    if (!projectId) {
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");
      const saved = await projectService.update(String(projectId), {
        name: form.name,
        description: form.description || null,
        status: form.status,
        isInternal: form.isInternal,
        onboardingComplete: form.onboardingComplete,
      });
      setProject(saved);
      setSuccess("Project overview updated.");
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to save project");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout>
      {!canViewProjectsPage ? (
        <PageAccessNotice
          title="Project details are restricted for this role"
          description="Project details are only available to users with workspace project access or assigned project roles."
          href="/projects"
          ctaLabel="Open projects"
        />
      ) : (
        <div className="mx-auto max-w-7xl space-y-6">
          <section className="rounded-[1.75rem] border border-border-main bg-surface p-6 shadow-sm">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted">
                  Project Overview
                </div>
                <h1 className="mt-3 text-[1.6rem] font-semibold tracking-tight text-text-main">
                  {project?.name || "Project"}
                </h1>
                <p className="mt-2 text-sm leading-6 text-text-muted">
                  Use this page for project identity and high-level status. Operational rules and membership live on dedicated child pages.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-3">
                <SectionTabs items={projectTabs} currentPath={router.asPath.split("?")[0] || ""} />
              </div>
            </div>
          </section>

          {error ? <section className="rounded-[1.5rem] border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</section> : null}
          {success ? <section className="rounded-[1.5rem] border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{success}</section> : null}

          <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
            <section className="rounded-[1.5rem] border border-border-main bg-surface p-6 shadow-sm">
              <div className="space-y-4">
                <input className="w-full rounded-2xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main outline-none focus:border-primary focus:ring-1 focus:ring-primary" value={form.name} disabled={!canManageSelectedProject || loading} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
                <textarea className="min-h-[120px] w-full rounded-2xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main outline-none focus:border-primary focus:ring-1 focus:ring-primary" value={form.description} disabled={!canManageSelectedProject || loading} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
                <select className="w-full rounded-2xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main outline-none focus:border-primary focus:ring-1 focus:ring-primary" value={form.status} disabled={!canManageSelectedProject || loading} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}>
                  <option value="active">active</option>
                  <option value="paused">paused</option>
                  <option value="archived">archived</option>
                </select>
                <label className="flex items-center gap-2 rounded-xl border border-border-main bg-canvas px-3 py-3 text-sm text-text-main">
                  <input type="checkbox" checked={form.isInternal} disabled={!canManageSelectedProject || loading} onChange={(event) => setForm((current) => ({ ...current, isInternal: event.target.checked }))} />
                  <span>Internal project</span>
                </label>
                <label className="flex items-center gap-2 rounded-xl border border-border-main bg-canvas px-3 py-3 text-sm text-text-main">
                  <input type="checkbox" checked={form.onboardingComplete} disabled={!canManageSelectedProject || loading} onChange={(event) => setForm((current) => ({ ...current, onboardingComplete: event.target.checked }))} />
                  <span>Onboarding complete</span>
                </label>
                <button type="button" onClick={handleSave} disabled={!canManageSelectedProject || saving || loading} className="rounded-2xl bg-primary px-4 py-3 text-[11px] font-black uppercase tracking-[0.2em] text-white disabled:opacity-50">
                  {saving ? "Saving..." : "Save project"}
                </button>
              </div>
            </section>

            <section className="space-y-6">
              <div className="grid gap-4 md:grid-cols-3">
                {[
                  { label: "Status", value: project?.status || "unknown" },
                  { label: "Internal", value: project?.is_internal ? "Yes" : "No" },
                  { label: "Onboarding", value: project?.onboarding_complete ? "Complete" : "In progress" },
                ].map((card) => (
                  <div
                    key={card.label}
                    className={`rounded-[1.2rem] border px-4 py-4 shadow-sm ${
                      card.label === "Status" && String(card.value).toLowerCase() === "active"
                        ? "border-emerald-300/60 bg-emerald-100"
                        : card.label === "Status" && String(card.value).toLowerCase() !== "active"
                          ? "border-rose-300/60 bg-rose-100"
                          : card.label === "Internal" && card.value === "Yes"
                            ? "border-indigo-300/60 bg-indigo-100"
                            : card.label === "Onboarding" && card.value === "Complete"
                              ? "border-cyan-300/60 bg-cyan-100"
                              : "border-border-main bg-surface"
                    }`}
                  >
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">{card.label}</div>
                    <div
                      className={`mt-3 text-xl font-semibold ${
                        card.label === "Status" && String(card.value).toLowerCase() === "active"
                          ? "text-emerald-700"
                          : card.label === "Status" && String(card.value).toLowerCase() !== "active"
                            ? "text-rose-700"
                          : card.label === "Internal" && card.value === "Yes"
                            ? "text-indigo-700"
                            : card.label === "Onboarding" && card.value === "Complete"
                              ? "text-cyan-700"
                              : "text-text-main"
                      }`}
                    >
                      {card.value}
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-[1.5rem] border border-border-main bg-surface p-6 shadow-sm">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                  Project path
                </div>
                {canManageSelectedProject ? (
                  <div className="mt-4 flex flex-wrap gap-3">
                    <Link href={`/projects/${projectId}/settings?from=project`} className="inline-flex min-w-[220px] items-center justify-center rounded-[1.1rem] border border-emerald-300 bg-emerald-50 px-4 py-4 text-sm font-medium text-emerald-700">Open project settings</Link>
                    <Link href="/users-access/members" className="inline-flex min-w-[220px] items-center justify-center rounded-[1.1rem] border border-rose-300 bg-rose-50 px-4 py-4 text-sm font-medium text-rose-700">Open project members</Link>
                  </div>
                ) : (
                  <div className="mt-4 rounded-[1.1rem] border border-dashed border-border-main bg-canvas px-4 py-4 text-sm text-text-muted">
                    Project settings and membership are reserved for workspace admins and project admins.
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


