import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";

import PageAccessNotice from "../../../components/access/PageAccessNotice";
import DashboardLayout from "../../../components/layout/DashboardLayout";
import BackButtonStrip from "../../../components/navigation/BackButtonStrip";
import SectionTabs from "../../../components/navigation/SectionTabs";
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
  const { canViewPage } = useVisibility();
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
    canEditCampaign || projectRole === "project_admin" || projectRole === "editor";
  const canDeleteProjectCampaign = canDeleteCampaign || projectRole === "project_admin";

  const tabs = useMemo(
    () => [
      { label: "Overview", href: `/campaigns/${campaignId}` },
      { label: "Channels", href: `/campaigns/${campaignId}/channels` },
      { label: "Entries", href: `/campaigns/${campaignId}/entries` },
      { label: "Audience", href: `/campaigns/${campaignId}/audience` },
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
          <section className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)]">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
                  Entry Points
                </div>
                <h1 className="mt-3 text-[1.6rem] font-semibold tracking-tight text-[var(--text)]">
                  Controlled sources into the campaign
                </h1>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                  Keep every landing route, widget, link, and API source here so routing and analytics stay isolated.
                </p>
              </div>
              <SectionTabs items={tabs} currentPath={router.asPath.split("?")[0] || ""} />
            </div>
          </section>

          {error ? <section className="rounded-[1.5rem] border border-rose-300/40 bg-rose-500/10 p-4 text-sm text-rose-200">{error}</section> : null}
          {success ? <section className="rounded-[1.5rem] border border-emerald-300/35 bg-emerald-500/10 p-4 text-sm text-emerald-200">{success}</section> : null}

          <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
            <section className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)]">
              <div className="space-y-4">
                <select className="w-full rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] px-4 py-3 text-sm text-[var(--text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] outline-none" value={entryForm.channelId} disabled={!canEditProjectCampaign} onChange={(event) => {
                  const nextChannel = campaign?.channels?.find((item: any) => item.id === event.target.value) || null;
                  setEntryForm((current) => ({ ...current, channelId: event.target.value, botId: nextChannel?.bot_id || "" }));
                }}>
                  <option value="">Select channel</option>
                  {(campaign?.channels || []).map((channel: any) => <option key={channel.id} value={channel.id}>{channel.name || channel.platform}</option>)}
                </select>
                <select className="w-full rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] px-4 py-3 text-sm text-[var(--text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] outline-none" value={entryForm.flowId} disabled={!canEditProjectCampaign} onChange={(event) => setEntryForm((current) => ({ ...current, flowId: event.target.value }))}>
                  <option value="">Select flow</option>
                  {availableFlows.map((flow) => <option key={flow.id} value={flow.id}>{flow.flow_name || flow.name || flow.id}</option>)}
                </select>
                <input className="w-full rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] px-4 py-3 text-sm text-[var(--text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] outline-none" placeholder="Entry name" value={entryForm.name} disabled={!canEditProjectCampaign} onChange={(event) => setEntryForm((current) => ({ ...current, name: event.target.value }))} />
                <input className="w-full rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] px-4 py-3 text-sm text-[var(--text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] outline-none" placeholder="Entry key" value={entryForm.entryKey} disabled={!canEditProjectCampaign} onChange={(event) => setEntryForm((current) => ({ ...current, entryKey: event.target.value }))} />
                <select className="w-full rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] px-4 py-3 text-sm text-[var(--text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] outline-none" value={entryForm.entryType} disabled={!canEditProjectCampaign} onChange={(event) => setEntryForm((current) => ({ ...current, entryType: event.target.value }))}>
                  {ENTRY_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
                <select className="w-full rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] px-4 py-3 text-sm text-[var(--text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] outline-none" value={entryForm.listId} disabled={!canEditProjectCampaign} onChange={(event) => setEntryForm((current) => ({ ...current, listId: event.target.value }))}>
                  <option value="">Attach list</option>
                  {(campaign?.lists || []).map((list: any) => <option key={list.id} value={list.id}>{list.name}</option>)}
                </select>
                <input className="w-full rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] px-4 py-3 text-sm text-[var(--text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] outline-none" placeholder="Source reference" value={entryForm.sourceRef} disabled={!canEditProjectCampaign} onChange={(event) => setEntryForm((current) => ({ ...current, sourceRef: event.target.value }))} />
                <input className="w-full rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] px-4 py-3 text-sm text-[var(--text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] outline-none" placeholder="Landing URL" value={entryForm.landingUrl} disabled={!canEditProjectCampaign} onChange={(event) => setEntryForm((current) => ({ ...current, landingUrl: event.target.value }))} />
                <div className="grid gap-3 md:grid-cols-2">
                  {[
                    ["isDefault", "Default route"],
                    ["isActive", "Active"],
                  ].map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] px-3 py-3 text-sm text-[var(--text)]">
                      <input type="checkbox" checked={Boolean((entryForm as any)[key])} disabled={!canEditProjectCampaign} onChange={(event) => setEntryForm((current) => ({ ...current, [key]: event.target.checked }))} />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
                <div className="flex gap-3">
                  <button type="button" onClick={handleSave} disabled={busy || !canEditProjectCampaign} className="flex-1 rounded-2xl border border-[rgba(129,140,248,0.4)] bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] px-4 py-3 text-[11px] font-black uppercase tracking-[0.2em] text-white shadow-[0_18px_30px_var(--accent-glow)] disabled:opacity-50">
                    {editingEntryId ? "Save entry" : "Add entry"}
                  </button>
                  {editingEntryId ? (
                    <button type="button" onClick={resetForm} className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-[11px] font-black uppercase tracking-[0.2em] text-[var(--text)]">
                      Cancel
                    </button>
                  ) : null}
                </div>
              </div>
            </section>

            <section className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)]">
              <div className="space-y-3">
                {(campaign?.entryPoints || []).length ? (
                  campaign.entryPoints.map((entry: any) => (
                    <div key={entry.id} className="rounded-[1.1rem] border border-[var(--line)] bg-[var(--surface-strong)] p-4">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <div className="text-sm font-semibold text-[var(--text)]">{entry.name || entry.entry_key}</div>
                          <div className="mt-1 text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
                            {entry.entry_type || "generic"} · {entry.is_active ? "active" : "inactive"}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button type="button" onClick={() => startEdit(entry)} disabled={!canEditProjectCampaign} className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text)] disabled:opacity-50">Edit</button>
                          <button type="button" onClick={() => handleDelete(entry.id)} disabled={!canDeleteProjectCampaign} className="rounded-xl border border-rose-300/35 bg-rose-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-rose-200 disabled:opacity-50">Delete</button>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface-strong)] px-4 py-6 text-sm text-[var(--muted)]">
                    No entry points configured yet.
                  </div>
                )}
              </div>
              <div className="mt-5">
                <Link href={`/campaigns/${campaignId}/audience`} className="text-sm font-medium text-[var(--accent)]">
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
