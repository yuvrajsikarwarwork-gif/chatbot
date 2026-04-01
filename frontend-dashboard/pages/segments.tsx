import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import PageAccessNotice from "../components/access/PageAccessNotice";
import DashboardLayout from "../components/layout/DashboardLayout";
import SectionTabs from "../components/navigation/SectionTabs";
import { useVisibility } from "../hooks/useVisibility";
import { campaignService } from "../services/campaignService";
import { segmentService, type SegmentLibraryRecord } from "../services/segmentService";
import { botService } from "../services/botService";
import { useAuthStore } from "../store/authStore";

const EMPTY_FORM = {
  campaignId: "",
  botId: "",
  platform: "whatsapp",
  name: "",
  listKey: "",
  sourceType: "segment",
  isSystem: false,
};

export default function SegmentLibraryPage() {
  const { canViewPage } = useVisibility();
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);
  const activeProject = useAuthStore((state) => state.activeProject);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [bots, setBots] = useState<any[]>([]);
  const [segments, setSegments] = useState<SegmentLibraryRecord[]>([]);
  const [campaignFilter, setCampaignFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingSegmentId, setEditingSegmentId] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const canViewAdminPage = canViewPage("campaigns");
  const tabs = useMemo(
    () => [
      { label: "Campaigns", href: "/campaigns" },
      { label: "Segments", href: "/segments" },
      { label: "Audience", href: `/campaigns/${campaignFilter || campaigns[0]?.id || ""}/audience` },
    ],
    [campaignFilter, campaigns]
  );

  const loadPage = async () => {
    setLoading(true);
    setError("");
    try {
      const workspaceId = activeWorkspace?.workspace_id;
      const projectId = activeProject?.id;
      const [campaignRows, segmentRows, botRows] = await Promise.all([
        campaignService.list({ workspaceId, projectId }).catch(() => []),
        segmentService.list({
          workspaceId,
          projectId,
          ...(campaignFilter ? { campaignId: campaignFilter } : {}),
          ...(sourceFilter ? { sourceType: sourceFilter } : {}),
        }),
        botService.getBots({ workspaceId, projectId }).catch(() => []),
      ]);
      setCampaigns(Array.isArray(campaignRows) ? campaignRows : []);
      setSegments(Array.isArray(segmentRows) ? segmentRows : []);
      setBots(Array.isArray(botRows) ? botRows : []);
      if (!form.campaignId && Array.isArray(campaignRows) && campaignRows[0]?.id) {
        setForm((current) => ({ ...current, campaignId: String(campaignRows[0].id) }));
      }
      if (!campaignFilter && Array.isArray(campaignRows) && campaignRows[0]?.id) {
        setCampaignFilter(String(campaignRows[0].id));
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to load segment library");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!canViewAdminPage) {
      return;
    }
    loadPage().catch((err: any) => {
      setError(err?.response?.data?.error || "Failed to load segment library");
    });
  }, [canViewAdminPage, activeWorkspace?.workspace_id, activeProject?.id, campaignFilter, sourceFilter]);

  const startEdit = (segment: SegmentLibraryRecord) => {
    setEditingSegmentId(segment.id);
    setForm({
      campaignId: segment.campaignId,
      botId: segment.botId || "",
      platform: segment.platform,
      name: segment.name,
      listKey: segment.listKey,
      sourceType: segment.sourceType,
      isSystem: segment.isSystem,
    });
  };

  const resetForm = () => {
    setEditingSegmentId("");
    setForm((current) => ({
      ...EMPTY_FORM,
      campaignId: current.campaignId || campaigns[0]?.id || "",
    }));
  };

  const handleSave = async () => {
    if (!form.campaignId) {
      setError("Select a campaign first.");
      return;
    }
    try {
      setSaving(true);
      setError("");
      setSuccess("");
      const payload = {
        botId: form.botId,
        platform: form.platform,
        name: form.name,
        listKey: form.listKey,
        sourceType: form.sourceType,
        isSystem: form.isSystem,
      };
      if (editingSegmentId) {
        await campaignService.updateAudienceInCampaign(form.campaignId, editingSegmentId, payload);
      } else {
        await campaignService.createAudienceInCampaign(form.campaignId, payload);
      }
      setSuccess(editingSegmentId ? "Segment updated." : "Segment created.");
      resetForm();
      await loadPage();
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to save segment");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (segment: SegmentLibraryRecord) => {
    try {
      setSaving(true);
      setError("");
      await campaignService.deleteAudienceInCampaign(segment.campaignId, segment.id);
      if (editingSegmentId === segment.id) {
        resetForm();
      }
      setSuccess("Segment removed.");
      await loadPage();
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to delete segment");
    } finally {
      setSaving(false);
    }
  };

  const visibleSegments = segments.filter((segment) => {
    const haystack = [
      segment.name,
      segment.listKey,
      segment.campaignName,
      segment.platform,
      segment.sourceType,
    ]
      .join(" ")
      .toLowerCase();
    return !search || haystack.includes(search.toLowerCase());
  });

  return (
    <DashboardLayout>
      {!canViewAdminPage ? (
        <PageAccessNotice
          title="Segment library is restricted for this role"
          description="Campaign and segment management is only available to users with campaign access."
          href="/campaigns"
          ctaLabel="Open campaigns"
        />
      ) : (
        <div className="mx-auto max-w-7xl space-y-6">
          <header className="rounded-[1.75rem] border border-border-main bg-surface p-6 shadow-[var(--shadow-soft)]">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted">Segments</div>
                <h1 className="mt-3 text-[1.6rem] font-semibold tracking-tight text-text-main">Saved segment library</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">
                  Create, name, edit, and reuse campaign audience slices and suppression lists across campaigns from one manager.
                </p>
              </div>
              <SectionTabs items={tabs} currentPath="/segments" />
            </div>
          </header>

          {error ? <section className="rounded-[1.5rem] border border-rose-300/40 bg-rose-500/10 p-4 text-sm text-rose-700">{error}</section> : null}
          {success ? <section className="rounded-[1.5rem] border border-emerald-300/35 bg-emerald-500/10 p-4 text-sm text-emerald-700">{success}</section> : null}

          <section className="grid gap-3 md:grid-cols-4">
            {[
              { label: "Segments", value: segments.length },
              { label: "Campaigns", value: campaigns.length },
              { label: "Visible", value: visibleSegments.length },
              { label: "Suppression", value: segments.filter((segment) => String(segment.sourceType).toLowerCase() === "suppression").length },
            ].map((card) => (
              <div key={card.label} className="rounded-2xl border border-border-main bg-surface px-4 py-3">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">{card.label}</div>
                <div className="mt-1 text-lg font-semibold text-text-main">{card.value}</div>
              </div>
            ))}
          </section>

          <section className="rounded-[1.5rem] border border-border-main bg-surface p-6 shadow-sm">
            <div className="grid gap-3 md:grid-cols-3">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search segments"
                className="rounded-2xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main outline-none placeholder:text-text-muted"
              />
              <select
                value={campaignFilter}
                onChange={(e) => setCampaignFilter(e.target.value)}
                className="rounded-2xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main outline-none"
              >
                <option value="">All campaigns</option>
                {campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </option>
                ))}
              </select>
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="rounded-2xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main outline-none"
              >
                <option value="">All sources</option>
                <option value="manual">manual</option>
                <option value="campaign">campaign</option>
                <option value="segment">segment</option>
                <option value="suppression">suppression</option>
                <option value="import">import</option>
                <option value="entry_point">entry_point</option>
              </select>
            </div>
          </section>

          <section className="grid gap-6 xl:grid-cols-[420px_1fr]">
            <div className="rounded-[1.5rem] border border-border-main bg-surface p-6 shadow-sm">
              <div className="space-y-4">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">
                    {editingSegmentId ? "Edit segment" : "New segment"}
                  </div>
                  <div className="mt-1 text-sm text-text-muted">
                    Use one campaign as the source of truth, then reuse this segment in launch flows and suppression rules.
                  </div>
                </div>
                <select
                  value={form.campaignId}
                  disabled={loading}
                  onChange={(event) => setForm((current) => ({ ...current, campaignId: event.target.value }))}
                  className="w-full rounded-2xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main outline-none"
                >
                  <option value="">Select campaign</option>
                  {campaigns.map((campaign) => (
                    <option key={campaign.id} value={campaign.id}>
                      {campaign.name}
                    </option>
                  ))}
                </select>
                <select
                  value={form.botId}
                  disabled={loading}
                  onChange={(event) => setForm((current) => ({ ...current, botId: event.target.value }))}
                  className="w-full rounded-2xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main outline-none"
                >
                  <option value="">Select bot</option>
                  {bots.map((bot) => (
                    <option key={bot.id} value={bot.id}>
                      {bot.name}
                    </option>
                  ))}
                </select>
                <input
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Segment name"
                  className="w-full rounded-2xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main outline-none placeholder:text-text-muted"
                />
                <input
                  value={form.listKey}
                  onChange={(event) => setForm((current) => ({ ...current, listKey: event.target.value }))}
                  placeholder="Segment key"
                  className="w-full rounded-2xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main outline-none placeholder:text-text-muted"
                />
                <select
                  value={form.platform}
                  onChange={(event) => setForm((current) => ({ ...current, platform: event.target.value }))}
                  className="w-full rounded-2xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main outline-none"
                >
                  <option value="whatsapp">whatsapp</option>
                  <option value="website">website</option>
                  <option value="facebook">facebook</option>
                  <option value="instagram">instagram</option>
                  <option value="telegram">telegram</option>
                  <option value="api">api</option>
                </select>
                <select
                  value={form.sourceType}
                  onChange={(event) => setForm((current) => ({ ...current, sourceType: event.target.value }))}
                  className="w-full rounded-2xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main outline-none"
                >
                  <option value="manual">manual</option>
                  <option value="campaign">campaign</option>
                  <option value="segment">segment</option>
                  <option value="suppression">suppression</option>
                  <option value="import">import</option>
                  <option value="entry_point">entry_point</option>
                </select>
                <label className="flex items-center gap-3 rounded-2xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main">
                  <input
                    type="checkbox"
                    checked={form.isSystem}
                    onChange={(event) => setForm((current) => ({ ...current, isSystem: event.target.checked }))}
                  />
                  System list
                </label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="flex-1 rounded-2xl border border-primary bg-primary px-4 py-3 text-[11px] font-black uppercase tracking-[0.2em] text-white disabled:opacity-50"
                  >
                    {saving ? "Saving..." : editingSegmentId ? "Save segment" : "Create segment"}
                  </button>
                  {editingSegmentId ? (
                    <button
                      type="button"
                      onClick={resetForm}
                      className="rounded-2xl border border-border-main bg-canvas px-4 py-3 text-[11px] font-black uppercase tracking-[0.2em] text-text-main"
                    >
                      Cancel
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-border-main bg-surface p-6 shadow-sm">
              <div className="space-y-3">
                {loading ? (
                  <div className="rounded-2xl border border-dashed border-border-main bg-canvas px-4 py-6 text-sm text-text-muted">
                    Loading segment library...
                  </div>
                ) : visibleSegments.length ? (
                  visibleSegments.map((segment) => (
                    <div key={segment.id} className="rounded-2xl border border-border-main bg-canvas p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-text-main">{segment.name}</div>
                          <div className="mt-1 text-xs uppercase tracking-[0.18em] text-text-muted">
                            {segment.campaignName} · {segment.platform} · {segment.sourceType}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-[0.18em]">
                            <span className="rounded-full border border-border-main bg-surface px-2 py-1 text-text-muted">
                              Leads {segment.leadCount}
                            </span>
                            <span className="rounded-full border border-border-main bg-surface px-2 py-1 text-text-muted">
                              Key {segment.listKey}
                            </span>
                            {segment.isSystem ? (
                              <span className="rounded-full border border-primary bg-primary-fade px-2 py-1 text-primary">
                                System
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => startEdit(segment)}
                            className="rounded-full border border-border-main bg-surface px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-text-main"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(segment)}
                            className="rounded-full border border-rose-300/35 bg-rose-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-rose-600"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-border-main bg-canvas px-4 py-6 text-sm text-text-muted">
                    No segments match your current filters.
                  </div>
                )}
              </div>
              <div className="mt-5 flex justify-end">
                <Link href="/campaigns" className="text-sm font-medium text-primary">
                  Back to campaigns
                </Link>
              </div>
            </div>
          </section>
        </div>
      )}
    </DashboardLayout>
  );
}
