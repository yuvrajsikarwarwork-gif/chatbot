import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Copy, Edit3, Layers3, Pause, Play, Plus, Rocket, Trash2, Workflow } from "lucide-react";

import PageAccessNotice from "../components/access/PageAccessNotice";
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
  const { canViewPage } = useVisibility();
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
    canCreateCampaign || projectRole === "project_admin" || projectRole === "editor";
  const canDeleteProjectCampaign = canDeleteCampaign || projectRole === "project_admin";
  const canEditProjectCampaign =
    canEditCampaign || projectRole === "project_admin" || projectRole === "editor";

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
        <section className="rounded-[1.25rem] border border-[var(--line)] bg-[var(--surface)] px-5 py-4 shadow-[var(--shadow-soft)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3 text-sm text-[var(--muted)]">
              <Layers3 size={16} className="text-[var(--accent)]" />
              <span>{campaigns.length} campaigns in the active project.</span>
            </div>

            {canCreateProjectCampaign ? (
              <Link
                href="/campaigns/new"
                className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent-strong)] px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] shadow-sm"
                style={{ color: "#ffffff" }}
              >
                <Plus size={14} />
                Create Campaign
              </Link>
            ) : null}
          </div>
        </section>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {!activeProject?.id ? (
          <section className="rounded-[1.5rem] border border-dashed border-[var(--line)] bg-[var(--surface)] p-8 text-sm text-[var(--muted)]">
            Select a project before creating or reviewing campaigns. Campaign routing is now project-bound.
          </section>
        ) : null}

        <section className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                Existing Campaigns
              </div>
              <div className="mt-1 text-sm text-[var(--muted)]">
                Open any campaign to edit details, settings, and related routing context.
              </div>
            </div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
              {campaigns.length} total
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {campaigns.map((campaign) => (
              <div
                key={campaign.id}
                className="rounded-[1.25rem] border border-[var(--line)] bg-[var(--surface-strong)] p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-base font-semibold text-[var(--text)]">
                      {campaign.name}
                    </div>
                    <div className="mt-1 text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
                      {campaign.status}
                    </div>
                  </div>
                  <div className="rounded-full border border-[var(--line)] bg-[var(--surface-muted)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                    Manage inside
                  </div>
                </div>

                <div className="mt-3 text-sm leading-6 text-[var(--muted)]">
                  {campaign.description || "No description added yet."}
                </div>

                <div className="mt-4 grid gap-2 text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
                  <div>{campaign.channel_count} channels</div>
                  <div>{campaign.entry_point_count} entry points</div>
                  <div>{campaign.lead_count} leads</div>
                </div>

                <div className="mt-5 grid gap-2 sm:grid-cols-2">
                  <Link
                    href={`/campaigns/${campaign.id}`}
                    className="inline-flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text)]"
                  >
                    Open Campaign
                    <ArrowRight size={13} />
                  </Link>
                  {canEditProjectCampaign ? (
                    <Link
                      href={`/campaigns/${campaign.id}`}
                      className="inline-flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text)]"
                    >
                      <Edit3 size={13} />
                      Edit
                    </Link>
                  ) : null}
                  {canCreateProjectCampaign ? (
                    <button
                      type="button"
                      onClick={() => handleDuplicate(campaign).catch(console.error)}
                      className="inline-flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text)]"
                    >
                      <Copy size={13} />
                      Duplicate
                    </button>
                  ) : null}
                  {canEditProjectCampaign ? (
                    <Link
                      href={`/campaigns/${campaign.id}/launch`}
                      className="inline-flex items-center gap-2 rounded-xl border border-[rgba(129,140,248,0.35)] bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-white"
                    >
                      <Rocket size={13} />
                      Launch
                    </Link>
                  ) : null}
                  {canEditProjectCampaign ? (
                    <button
                      type="button"
                      onClick={() => handleTogglePause(campaign).catch(console.error)}
                      className="inline-flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text)]"
                    >
                      {campaign.status === "paused" ? <Play size={13} /> : <Pause size={13} />}
                      {campaign.status === "paused" ? "Resume" : "Pause"}
                    </button>
                  ) : null}
                  {canEditProjectCampaign ? (
                    <Link
                      href={`/campaigns/${campaign.id}/channels`}
                      className="inline-flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text)]"
                    >
                      <Workflow size={13} />
                      Assign Bot
                    </Link>
                  ) : null}
                  {canEditProjectCampaign ? (
                    <Link
                      href={`/campaigns/${campaign.id}`}
                      className="inline-flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text)]"
                    >
                      <ArrowRight size={13} />
                      Change Project
                    </Link>
                  ) : null}
                  {canDeleteProjectCampaign ? (
                    <button
                      type="button"
                      onClick={() => handleDelete(campaign.id).catch(console.error)}
                      className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-rose-700"
                    >
                      <Trash2 size={13} />
                      Delete
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
            {campaigns.length === 0 ? (
              <div className="rounded-[1.25rem] border border-dashed border-[var(--line)] bg-[var(--surface-muted)] p-8 text-sm text-[var(--muted)]">
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
