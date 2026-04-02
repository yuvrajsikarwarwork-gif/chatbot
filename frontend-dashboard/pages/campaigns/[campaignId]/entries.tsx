import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";

import PageAccessNotice from "../../../components/access/PageAccessNotice";
import CampaignHeader from "../../../components/campaign/CampaignHeader";
import DashboardLayout from "../../../components/layout/DashboardLayout";
import BackButtonStrip from "../../../components/navigation/BackButtonStrip";
import { useVisibility } from "../../../hooks/useVisibility";
import { campaignService } from "../../../services/campaignService";
import { flowService } from "../../../services/flowService";
import { useAuthStore } from "../../../store/authStore";

const ENTRY_TYPES = ["generic", "qr", "link", "widget", "api", "webhook", "ad"];
const EMPTY_ENTRY_FORM = {
  channelId: "",
  botId: "",
  flowId: "",
  name: "",
  entryKey: "",
  entryType: "generic",
  sourceRef: "",
  landingUrl: "",
  isDefault: false,
  isActive: true,
  listId: "",
};

export default function CampaignEntriesPage() {
  const router = useRouter();
  const { campaignId } = router.query;
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);
  const activeProject = useAuthStore((state) => state.activeProject);
  const setActiveProject = useAuthStore((state) => state.setActiveProject);
  const hasWorkspacePermission = useAuthStore((state) => state.hasWorkspacePermission);
  const getProjectRole = useAuthStore((state) => state.getProjectRole);
  const { canViewPage, isReadOnly } = useVisibility();
  const [campaign, setCampaign] = useState<any>(null);
  const [flowsByBot, setFlowsByBot] = useState<Record<string, any[]>>({});
  const [entryForm, setEntryForm] = useState(EMPTY_ENTRY_FORM);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
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

  const selectedChannel = useMemo(
    () => campaign?.channels?.find((item: any) => item.id === entryForm.channelId) || null,
    [campaign?.channels, entryForm.channelId]
  );
  const availableFlows = useMemo(
    () => (selectedChannel?.bot_id ? flowsByBot[selectedChannel.bot_id] || [] : []),
    [flowsByBot, selectedChannel]
  );

  const loadPage = async () => {
    if (!campaignId) {
      return;
    }
    const detail = (await campaignService.get(String(campaignId))) as any;
    detail.entryPoints = await campaignService.getEntries(String(campaignId));
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
    const botIds = Array.from(
      new Set<string>((detail.channels || []).map((channel: any) => channel.bot_id).filter(Boolean))
    );
    const flowEntries = await Promise.all(
      botIds.map(async (botId: string) => [botId, await flowService.getFlowSummaries(botId)] as const)
    );
    setFlowsByBot(Object.fromEntries(flowEntries));
  };

  useEffect(() => {
    if (!campaignId || !canViewCampaignPage) {
      setCampaign(null);
      return;
    }
    loadPage().catch((err: any) => {
      console.error("Failed to load campaign entries", err);
      setError(err?.response?.data?.error || "Failed to load campaign entries");
    });
  }, [campaignId, canViewCampaignPage, activeProject?.id, activeProject?.name, activeProject?.status, setActiveProject]);

  const startEdit = (entry: any) => {
    setEditingEntryId(entry.id);
    setEntryForm({
      channelId: entry.channel_id || "",
      botId: entry.bot_id || "",
      flowId: entry.flow_id || "",
      name: entry.name || "",
      entryKey: entry.entry_key || "",
      entryType: entry.entry_type || "generic",
      sourceRef: entry.source_ref || "",
      landingUrl: entry.landing_url || "",
      isDefault: Boolean(entry.is_default),
      isActive: Boolean(entry.is_active ?? true),
      listId: entry.list_id || "",
    });
  };

  const resetForm = () => {
    setEditingEntryId(null);
    setEntryForm(EMPTY_ENTRY_FORM);
  };

  const handleSave = async () => {
    if (!campaignId) {
      return;
    }

    try {
      setBusy(true);
      setError("");
      setSuccess("");
      const payload = { ...entryForm };
      if (editingEntryId) {
        await campaignService.updateEntryPointInCampaign(
          String(campaignId),
          editingEntryId,
          payload
        );
      } else {
        await campaignService.createEntryPointInCampaign(String(campaignId), payload);
      }
      resetForm();
      await loadPage();
      setSuccess(editingEntryId ? "Entry point updated." : "Entry point created.");
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to save entry point");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (entryId: string) => {
    try {
      setBusy(true);
      setError("");
      await campaignService.deleteEntryPointInCampaign(String(campaignId), entryId);
      if (editingEntryId === entryId) {
        resetForm();
      }
      await loadPage();
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to delete entry point");
    } finally {
      setBusy(false);
    }
  };

  return (
    <DashboardLayout>
      {!canViewCampaignPage ? (
        <PageAccessNotice
          title="Campaign entries are restricted for this role"
          description="Campaign pages are only available to users with campaign or assigned project access."
          href="/campaigns"
          ctaLabel="Open campaigns"
        />
      ) : (
        <div className="mx-auto max-w-7xl space-y-6">
          <BackButtonStrip href={`/campaigns/${campaignId}/channels`} label="Back to channels" />
          <CampaignHeader
            campaignName={campaign?.name}
            pageTitle="Campaign Entries"
            description="Define how users enter this campaign (e.g., keywords or API triggers)."
            tabs={tabs}
            currentPath={router.asPath.split("?")[0] || ""}
          />

          {error ? <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</section> : null}
          {success ? <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{success}</section> : null}

          <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
            <section className="flex h-auto min-h-[500px] flex-col rounded-[2rem] border border-border-main bg-surface p-8 shadow-sm">
              <div className="space-y-4">
                <select className="w-full rounded-xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50" value={entryForm.channelId} disabled={!canEditProjectCampaign} onChange={(event) => {
                  const nextChannel = campaign?.channels?.find((item: any) => item.id === event.target.value) || null;
                  setEntryForm((current) => ({ ...current, channelId: event.target.value, botId: nextChannel?.bot_id || "" }));
                }}>
                  <option value="">Select channel</option>
                  {(campaign?.channels || []).map((channel: any) => <option key={channel.id} value={channel.id}>{channel.name || channel.platform}</option>)}
                </select>
                <select className="w-full rounded-xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50" value={entryForm.flowId} disabled={!canEditProjectCampaign} onChange={(event) => setEntryForm((current) => ({ ...current, flowId: event.target.value }))}>
                  <option value="">Select flow</option>
                  {availableFlows.map((flow) => <option key={flow.id} value={flow.id}>{flow.flow_name || flow.name || flow.id}</option>)}
                </select>
                <input className="w-full rounded-xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50" placeholder="Entry name" value={entryForm.name} disabled={!canEditProjectCampaign} onChange={(event) => setEntryForm((current) => ({ ...current, name: event.target.value }))} />
                <input className="w-full rounded-xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50" placeholder="Entry key" value={entryForm.entryKey} disabled={!canEditProjectCampaign} onChange={(event) => setEntryForm((current) => ({ ...current, entryKey: event.target.value }))} />
                <select className="w-full rounded-xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50" value={entryForm.entryType} disabled={!canEditProjectCampaign} onChange={(event) => setEntryForm((current) => ({ ...current, entryType: event.target.value }))}>
                  {ENTRY_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
                <select className="w-full rounded-xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50" value={entryForm.listId} disabled={!canEditProjectCampaign} onChange={(event) => setEntryForm((current) => ({ ...current, listId: event.target.value }))}>
                  <option value="">Attach list</option>
                  {(campaign?.lists || []).map((list: any) => <option key={list.id} value={list.id}>{list.name}</option>)}
                </select>
                <input className="w-full rounded-xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50" placeholder="Source reference" value={entryForm.sourceRef} disabled={!canEditProjectCampaign} onChange={(event) => setEntryForm((current) => ({ ...current, sourceRef: event.target.value }))} />
                <input className="w-full rounded-xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50" placeholder="Landing URL" value={entryForm.landingUrl} disabled={!canEditProjectCampaign} onChange={(event) => setEntryForm((current) => ({ ...current, landingUrl: event.target.value }))} />
                <div className="grid gap-3 md:grid-cols-2">
                  {[
                    ["isDefault", "Default route"],
                    ["isActive", "Active"],
                  ].map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2 rounded-xl border border-border-main bg-canvas px-3 py-3 text-sm text-text-main transition-colors hover:border-primary/30 hover:bg-primary/5">
                      <input type="checkbox" className="h-5 w-5 rounded border-border-main text-primary focus:ring-primary" checked={Boolean((entryForm as any)[key])} disabled={!canEditProjectCampaign} onChange={(event) => setEntryForm((current) => ({ ...current, [key]: event.target.checked }))} />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
                <div className="flex gap-3">
                  <button type="button" onClick={handleSave} disabled={busy || !canEditProjectCampaign} className="flex-1 rounded-2xl border border-primary bg-primary py-3 px-6 text-[10px] font-black uppercase tracking-[0.15em] text-white shadow-sm transition-all hover:-translate-y-0.5 active:scale-95 disabled:opacity-50">
                    {editingEntryId ? "Save entry" : "Add entry"}
                  </button>
                  {editingEntryId ? (
                    <button type="button" onClick={resetForm} className="rounded-2xl border border-border-main bg-canvas py-3 px-6 text-[10px] font-black uppercase tracking-[0.15em] text-text-main transition-all hover:bg-surface active:scale-95">
                      Cancel
                    </button>
                  ) : null}
                </div>
              </div>
            </section>

            <section className="flex h-auto min-h-[500px] flex-col rounded-[2rem] border border-border-main bg-surface p-8 shadow-sm">
              <div className="space-y-3">
                {(campaign?.entryPoints || []).length ? (
                  campaign.entryPoints.map((entry: any) => (
                    <div key={entry.id} className="rounded-xl border border-border-main bg-canvas p-4 transition-colors hover:border-primary/30 hover:bg-primary/5">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <div className="text-sm font-semibold text-text-main">{entry.name || entry.entry_key}</div>
                          <div className="mt-1 text-xs uppercase tracking-[0.16em] text-text-muted">
                            {entry.entry_type || "generic"} · {entry.is_active ? "active" : "inactive"}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button type="button" onClick={() => startEdit(entry)} disabled={!canEditProjectCampaign} className="rounded-2xl border border-border-main bg-canvas py-3 px-6 text-[10px] font-black uppercase tracking-[0.15em] text-text-main transition-all hover:bg-surface active:scale-95 disabled:opacity-50">Edit</button>
                          <button type="button" onClick={() => handleDelete(entry.id)} disabled={!canDeleteProjectCampaign} className="rounded-2xl border border-rose-200 bg-rose-50 py-3 px-6 text-[10px] font-black uppercase tracking-[0.15em] text-rose-700 transition-all hover:-translate-y-0.5 active:scale-95 disabled:opacity-50">Delete</button>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-border-main bg-canvas px-4 py-6 text-sm text-text-muted">
                    No entry points configured yet.
                  </div>
                )}
              </div>
              <div className="mt-5">
                <Link href={`/campaigns/${campaignId}/audience`} className="text-sm font-black uppercase tracking-[0.15em] text-primary">
                  Continue to audience and lists
                </Link>
              </div>
            </section>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
