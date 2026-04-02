import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { Plus } from "lucide-react";

import PageAccessNotice from "../access/PageAccessNotice";
import FormHelpHint from "../forms/FormHelpHint";
import DashboardLayout from "../layout/DashboardLayout";
import BackButtonStrip from "../navigation/BackButtonStrip";
import { useVisibility } from "../../hooks/useVisibility";
import { campaignService } from "../../services/campaignService";
import { flowService } from "../../services/flowService";
import { botService } from "../../services/botService";
import { projectService, type ProjectSummary } from "../../services/projectService";
import { useAuthStore } from "../../store/authStore";

export default function CampaignCreateConsole() {
  const router = useRouter();
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);
  const activeProject = useAuthStore((state) => state.activeProject);
  const setActiveProject = useAuthStore((state) => state.setActiveProject);
  const hasWorkspacePermission = useAuthStore((state) => state.hasWorkspacePermission);
  const getProjectRole = useAuthStore((state) => state.getProjectRole);
  const { canViewPage } = useVisibility();

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [allFlows, setAllFlows] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    description: "",
    projectId: "",
    status: "draft",
    startDate: "",
    endDate: "",
    defaultFlowId: "",
    allowMultiplePlatforms: true,
    autoAssignAgent: false,
    allowRestart: true,
    trackLeads: true,
  });

  const activeWorkspaceId = activeWorkspace?.workspace_id || "";
  const canCreateCampaign = hasWorkspacePermission(activeWorkspaceId, "can_create_campaign");
  const projectRole = getProjectRole(activeProject?.id || form.projectId);
  const canViewCampaignsPage = canViewPage("campaigns");
  const canCreateProjectCampaign =
    canCreateCampaign || projectRole === "project_admin" || projectRole === "editor";

  useEffect(() => {
    if (!activeWorkspaceId) {
      setProjects([]);
      setAllFlows([]);
      return;
    }

    projectService
      .list(activeWorkspaceId)
      .then((rows) => {
        setProjects(rows);
        const nextProjectId =
          rows.find((project) => project.id === form.projectId)?.id ||
          activeProject?.id ||
          rows.find((project) => project.is_default)?.id ||
          rows[0]?.id ||
          "";
        setForm((prev) => ({ ...prev, projectId: nextProjectId }));
      })
      .catch(console.error);
  }, [activeWorkspaceId, activeProject?.id, form.projectId]);

  useEffect(() => {
    if (!activeWorkspaceId || !form.projectId) {
      setAllFlows([]);
      return;
    }

    botService
      .getBots({
        workspaceId: activeWorkspaceId,
        projectId: form.projectId,
      })
      .then(async (bots) => {
        const flowLists = await Promise.all(
          bots.map((bot: any) =>
            flowService
              .getFlowSummaries(bot.id)
              .then((flows) =>
                flows.map((flow: any) => ({
                  ...flow,
                  __botName: bot.name,
                }))
              )
              .catch(() => [])
          )
        );
        setAllFlows(flowLists.flat());
      })
      .catch((err) => {
        console.error("Failed to load project flows", err);
        setAllFlows([]);
      });
  }, [activeWorkspaceId, form.projectId]);

  const handleCreate = async () => {
    if (!canCreateProjectCampaign) {
      setError("You do not have access to create campaigns in this project.");
      return;
    }
    if (!form.name.trim() || !activeWorkspaceId || !form.projectId) {
      setError("Campaign name and project are required");
      return;
    }

    try {
      setError("");
      const created = await campaignService.create({
        ...form,
        workspaceId: activeWorkspaceId,
        projectId: form.projectId,
        defaultFlowId: form.defaultFlowId || undefined,
      });
      router.push(`/campaigns/${created.id}`);
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to create campaign");
    }
  };

  const selectedProject =
    projects.find((project) => project.id === form.projectId) || null;

  const flowNameCounts = useMemo(() => {
    const counts = new Map<string, number>();
    allFlows.forEach((flow) => {
      const label = flow.flow_name || flow.name || "Untitled flow";
      counts.set(label, (counts.get(label) || 0) + 1);
    });
    return counts;
  }, [allFlows]);

  const flowOptions = useMemo(() => {
    const seen = new Map<string, any>();

    allFlows.forEach((flow) => {
      if (!seen.has(flow.id)) {
        seen.set(flow.id, flow);
      }
    });

    return Array.from(seen.values()).map((flow) => {
      const baseLabel = flow.flow_name || flow.name || "Untitled flow";
      const duplicate = (flowNameCounts.get(baseLabel) || 0) > 1;

      return {
        id: flow.id,
        label: duplicate && flow.__botName ? `${baseLabel} - ${flow.__botName}` : baseLabel,
      };
    });
  }, [allFlows, flowNameCounts]);

  if (!canViewCampaignsPage) {
    return (
      <DashboardLayout>
        <PageAccessNotice
          title="Campaign creation is restricted for this role"
          description="Campaign creation stays inside workspace and project scope. Editors and project admins can create campaigns when their scoped access allows it."
          href="/campaigns"
          ctaLabel="Back to campaigns"
        />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-4xl space-y-6">
        <BackButtonStrip href="/campaigns" label="Back to campaigns" />
        <section className="rounded-[2rem] border border-border-main bg-surface p-8 shadow-sm">
          <h1 className="text-[1.6rem] font-semibold tracking-tight text-text-main">
            Create campaign
          </h1>
          <p className="mt-2 text-sm leading-6 text-text-muted">
            Choose the project first. Integrations, flows, and future routing should stay inside that project context from the start.
          </p>
        </section>

        {!activeWorkspaceId ? (
          <section className="rounded-[2rem] border border-dashed border-border-main bg-surface p-8 text-sm text-text-muted">
            Select a workspace before creating a campaign.
          </section>
        ) : (
          <section className="flex h-auto min-h-[500px] flex-col rounded-[2rem] border border-border-main bg-surface p-8 shadow-sm">
            {!canCreateProjectCampaign ? (
              <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Campaign creation is not available for this access level.
              </div>
            ) : null}
            <div className="mb-5 rounded-2xl border border-border-main bg-canvas p-4 text-sm text-text-muted">
              Workspace: <strong>{activeWorkspace?.workspace_name || activeWorkspaceId}</strong>
              <br />
              Project: <strong>{selectedProject?.name || "Select one below"}</strong>
            </div>

            <fieldset disabled={!canCreateProjectCampaign} className={`grid gap-4 md:grid-cols-2 ${!canCreateProjectCampaign ? "opacity-70" : ""}`}>
              <div>
                <FormHelpHint label="Campaign name" hint="A clear, unique name to identify this campaign internally." />
                <input
                  className="w-full rounded-xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50"
                  placeholder="Example: Summer lead capture"
                  value={form.name}
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                />
              </div>
              <div>
                <FormHelpHint label="Project" hint="Everything in this campaign stays scoped to the selected project." />
                <select
                  className="w-full rounded-xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50"
                  value={form.projectId}
                  onChange={(event) => {
                    const nextProjectId = event.target.value;
                    setForm((prev) => ({
                      ...prev,
                      projectId: nextProjectId,
                      defaultFlowId: "",
                    }));
                    const nextProject = projects.find((project) => project.id === nextProjectId);
                    if (nextProject) {
                      setActiveProject({
                        id: nextProject.id,
                        workspace_id: nextProject.workspace_id,
                        name: nextProject.name,
                        status: nextProject.status,
                        is_default: nextProject.is_default,
                      });
                    }
                  }}
                >
                  <option value="">Select project</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <FormHelpHint label="Description" hint="Internal notes about the campaign's goals or audience." />
                <textarea
                  className="min-h-[120px] w-full rounded-xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50"
                  placeholder="What is this campaign for?"
                  value={form.description}
                  onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                />
              </div>
              <div>
                <FormHelpHint label="Status" hint="Drafts are inactive. Active campaigns process entries. Archived campaigns are read-only." />
                <select
                  className="w-full rounded-xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50"
                  value={form.status}
                  onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}
                >
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
              <div>
                <FormHelpHint label="Default flow" hint="Optional fallback flow used when no channel or entry-specific flow overrides it." />
                <select
                  className="w-full rounded-xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50"
                  value={form.defaultFlowId}
                  onChange={(event) => setForm((prev) => ({ ...prev, defaultFlowId: event.target.value }))}
                  disabled={!form.projectId}
                >
                  <option value="">
                    {form.projectId
                      ? "Default flow (optional)"
                      : "Select project first"}
                  </option>
                  {flowOptions.map((flow) => (
                    <option key={flow.id} value={flow.id}>
                      {flow.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <FormHelpHint label="Start date" hint="When this campaign should begin processing users." />
                <input
                  type="date"
                  className="w-full rounded-xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50"
                  value={form.startDate}
                  onChange={(event) => setForm((prev) => ({ ...prev, startDate: event.target.value }))}
                />
              </div>
              <div>
                <FormHelpHint label="End date" hint="When this campaign automatically stops. Leave blank to run indefinitely." />
                <input
                  type="date"
                  className="w-full rounded-xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50"
                  value={form.endDate}
                  onChange={(event) => setForm((prev) => ({ ...prev, endDate: event.target.value }))}
                />
              </div>
            </fieldset>

            <fieldset disabled={!canCreateProjectCampaign} className={`mt-6 grid gap-3 md:grid-cols-2 ${!canCreateProjectCampaign ? "opacity-70" : ""}`}>
              {[
                ["Allow multiple platforms", "allowMultiplePlatforms"],
                ["Auto assign agent", "autoAssignAgent"],
                ["Allow re-entry", "allowRestart"],
                ["Track leads", "trackLeads"],
              ].map(([label, key]) => (
                <label
                  key={key}
                  className="flex items-center justify-between rounded-xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main transition-colors hover:border-primary/30 hover:bg-primary/5"
                >
                  <span className="flex items-center gap-2">
                    {label}
                    <button
                      type="button"
                      title={
                        key === "allowMultiplePlatforms"
                          ? "Allow this campaign to operate across more than one platform."
                          : key === "autoAssignAgent"
                            ? "Auto-distribute inbound conversations to available agents."
                            : key === "allowRestart"
                              ? "Allow a lead to enter the flow again after an earlier run."
                              : "Store lead data from this campaign for later routing and reporting."
                      }
                      className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border-main bg-surface text-[10px] text-text-muted"
                    >
                      ?
                    </button>
                  </span>
                  <input
                    type="checkbox"
                    checked={(form as any)[key]}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, [key]: event.target.checked }))
                    }
                    className="h-5 w-5 rounded border-border-main text-primary focus:ring-primary"
                  />
                </label>
              ))}
            </fieldset>

            <div className="mt-4 rounded-2xl border border-primary/20 bg-primary-fade px-4 py-3 text-sm text-primary">
              After you create the campaign, add channels and integrations from the detail page.
            </div>

            {error ? (
              <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            ) : null}

            <div className="mt-6">
              <button
                onClick={handleCreate}
                disabled={!canCreateProjectCampaign}
                className="inline-flex items-center gap-2 rounded-2xl border border-primary bg-primary py-3 px-6 text-[10px] font-black uppercase tracking-[0.15em] text-white shadow-sm transition-all hover:-translate-y-0.5 active:scale-95 disabled:opacity-50"
              >
                <Plus size={14} />
                Create And Continue
              </button>
            </div>
          </section>
        )}
      </div>
    </DashboardLayout>
  );
}
