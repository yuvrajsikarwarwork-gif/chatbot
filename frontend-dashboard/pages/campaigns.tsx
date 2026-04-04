import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Copy, Edit3, Layers3, Pause, Play, Plus, Rocket, Trash2, Workflow } from "lucide-react";

import PageAccessNotice from "../components/access/PageAccessNotice";
import RequirePermission from "../components/access/RequirePermission";
import DashboardLayout from "../components/layout/DashboardLayout";
import { useVisibility } from "../hooks/useVisibility";
import { campaignService, CampaignSummary } from "../services/campaignService";
import { confirmAction } from "../store/uiStore";
import { useAuthStore } from "../store/authStore";

const isVisibleCampaign = (campaign: CampaignSummary) =>
  !String(campaign.slug || "").startsWith("phase-smoke-") &&
  !String(campaign.name || "").startsWith("Phase Smoke ");

export default function CampaignsPage() {
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);
  const activeProject = useAuthStore((state) => state.activeProject);
  const hasWorkspacePermission = useAuthStore((state) => state.hasWorkspacePermission);
  const getProjectRole = useAuthStore((state) => state.getProjectRole);
  const { canViewPage, isReadOnly } = useVisibility();
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [error, setError] = useState("");
  const canViewCampaignsPage = canViewPage("campaigns");
  const canCreateCampaign = hasWorkspacePermission(
    activeWorkspace?.workspace_id,
    "can_create_campaign"
  );
  const canDeleteCampaign = hasWorkspacePermission(
    activeWorkspace?.workspace_id,
    "delete_campaign"
  );
  const canEditCampaign = hasWorkspacePermission(
    activeWorkspace?.workspace_id,
    "edit_campaign"
  );
  const projectRole = getProjectRole(activeProject?.id);
  const canCreateProjectCampaign =
    !isReadOnly && (canCreateCampaign || projectRole === "project_admin" || projectRole === "editor");
  const canDeleteProjectCampaign = !isReadOnly && (canDeleteCampaign || projectRole === "project_admin");
  const canEditProjectCampaign =
    !isReadOnly && (canEditCampaign || projectRole === "project_admin" || projectRole === "editor");

  const loadCampaigns = async () => {
    if (!activeProject?.id) {
      setCampaigns([]);
      return;
    }

    try {
      setError("");
      const data = await campaignService.list({
        workspaceId: activeWorkspace?.workspace_id || undefined,
        projectId: activeProject?.id || undefined,
      });
      setCampaigns(data.filter(isVisibleCampaign));
    } catch (err: any) {
      console.error("Failed to load campaigns", err);
      setError(err?.response?.data?.error || "Failed to load campaigns");
    }
  };

  useEffect(() => {
    if (!canViewCampaignsPage) {
      setCampaigns([]);
      return;
    }
    loadCampaigns().catch(console.error);
  }, [activeWorkspace?.workspace_id, activeProject?.id, canViewCampaignsPage]);

  const handleDelete = async (campaignId: string) => {
    if (
      !(await confirmAction(
        "Delete campaign",
        "This removes the campaign and its project-bound routing records.",
        "Delete"
      ))
    ) {
      return;
    }

    try {
      await campaignService.remove(campaignId);
      await loadCampaigns();
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to delete campaign");
    }
  };

  const handleDuplicate = async (campaign: CampaignSummary) => {
    try {
      setError("");
      await campaignService.create({
        name: `${campaign.name} Copy`,
        slug: `${campaign.slug || campaign.name.toLowerCase().replace(/\s+/g, "-")}-copy-${Date.now().toString().slice(-4)}`,
        description: campaign.description || undefined,
        status: "draft",
        workspaceId: activeWorkspace?.workspace_id || undefined,
        projectId: activeProject?.id || undefined,
      });
      await loadCampaigns();
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to duplicate campaign");
    }
  };

  const handleTogglePause = async (campaign: CampaignSummary) => {
    try {
      setError("");
      await campaignService.update(campaign.id, {
        status: campaign.status === "paused" ? "active" : "paused",
      });
      await loadCampaigns();
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to update campaign");
    }
  };

  return (
    <DashboardLayout>
      {!canViewCampaignsPage ? (
        <PageAccessNotice
          title="Campaigns are restricted for this role"
          description="Campaign views stay inside workspace and project scope. Platform operators should use support tools instead."
          href="/"
          ctaLabel="Open dashboard"
        />
      ) : (
        <div className="mx-auto max-w-7xl space-y-6 px-outer">
          <section className="rounded-xl border border-border-main bg-bg-card p-4 shadow-card">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3 text-sm text-text-muted">
                <Layers3 size={16} className="text-primary" />
                <span>{campaigns.length} campaigns in the active project.</span>
                {activeProject?.id ? (
                  <span className="rounded-xs border border-border-main bg-bg-muted px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-text-soft">
                    Project bound
                  </span>
                ) : null}
              </div>

              <RequirePermission permissionKey="can_create_campaign">
                {canCreateProjectCampaign ? (
                  <Link
                    href="/campaigns/new"
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-white shadow-sm transition hover:opacity-95"
                  >
                    <Plus size={14} />
                    Create Campaign
                  </Link>
                ) : null}
              </RequirePermission>
            </div>
          </section>

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          {!activeProject?.id ? (
            <section className="rounded-xl border border-dashed border-border-main bg-bg-card p-6 text-sm text-text-muted shadow-card">
              Select a project before creating or reviewing campaigns. Campaign routing is now project-bound.
            </section>
          ) : null}

          <section className="overflow-hidden rounded-xl border border-border-main bg-bg-card shadow-card">
            <div className="flex items-center justify-between border-b border-border-main bg-bg-muted/60 px-4 py-3">
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.16em] text-text-soft">
                  Campaign Registry
                </div>
                <div className="mt-0.5 text-sm text-text-muted">
                  Compact registry view with direct actions for edit, launch, duplication, and routing.
                </div>
              </div>
              <div className="rounded-xs border border-border-main bg-bg-card px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-text-soft">
                {campaigns.length} total
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead className="sticky top-0 z-10 bg-bg-muted/80 backdrop-blur">
                  <tr className="h-10 border-b border-border-main text-[10px] font-black uppercase tracking-[0.18em] text-text-soft">
                    <th className="px-4">Campaign</th>
                    <th className="px-4">Status</th>
                    <th className="px-4">Channels</th>
                    <th className="px-4">Entry Points</th>
                    <th className="px-4">Leads</th>
                    <th className="px-4">Description</th>
                    <th className="px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-main/70">
                  {campaigns.map((campaign) => {
                    const isPaused = campaign.status === "paused";

                    return (
                      <tr
                        key={campaign.id}
                        className="group h-[var(--row-h-main)] border-l-2 border-l-transparent transition-colors hover:bg-surface-hover"
                      >
                        <td className="px-4 align-middle">
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-text-main">
                                {campaign.name}
                              </div>
                              <div className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-[0.16em] text-text-soft">
                                {campaign.slug || campaign.id}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 align-middle">
                          <span className="inline-flex rounded-xs border border-border-main bg-bg-muted px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-text-secondary">
                            {campaign.status}
                          </span>
                        </td>
                        <td className="px-4 align-middle font-mono text-[11px] text-text-secondary">
                          {campaign.channel_count}
                        </td>
                        <td className="px-4 align-middle font-mono text-[11px] text-text-secondary">
                          {campaign.entry_point_count}
                        </td>
                        <td className="px-4 align-middle font-mono text-[11px] text-text-secondary">
                          {campaign.lead_count}
                        </td>
                        <td className="px-4 align-middle">
                          <div className="max-w-[28rem] truncate text-sm text-text-muted">
                            {campaign.description || "No description added yet."}
                          </div>
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <div className="flex justify-end gap-2 opacity-100 lg:opacity-0 lg:transition lg:group-hover:opacity-100">
                            <Link
                              href={`/campaigns/${campaign.id}`}
                              className="inline-flex items-center gap-1 rounded-xs border border-border-main bg-bg-card px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-main hover:bg-bg-muted"
                            >
                              <ArrowRight size={12} />
                              Open
                            </Link>
                            <RequirePermission permissionKey="edit_campaign">
                              {canEditProjectCampaign ? (
                                <>
                                  <Link
                                    href={`/campaigns/${campaign.id}`}
                                    className="inline-flex items-center gap-1 rounded-xs border border-border-main bg-bg-card px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-main hover:bg-bg-muted"
                                  >
                                    <Edit3 size={12} />
                                    Edit
                                  </Link>
                                  <button
                                    type="button"
                                    onClick={() => handleTogglePause(campaign).catch(console.error)}
                                    className="inline-flex items-center gap-1 rounded-xs border border-border-main bg-bg-card px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-main hover:bg-bg-muted"
                                  >
                                    {isPaused ? <Play size={12} /> : <Pause size={12} />}
                                    {isPaused ? "Resume" : "Pause"}
                                  </button>
                                  <Link
                                    href={`/campaigns/${campaign.id}/launch`}
                                    className="inline-flex items-center gap-1 rounded-xs border border-primary bg-primary px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white hover:opacity-95"
                                  >
                                    <Rocket size={12} />
                                    Launch
                                  </Link>
                                  <Link
                                    href={`/campaigns/${campaign.id}/channels`}
                                    className="inline-flex items-center gap-1 rounded-xs border border-border-main bg-bg-card px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-main hover:bg-bg-muted"
                                  >
                                    <Workflow size={12} />
                                    Assign
                                  </Link>
                                  <Link
                                    href={`/campaigns/${campaign.id}`}
                                    className="inline-flex items-center gap-1 rounded-xs border border-border-main bg-bg-card px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-main hover:bg-bg-muted"
                                  >
                                    <ArrowRight size={12} />
                                    Move
                                  </Link>
                                </>
                              ) : null}
                            </RequirePermission>
                            <RequirePermission permissionKey="can_create_campaign">
                              {canCreateProjectCampaign ? (
                                <button
                                  type="button"
                                  onClick={() => handleDuplicate(campaign).catch(console.error)}
                                  className="inline-flex items-center gap-1 rounded-xs border border-border-main bg-bg-card px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-main hover:bg-bg-muted"
                                >
                                  <Copy size={12} />
                                  Duplicate
                                </button>
                              ) : null}
                            </RequirePermission>
                            <RequirePermission permissionKey="delete_campaign">
                              {canDeleteProjectCampaign ? (
                                <button
                                  type="button"
                                  onClick={() => handleDelete(campaign.id).catch(console.error)}
                                  className="inline-flex items-center gap-1 rounded-xs border border-red-200 bg-red-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-red-700 hover:bg-red-100"
                                >
                                  <Trash2 size={12} />
                                  Delete
                                </button>
                              ) : null}
                            </RequirePermission>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {campaigns.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-sm text-text-muted">
                        No campaigns yet. Start with the create flow.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </DashboardLayout>
  );
}
