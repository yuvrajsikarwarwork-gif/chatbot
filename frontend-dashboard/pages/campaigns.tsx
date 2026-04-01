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
        <div className="mx-auto max-w-7xl space-y-6">
          <section className="rounded-[1.9rem] border border-border-main bg-surface p-6 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3 text-sm text-text-muted">
                <Layers3 size={16} className="text-primary" />
                <span>{campaigns.length} campaigns in the active project.</span>
              </div>

              <RequirePermission permissionKey="can_create_campaign">
                {canCreateProjectCampaign ? (
                  <Link
                    href="/campaigns/new"
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 text-xs font-semibold uppercase tracking-wider text-white shadow-sm"
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
            <section className="rounded-[1.9rem] border-dashed border-border-main bg-canvas p-8 text-sm text-text-muted shadow-sm">
              Select a project before creating or reviewing campaigns. Campaign routing is now project-bound.
            </section>
          ) : null}

          <section className="rounded-[1.9rem] border border-border-main bg-surface p-6 shadow-sm">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                  Existing Campaigns
                </div>
                <div className="mt-1 text-sm text-text-muted">
                  Open any campaign to edit details, settings, and related routing context.
                </div>
              </div>
              <div className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                {campaigns.length} total
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {campaigns.map((campaign) => (
                <div
                  key={campaign.id}
                  className="rounded-[1.75rem] border border-border-main bg-surface p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-base font-semibold text-text-main">
                        {campaign.name}
                      </div>
                      <div className="mt-1 text-xs uppercase tracking-wider text-text-muted">
                        {campaign.status}
                      </div>
                    </div>
                    <div className="rounded-full border border-border-main bg-canvas px-3 py-1 text-xs font-semibold uppercase tracking-wider text-text-muted">
                      Manage inside
                    </div>
                  </div>

                  <div className="mt-3 text-sm leading-6 text-text-muted">
                    {campaign.description || "No description added yet."}
                  </div>

                  <div className="mt-4 grid gap-2 text-xs uppercase tracking-wider text-text-muted">
                    <div>{campaign.channel_count} channels</div>
                    <div>{campaign.entry_point_count} entry points</div>
                    <div>{campaign.lead_count} leads</div>
                  </div>

                  <div className="mt-5 grid gap-2 sm:grid-cols-2">
                    <Link
                      href={`/campaigns/${campaign.id}`}
                      className="inline-flex items-center gap-2 rounded-md border border-border-main bg-canvas px-4 py-2 text-xs font-semibold uppercase tracking-wider text-text-main"
                    >
                      Open Campaign
                      <ArrowRight size={13} />
                    </Link>
                    <RequirePermission permissionKey="edit_campaign">
                      {canEditProjectCampaign ? (
                        <Link
                          href={`/campaigns/${campaign.id}`}
                          className="inline-flex items-center gap-2 rounded-md border border-border-main bg-canvas px-4 py-2 text-xs font-semibold uppercase tracking-wider text-text-main"
                        >
                          <Edit3 size={13} />
                          Edit
                        </Link>
                      ) : null}
                    </RequirePermission>
                    <RequirePermission permissionKey="can_create_campaign">
                      {canCreateProjectCampaign ? (
                        <button
                          type="button"
                          onClick={() => handleDuplicate(campaign).catch(console.error)}
                          className="inline-flex items-center gap-2 rounded-md border border-border-main bg-canvas px-4 py-2 text-xs font-semibold uppercase tracking-wider text-text-main"
                        >
                          <Copy size={13} />
                          Duplicate
                        </button>
                      ) : null}
                    </RequirePermission>
                    <RequirePermission permissionKey="edit_campaign">
                      {canEditProjectCampaign ? (
                        <Link
                          href={`/campaigns/${campaign.id}/launch`}
                          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-wider text-white"
                        >
                          <Rocket size={13} />
                          Launch
                        </Link>
                      ) : null}
                    </RequirePermission>
                    <RequirePermission permissionKey="edit_campaign">
                      {canEditProjectCampaign ? (
                        <button
                          type="button"
                          onClick={() => handleTogglePause(campaign).catch(console.error)}
                          className="inline-flex items-center gap-2 rounded-md border border-border-main bg-canvas px-4 py-2 text-xs font-semibold uppercase tracking-wider text-text-main"
                        >
                          {campaign.status === "paused" ? <Play size={13} /> : <Pause size={13} />}
                          {campaign.status === "paused" ? "Resume" : "Pause"}
                        </button>
                      ) : null}
                    </RequirePermission>
                    <RequirePermission permissionKey="edit_campaign">
                      {canEditProjectCampaign ? (
                        <Link
                          href={`/campaigns/${campaign.id}/channels`}
                          className="inline-flex items-center gap-2 rounded-md border border-border-main bg-canvas px-4 py-2 text-xs font-semibold uppercase tracking-wider text-text-main"
                        >
                          <Workflow size={13} />
                          Assign Bot
                        </Link>
                      ) : null}
                    </RequirePermission>
                    <RequirePermission permissionKey="edit_campaign">
                      {canEditProjectCampaign ? (
                        <Link
                          href={`/campaigns/${campaign.id}`}
                          className="inline-flex items-center gap-2 rounded-md border border-border-main bg-canvas px-4 py-2 text-xs font-semibold uppercase tracking-wider text-text-main"
                        >
                          <ArrowRight size={13} />
                          Change Project
                        </Link>
                      ) : null}
                    </RequirePermission>
                    <RequirePermission permissionKey="delete_campaign">
                      {canDeleteProjectCampaign ? (
                        <button
                          type="button"
                          onClick={() => handleDelete(campaign.id).catch(console.error)}
                          className="inline-flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-red-700"
                        >
                          <Trash2 size={13} />
                          Delete
                        </button>
                      ) : null}
                    </RequirePermission>
                  </div>
                </div>
              ))}
              {campaigns.length === 0 ? (
                <div className="rounded-xl border-dashed border-border-main bg-canvas p-8 text-sm text-text-muted">
                  No campaigns yet. Start with the create flow.
                </div>
              ) : null}
            </div>
          </section>
        </div>
      )}
    </DashboardLayout>
  );
}
