import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";

import PageAccessNotice from "../../../components/access/PageAccessNotice";
import CampaignHeader from "../../../components/campaign/CampaignHeader";
import DashboardLayout from "../../../components/layout/DashboardLayout";
import BackButtonStrip from "../../../components/navigation/BackButtonStrip";
import { useVisibility } from "../../../hooks/useVisibility";
import { botService } from "../../../services/botService";
import { campaignService } from "../../../services/campaignService";
import { flowService } from "../../../services/flowService";
import { platformAccountService, type PlatformAccount } from "../../../services/platformAccountService";
import { useAuthStore } from "../../../store/authStore";

const CHANNEL_PLATFORMS = ["whatsapp", "website", "facebook", "instagram", "api", "telegram"];
const EMPTY_CHANNEL_FORM = {
  botId: "",
  platform: "whatsapp",
  platformAccountId: "",
  name: "",
  status: "active",
  defaultFlowId: "",
  flowId: "",
  listId: "",
  allowRestart: true,
  allowMultipleLeads: false,
  requirePhone: true,
};

export default function CampaignChannelsPage() {
  const router = useRouter();
  const { campaignId } = router.query;
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);
  const activeProject = useAuthStore((state) => state.activeProject);
  const setActiveProject = useAuthStore((state) => state.setActiveProject);
  const hasWorkspacePermission = useAuthStore((state) => state.hasWorkspacePermission);
  const getProjectRole = useAuthStore((state) => state.getProjectRole);
  const { canViewPage, isReadOnly } = useVisibility();
  const [campaign, setCampaign] = useState<any>(null);
  const [bots, setBots] = useState<any[]>([]);
  const [flowsByBot, setFlowsByBot] = useState<Record<string, any[]>>({});
  const [accounts, setAccounts] = useState<PlatformAccount[]>([]);
  const [channelForm, setChannelForm] = useState(EMPTY_CHANNEL_FORM);
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const canViewCampaignPage = canViewPage("campaigns");
  const selectedWorkspaceId =
    campaign?.workspace_id || campaign?.workspaceId || activeWorkspace?.workspace_id || "";
  const selectedProjectId =
    campaign?.project_id || campaign?.projectId || activeProject?.id || "";
  const canEditCampaign = hasWorkspacePermission(selectedWorkspaceId, "edit_campaign");
  const canDeleteCampaign = hasWorkspacePermission(selectedWorkspaceId, "delete_campaign");
  const projectRole = getProjectRole(selectedProjectId);
  const canEditProjectCampaign =
    !isReadOnly && (canEditCampaign || projectRole === "project_admin" || projectRole === "editor");
  const canDeleteProjectCampaign = !isReadOnly && (canDeleteCampaign || projectRole === "project_admin");

  const tabs = useMemo(
    () => [
      { label: "Overview", href: `/campaigns/${campaignId}` },
      { label: "Channels", href: `/campaigns/${campaignId}/channels` },
      { label: "Entries", href: `/campaigns/${campaignId}/entries` },
      { label: "Audience", href: `/campaigns/${campaignId}/audience` },
      { label: "Automation", href: `/campaigns/${campaignId}/automation` },
      { label: "Launch", href: `/campaigns/${campaignId}/launch` },
      { label: "Activity", href: `/campaigns/${campaignId}/activity` },
    ],
    [campaignId]
  );

  const availableAccounts = useMemo(
    () =>
      accounts.filter(
        (account) =>
          (!selectedWorkspaceId || account.workspace_id === selectedWorkspaceId) &&
          account.platform_type === channelForm.platform
      ),
    [accounts, channelForm.platform, selectedWorkspaceId]
  );

  const availableFlows = useMemo(
    () => (channelForm.botId ? flowsByBot[channelForm.botId] || [] : []),
    [flowsByBot, channelForm.botId]
  );

  const loadPage = async () => {
    if (!campaignId) {
      return;
    }
    const detail = (await campaignService.get(String(campaignId))) as any;
    detail.channels = await campaignService.getChannels(String(campaignId));
    setCampaign(detail);
    const workspaceId = detail.workspace_id || detail.workspaceId || activeWorkspace?.workspace_id;
    const projectId = detail.project_id || detail.projectId || activeProject?.id;
    if (projectId && workspaceId && activeProject?.id !== projectId) {
      setActiveProject({
        id: projectId,
        workspace_id: workspaceId,
        name: detail.project_name || activeProject?.name || "Project",
        status: detail.project_status || activeProject?.status || "active",
      });
    }
    const [botRows, accountRows] = await Promise.all([
      botService.getBots({ workspaceId, projectId }).catch(() => []),
      platformAccountService.list({ workspaceId, projectId }).catch(() => []),
    ]);
    setBots(botRows);
    setAccounts(accountRows);
    const flowEntries = await Promise.all(
      botRows.map(async (bot: any) => [bot.id, await flowService.getFlowSummaries(bot.id)] as const)
    );
    setFlowsByBot(Object.fromEntries(flowEntries));
  };

  useEffect(() => {
    if (!campaignId || !canViewCampaignPage) {
      setCampaign(null);
      return;
    }
    loadPage().catch((err: any) => {
      console.error("Failed to load campaign channels", err);
      setError(err?.response?.data?.error || "Failed to load campaign channels");
    });
  }, [campaignId, canViewCampaignPage, activeProject?.id, activeProject?.name, activeProject?.status, setActiveProject]);

  const startEdit = (channel: any) => {
    setEditingChannelId(channel.id);
    setChannelForm({
      botId: channel.bot_id || "",
      platform: channel.platform || "whatsapp",
      platformAccountId:
        channel.platform_account_ref_id ||
        channel.platform_account_id ||
        "",
      name: channel.name || "",
      status: channel.status || "active",
      defaultFlowId: channel.default_flow_id || "",
      flowId: channel.flow_id || "",
      listId: channel.list_id || "",
      allowRestart: Boolean(channel.allow_restart ?? true),
      allowMultipleLeads: Boolean(channel.allow_multiple_leads ?? false),
      requirePhone: Boolean(channel.require_phone ?? true),
    });
  };

  const resetForm = () => {
    setEditingChannelId(null);
    setChannelForm(EMPTY_CHANNEL_FORM);
  };

  const handleSave = async () => {
    if (!campaignId) {
      return;
    }

    try {
      setBusy(true);
      setError("");
      setSuccess("");
      const payload = { ...channelForm };
      if (editingChannelId) {
        await campaignService.updateChannelInCampaign(
          String(campaignId),
          editingChannelId,
          payload
        );
      } else {
        await campaignService.createChannelInCampaign(String(campaignId), payload);
      }
      resetForm();
      await loadPage();
      setSuccess(editingChannelId ? "Channel updated." : "Channel created.");
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to save campaign channel");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (channelId: string) => {
    try {
      setBusy(true);
      setError("");
      await campaignService.deleteChannelInCampaign(String(campaignId), channelId);
      if (editingChannelId === channelId) {
        resetForm();
      }
      await loadPage();
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to delete campaign channel");
    } finally {
      setBusy(false);
    }
  };

  return (
    <DashboardLayout>
      {!canViewCampaignPage ? (
        <PageAccessNotice
          title="Campaign channels are restricted for this role"
          description="Campaign pages are only available to users with campaign or assigned project access."
          href="/campaigns"
          ctaLabel="Open campaigns"
        />
      ) : (
        <div className="mx-auto max-w-7xl space-y-6">
          <BackButtonStrip href={`/campaigns/${campaignId}`} label="Back to campaign overview" />
          <CampaignHeader
            campaignName={campaign?.name}
            pageTitle="Campaign Channels"
            description="Each channel is the routing base for entry points, flows, and audience capture inside this campaign."
            tabs={tabs}
            currentPath={router.asPath.split("?")[0] || ""}
          />

          {error ? <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-700">{error}</section> : null}
          {success ? <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-700">{success}</section> : null}

          <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
            <section className="flex h-auto min-h-[500px] flex-col rounded-[2rem] border border-border-main bg-surface p-8 shadow-sm">
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <select className="w-full rounded-xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50" value={channelForm.botId} disabled={!canEditProjectCampaign} onChange={(event) => setChannelForm((current) => ({ ...current, botId: event.target.value }))}>
                    <option value="">Select bot</option>
                    {bots.map((bot) => <option key={bot.id} value={bot.id}>{bot.name}</option>)}
                  </select>
                  <select className="w-full rounded-xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50" value={channelForm.platform} disabled={!canEditProjectCampaign} onChange={(event) => setChannelForm((current) => ({ ...current, platform: event.target.value, platformAccountId: "" }))}>
                    {CHANNEL_PLATFORMS.map((platform) => <option key={platform} value={platform}>{platform}</option>)}
                  </select>
                </div>
                <input className="w-full rounded-xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50" placeholder="Channel name" value={channelForm.name} disabled={!canEditProjectCampaign} onChange={(event) => setChannelForm((current) => ({ ...current, name: event.target.value }))} />
                <select className="w-full rounded-xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50" value={channelForm.platformAccountId} disabled={!canEditProjectCampaign} onChange={(event) => setChannelForm((current) => ({ ...current, platformAccountId: event.target.value }))}>
                  <option value="">Select integration account</option>
                  {availableAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                </select>
                <select className="w-full rounded-xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50" value={channelForm.flowId} disabled={!canEditProjectCampaign} onChange={(event) => setChannelForm((current) => ({ ...current, flowId: event.target.value }))}>
                  <option value="">Select flow</option>
                  {availableFlows.map((flow) => <option key={flow.id} value={flow.id}>{flow.flow_name || flow.name || flow.id}</option>)}
                </select>
                <div className="grid gap-3 md:grid-cols-3">
                  {[
                    ["allowRestart", "Allow restart"],
                    ["allowMultipleLeads", "Allow multiple leads"],
                    ["requirePhone", "Require phone"],
                  ].map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2 rounded-xl border border-border-main bg-canvas px-3 py-3 text-sm text-text-main transition-colors hover:border-primary/30 hover:bg-primary/5">
                      <input type="checkbox" className="h-5 w-5 rounded border-border-main text-primary focus:ring-primary" checked={Boolean((channelForm as any)[key])} disabled={!canEditProjectCampaign} onChange={(event) => setChannelForm((current) => ({ ...current, [key]: event.target.checked }))} />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
                <div className="flex gap-3">
                  <button type="button" onClick={handleSave} disabled={busy || !canEditProjectCampaign} className="flex-1 rounded-2xl border border-primary bg-primary py-3 px-6 text-[10px] font-black uppercase tracking-[0.15em] text-white shadow-sm transition-all hover:-translate-y-0.5 active:scale-95 disabled:opacity-50">
                    {editingChannelId ? "Save channel" : "Add channel"}
                  </button>
                  {editingChannelId ? (
                    <button type="button" onClick={resetForm} className="rounded-2xl border border-border-main bg-canvas py-3 px-6 text-[10px] font-black uppercase tracking-[0.15em] text-text-main transition-all hover:bg-surface active:scale-95">
                      Cancel
                    </button>
                  ) : null}
                </div>
              </div>
            </section>

            <section className="rounded-[2rem] border border-border-main bg-surface p-8 shadow-sm">
              <div className="space-y-3">
                {(campaign?.channels || []).length ? (
                  campaign.channels.map((channel: any) => (
                    <div key={channel.id} className="rounded-xl border border-border-main bg-canvas p-4 transition-colors hover:border-primary/30 hover:bg-primary/5">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <div className="text-sm font-semibold text-text-main">{channel.name || channel.platform}</div>
                          <div className="mt-1 text-xs uppercase tracking-[0.16em] text-text-muted">
                            {channel.platform} Â· {channel.status}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button type="button" onClick={() => startEdit(channel)} disabled={!canEditProjectCampaign} className="rounded-2xl border border-border-main bg-canvas py-3 px-6 text-[10px] font-black uppercase tracking-[0.15em] text-text-main transition-all hover:bg-surface active:scale-95 disabled:opacity-50">Edit</button>
                          <button type="button" onClick={() => handleDelete(channel.id)} disabled={!canDeleteProjectCampaign} className="rounded-2xl border border-rose-200 bg-rose-50 py-3 px-6 text-[10px] font-black uppercase tracking-[0.15em] text-rose-700 transition-all hover:-translate-y-0.5 active:scale-95 disabled:cursor-not-allowed disabled:border-border-main/60 disabled:bg-canvas disabled:text-text-muted disabled:opacity-100">Delete</button>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-border-main bg-canvas px-4 py-6 text-sm text-text-muted">
                    No channels configured yet. Add a campaign channel to start routing traffic.
                  </div>
                )}
              </div>
              <div className="mt-5">
                <Link href={`/campaigns/${campaignId}/entries`} className="text-sm font-black uppercase tracking-[0.15em] text-primary">
                  Continue to entry points
                </Link>
              </div>
            </section>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

