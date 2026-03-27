import Link from "next/link";
import { Layers3, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import PageAccessNotice from "../components/access/PageAccessNotice";
import DashboardLayout from "../components/layout/DashboardLayout";
import WorkspaceStatusBanner from "../components/workspace/WorkspaceStatusBanner";
import { useVisibility } from "../hooks/useVisibility";
import { projectService, type ProjectSummary } from "../services/projectService";
import { useAuthStore } from "../store/authStore";

const EMPTY_PROJECT_FORM = {
  name: "",
  description: "",
  status: "active",
  isInternal: false,
  onboardingComplete: false,
};

export default function ProjectsPage() {
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);
  const activeProject = useAuthStore((state) => state.activeProject);
  const hasWorkspacePermission = useAuthStore((state) => state.hasWorkspacePermission);
  const setActiveProject = useAuthStore((state) => state.setActiveProject);
  const { canViewPage } = useVisibility();

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [createForm, setCreateForm] = useState(EMPTY_PROJECT_FORM);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const activeWorkspaceId = activeWorkspace?.workspace_id || "";
  const canViewProjectsPage = canViewPage("projects");
  const canCreateProjects = activeWorkspaceId
    ? hasWorkspacePermission(activeWorkspaceId, "create_projects")
    : false;
  const loadProjects = async () => {
    if (!activeWorkspaceId || !canViewProjectsPage) {
      setProjects([]);
      return;
    }

    setLoading(true);
    try {
      setError("");
      const rows = await projectService.list(activeWorkspaceId);
      setProjects(Array.isArray(rows) ? rows : []);
    } catch (err: any) {
      console.error("Failed to load projects", err);
      setProjects([]);
      setError(err?.response?.data?.error || "Failed to load projects");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!activeWorkspaceId || !canViewProjectsPage) {
      setProjects([]);
      return;
    }

    let cancelled = false;

    const run = async () => {
      setLoading(true);
      try {
        setError("");
        const rows = await projectService.list(activeWorkspaceId);
        if (!cancelled) {
          setProjects(Array.isArray(rows) ? rows : []);
        }
      } catch (err: any) {
        console.error("Failed to load projects", err);
        if (!cancelled) {
          setProjects([]);
          setError(err?.response?.data?.error || "Failed to load projects");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    run().catch(console.error);

    return () => {
      cancelled = true;
    };
  }, [activeWorkspaceId, canViewProjectsPage]);

  const stats = useMemo(
    () => ({
      total: projects.length,
      active: projects.filter((project) => project.status === "active").length,
      internal: projects.filter((project) => project.is_internal).length,
    }),
    [projects]
  );

  const normalizeProjectMessage = (message: string) => {
    if (!message) {
      return "";
    }

    return message.replace("Project cannot be deleted yet. Remove:", "Delete blocked. Remaining:");
  };

  const handleCreate = async () => {
    if (!activeWorkspaceId || !createForm.name.trim()) {
      setError("Workspace context and project name are required.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");
      const created = await projectService.create({
        workspaceId: activeWorkspaceId,
        name: createForm.name.trim(),
        description: createForm.description.trim() || null,
        status: createForm.status,
        isInternal: createForm.isInternal,
        onboardingComplete: createForm.onboardingComplete,
      });
      setCreateForm(EMPTY_PROJECT_FORM);
      setSuccess("Project created.");
      setActiveProject({
        id: created.id,
        workspace_id: created.workspace_id,
        name: created.name,
        status: created.status,
        is_default: created.is_default,
      });
      await loadProjects();
    } catch (err: any) {
      setError(normalizeProjectMessage(err?.response?.data?.error || "Failed to create project"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout>
      {!canViewProjectsPage ? (
        <PageAccessNotice
          title="Projects are not available for this role"
          description="Project management is reserved for workspace-level operators and assigned project editors."
          href="/"
          ctaLabel="Open dashboard"
        />
      ) : (
        <div className="mx-auto max-w-7xl space-y-6">
          <WorkspaceStatusBanner workspace={activeWorkspace} />

          <section className="rounded-[1.25rem] border border-[var(--line)] bg-[var(--surface)] px-5 py-4 shadow-[var(--shadow-soft)]">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3 text-sm text-[var(--muted)]">
                <Layers3 size={16} className="text-[var(--accent)]" />
                <span>Open each project, then switch between overview, settings, and members inside it.</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {[
                  { label: "Total", value: stats.total },
                  { label: "Active", value: stats.active },
                  { label: "Internal", value: stats.internal },
                ].map((card) => (
                  <div
                    key={card.label}
                    className={`flex min-w-[120px] items-center justify-between gap-3 rounded-[1rem] border px-3 py-2 shadow-sm ${
                      card.label === "Active"
                        ? "border-emerald-300/60 bg-emerald-100"
                        : card.label === "Internal"
                          ? "border-indigo-300/55 bg-indigo-100"
                          : "border-sky-300/55 bg-sky-100"
                    }`}
                  >
                    <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
                      {card.label}
                    </div>
                    <div
                      className={`text-lg font-semibold ${
                        card.label === "Active"
                          ? "text-emerald-700"
                          : card.label === "Internal"
                            ? "text-indigo-700"
                            : "text-sky-800"
                      }`}
                    >
                      {card.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <div className="grid gap-6 xl:grid-cols-[340px_1fr]">
            <section className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)]">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--line-strong)] bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] text-white shadow-[0_18px_30px_var(--accent-glow)]">
                  <Plus size={18} />
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                    New Project
                  </div>
                  <div className="text-lg font-semibold tracking-tight text-[var(--text)]">
                    Add a project shell
                  </div>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                <input
                  className="w-full rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] px-4 py-3 text-sm text-[var(--text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] outline-none"
                  placeholder="Project name"
                  value={createForm.name}
                  onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))}
                />
                <textarea
                  className="min-h-[96px] w-full rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] px-4 py-3 text-sm text-[var(--text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] outline-none"
                  placeholder="Description"
                  value={createForm.description}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, description: event.target.value }))
                  }
                />
                <select
                  className="w-full rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] px-4 py-3 text-sm text-[var(--text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] outline-none"
                  value={createForm.status}
                  onChange={(event) => setCreateForm((current) => ({ ...current, status: event.target.value }))}
                >
                  <option value="active">active</option>
                  <option value="inactive">inactive</option>
                </select>
                <label className="flex items-center gap-3 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] px-4 py-3 text-sm text-[var(--text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]">
                  <input
                    type="checkbox"
                    checked={createForm.isInternal}
                    onChange={(event) =>
                      setCreateForm((current) => ({ ...current, isInternal: event.target.checked }))
                    }
                  />
                  <span>Internal project</span>
                </label>
                <label className="flex items-center gap-3 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] px-4 py-3 text-sm text-[var(--text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]">
                  <input
                    type="checkbox"
                    checked={createForm.onboardingComplete}
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        onboardingComplete: event.target.checked,
                      }))
                    }
                  />
                  <span>Onboarding complete</span>
                </label>
                {error ? (
                  <div className="rounded-2xl border border-rose-300/60 bg-rose-100 px-4 py-3 text-sm font-medium text-rose-950">
                    {error}
                  </div>
                ) : null}
                {success ? (
                  <div className="rounded-2xl border border-emerald-300/35 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                    {success}
                  </div>
                ) : null}
                {canCreateProjects ? (
                  <button
                    type="button"
                    onClick={handleCreate}
                    disabled={saving || !activeWorkspaceId}
                    className="w-full rounded-2xl border border-[rgba(129,140,248,0.4)] bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] px-4 py-3 text-[11px] font-black uppercase tracking-[0.2em] text-white shadow-[0_18px_30px_var(--accent-glow)] transition duration-300 hover:-translate-y-0.5 disabled:opacity-50"
                  >
                    {saving ? "Creating..." : "Create project"}
                  </button>
                ) : (
                  <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-muted)] px-4 py-3 text-sm text-[var(--muted)]">
                    Project creation is permission-controlled for this workspace.
                  </div>
                )}
              </div>
            </section>

            <section className="space-y-4">
              {loading ? (
                <div className="rounded-[1.5rem] border border-dashed border-[var(--line)] bg-[var(--surface)] px-5 py-8 text-sm text-[var(--muted)]">
                  Loading project directory...
                </div>
              ) : projects.length ? (
                <div className="grid gap-4 md:grid-cols-2">
                  {projects.map((project) => {
                    const isActiveProject = activeProject?.id === project.id;
                    return (
                      <section
                        key={project.id}
                        className="flex h-full flex-col rounded-[1.4rem] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-base font-semibold tracking-tight text-[var(--text)]">
                              {project.name}
                            </div>
                            <div className="mt-2 min-h-[72px] text-sm leading-6 text-[var(--muted)]">
                              {project.description || "No description yet."}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center justify-end gap-2 text-[10px] font-semibold uppercase tracking-[0.16em]">
                            <span
                              className={`rounded-full border px-3 py-1 ${
                                project.status === "active"
                                  ? "border-emerald-300/60 bg-emerald-100 text-emerald-950"
                                  : "border-[var(--line)] bg-[var(--surface-strong)] text-[var(--muted)]"
                              }`}
                            >
                              {project.status}
                            </span>
                            {project.is_default ? (
                              <span className="rounded-full border border-cyan-300/35 bg-cyan-100 px-3 py-1 text-cyan-950">
                                default
                              </span>
                            ) : null}
                            {isActiveProject ? (
                              <span className="rounded-full border border-indigo-300/45 bg-indigo-100 px-3 py-1 text-indigo-950">
                                current
                              </span>
                            ) : null}
                          </div>
                        </div>

                        <div className="mt-auto pt-5">
                          <Link
                            href={`/projects/${project.id}`}
                            onClick={() =>
                              setActiveProject({
                                id: project.id,
                                workspace_id: project.workspace_id,
                                name: project.name,
                                status: project.status,
                                is_default: project.is_default,
                              })
                            }
                            className="inline-flex min-w-[190px] items-center justify-center rounded-[1.05rem] border border-[rgba(129,140,248,0.4)] bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] px-4 py-3 text-sm font-semibold !text-white shadow-[0_18px_30px_var(--accent-glow)] transition duration-200 hover:-translate-y-0.5"
                          >
                            Open Project
                          </Link>
                        </div>
                      </section>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-[1.5rem] border border-dashed border-[var(--line)] bg-[var(--surface)] px-5 py-8 text-sm text-[var(--muted)]">
                  No projects found for the active workspace yet.
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
