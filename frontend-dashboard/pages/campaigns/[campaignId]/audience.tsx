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
import { useAuthStore } from "../../../store/authStore";

const EMPTY_LIST_FORM = {
  botId: "",
  platform: "whatsapp",
  name: "",
  listKey: "",
  sourceType: "manual",
};

export default function CampaignAudiencePage() {
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
  const [listForm, setListForm] = useState(EMPTY_LIST_FORM);
  const [editingListId, setEditingListId] = useState<string | null>(null);
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

  const loadPage = async () => {
    if (!campaignId) {
      return;
    }
    const detail = (await campaignService.get(String(campaignId))) as any;
    detail.lists = await campaignService.getAudience(String(campaignId));
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
    const botRows = await botService.getBots({ workspaceId, projectId }).catch(() => []);
    setBots(botRows);
  };

  useEffect(() => {
    if (!campaignId || !canViewCampaignPage) {
      setCampaign(null);
      return;
    }
    loadPage().catch((err: any) => {
      console.error("Failed to load campaign audience", err);
      setError(err?.response?.data?.error || "Failed to load campaign audience");
    });
  }, [campaignId, canViewCampaignPage, activeProject?.id, activeProject?.name, activeProject?.status, setActiveProject]);

  const startEdit = (list: any) => {
    setEditingListId(list.id);
    setListForm({
      botId: list.bot_id || "",
      platform: list.platform || "whatsapp",
      name: list.name || "",
      listKey: list.list_key || "",
      sourceType: list.source_type || "manual",
    });
  };

  const resetForm = () => {
    setEditingListId(null);
    setListForm(EMPTY_LIST_FORM);
  };

  const handleSave = async () => {
    if (!campaignId) {
      return;
    }

    try {
      setBusy(true);
      setError("");
      setSuccess("");
      const payload = { ...listForm };
      if (editingListId) {
        await campaignService.updateAudienceInCampaign(
          String(campaignId),
          editingListId,
          payload
        );
      } else {
        await campaignService.createAudienceInCampaign(String(campaignId), payload);
      }
      resetForm();
      await loadPage();
      setSuccess(editingListId ? "Audience list updated." : "Audience list created.");
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to save audience list");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (listId: string) => {
    try {
      setBusy(true);
      setError("");
      await campaignService.deleteAudienceInCampaign(String(campaignId), listId);
      if (editingListId === listId) {
        resetForm();
      }
      await loadPage();
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to delete audience list");
    } finally {
      setBusy(false);
    }
  };

  return (
    <DashboardLayout>
      {!canViewCampaignPage ? (
        <PageAccessNotice
          title="Campaign audience is restricted for this role"
          description="Campaign pages are only available to users with campaign or assigned project access."
          href="/campaigns"
          ctaLabel="Open campaigns"
        />
      ) : (
        <div className="mx-auto max-w-7xl space-y-6">
          <BackButtonStrip href={`/campaigns/${campaignId}/entries`} label="Back to entry points" />
          <CampaignHeader
            campaignName={campaign?.name}
            pageTitle="Campaign Audience"
            description="Manage the contact lists and segments targeted by this campaign."
            tabs={tabs}
            currentPath={router.asPath.split("?")[0] || ""}
          />

          {error ? <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</section> : null}
          {success ? <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{success}</section> : null}

          <section className="rounded-[2rem] border border-border-main bg-surface p-8 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.22em] text-text-muted">
                  Saved segments
                </div>
                <div className="mt-1 text-sm text-text-muted">
                  Reusable audience slices and suppression lists are stored as first-class campaign lists.
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="rounded-full border border-border-main bg-canvas px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">
                  Segments: {(campaign?.lists || []).filter((list: any) => String(list.source_type || "").toLowerCase() === "segment").length}
                </div>
                <div className="rounded-full border border-border-main bg-canvas px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">
                  Suppressions: {(campaign?.lists || []).filter((list: any) => String(list.source_type || "").toLowerCase() === "suppression").length}
                </div>
              </div>
            </div>
          </section>

          <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
            <section className="flex h-auto min-h-[500px] flex-col rounded-[2rem] border border-border-main bg-surface p-8 shadow-sm">
              <div className="space-y-4">
                <select className="w-full rounded-xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50" value={listForm.botId} disabled={!canEditProjectCampaign} onChange={(event) => setListForm((current) => ({ ...current, botId: event.target.value }))}>
                  <option value="">Select bot</option>
                  {bots.map((bot) => <option key={bot.id} value={bot.id}>{bot.name}</option>)}
                </select>
                <input className="w-full rounded-xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50" placeholder="List name" value={listForm.name} disabled={!canEditProjectCampaign} onChange={(event) => setListForm((current) => ({ ...current, name: event.target.value }))} />
                <input className="w-full rounded-xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50" placeholder="List key" value={listForm.listKey} disabled={!canEditProjectCampaign} onChange={(event) => setListForm((current) => ({ ...current, listKey: event.target.value }))} />
                <select className="w-full rounded-xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50" value={listForm.platform} disabled={!canEditProjectCampaign} onChange={(event) => setListForm((current) => ({ ...current, platform: event.target.value }))}>
                  <option value="whatsapp">whatsapp</option>
                  <option value="website">website</option>
                  <option value="facebook">facebook</option>
                  <option value="instagram">instagram</option>
                  <option value="telegram">telegram</option>
                  <option value="api">api</option>
                </select>
                <select className="w-full rounded-xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50" value={listForm.sourceType} disabled={!canEditProjectCampaign} onChange={(event) => setListForm((current) => ({ ...current, sourceType: event.target.value }))}>
                  <option value="manual">manual</option>
                  <option value="campaign">campaign</option>
                  <option value="import">import</option>
                  <option value="segment">segment</option>
                  <option value="suppression">suppression</option>
                  <option value="entry_point">entry_point</option>
                </select>
                <div className="flex gap-3">
                  <button type="button" onClick={handleSave} disabled={busy || !canEditProjectCampaign} className="flex-1 rounded-2xl border border-primary bg-primary py-3 px-6 text-[10px] font-black uppercase tracking-[0.15em] text-white shadow-sm transition-all hover:-translate-y-0.5 active:scale-95 disabled:opacity-50">
                    {editingListId ? "Save list" : "Add list"}
                  </button>
                  {editingListId ? (
                    <button type="button" onClick={resetForm} className="rounded-2xl border border-border-main bg-canvas py-3 px-6 text-[10px] font-black uppercase tracking-[0.15em] text-text-main transition-all hover:bg-surface active:scale-95">
                      Cancel
                    </button>
                  ) : null}
                </div>
              </div>
            </section>

            <section className="flex h-auto min-h-[500px] flex-col rounded-[2rem] border border-border-main bg-surface p-8 shadow-sm">
              <div className="space-y-3">
                {(campaign?.lists || []).length ? (
                  campaign.lists.map((list: any) => (
                    <div key={list.id} className="rounded-xl border border-border-main bg-canvas p-4 transition-colors hover:border-primary/30 hover:bg-primary/5">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <div className="text-sm font-semibold text-[var(--text)]">{list.name}</div>
                          <div className="mt-1 text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
                            {list.platform} · {list.source_type}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {!list.is_system ? (
                            <button type="button" onClick={() => startEdit(list)} disabled={!canEditProjectCampaign} className="rounded-2xl border border-border-main bg-canvas py-3 px-6 text-[10px] font-black uppercase tracking-[0.15em] text-text-main transition-all hover:bg-surface active:scale-95 disabled:opacity-50">Edit</button>
                          ) : null}
                          <button type="button" onClick={() => handleDelete(list.id)} disabled={Boolean(list.is_system) || !canDeleteProjectCampaign} className="rounded-2xl border border-rose-200 bg-rose-50 py-3 px-6 text-[10px] font-black uppercase tracking-[0.15em] text-rose-700 transition-all hover:-translate-y-0.5 active:scale-95 disabled:opacity-50">Delete</button>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-border-main bg-canvas px-4 py-6 text-sm text-text-muted">
                    No campaign lists configured yet.
                  </div>
                )}
              </div>
              <div className="mt-5">
                <Link href={`/campaigns/${campaignId}/launch`} className="text-sm font-black uppercase tracking-[0.15em] text-primary">
                  Continue to launch
                </Link>
              </div>
            </section>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
