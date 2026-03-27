import { useEffect, useMemo, useState } from "react";
import { Activity, Filter, Globe, RefreshCw, Route, Search, SlidersHorizontal, Trash2 } from "lucide-react";

import PageAccessNotice from "../components/access/PageAccessNotice";
import DashboardLayout from "../components/layout/DashboardLayout";
import { useVisibility } from "../hooks/useVisibility";
import {
  campaignService,
  CampaignDetail,
  CampaignSummary,
} from "../services/campaignService";
import { leadService } from "../services/leadService";
import { useAuthStore } from "../store/authStore";

const PLATFORMS = ["whatsapp", "website", "facebook", "instagram", "api", "telegram"];
const STATUS_OPTIONS = ["new", "captured", "qualified", "engaged"];

function formatPlatformLabel(platform: string) {
  const normalized = String(platform || "").trim().toLowerCase();
  if (!normalized) return "Unknown";
  return normalized === "api"
    ? "API"
    : normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function formatStatusLabel(status: string) {
  const normalized = String(status || "").trim().toLowerCase();
  if (!normalized) return "Unknown";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function formatTimestamp(value?: string | null) {
  if (!value) return "Not synced yet";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return "Not synced yet";
  }
}

function getSourceBadgeClass(platform: string) {
  const normalized = String(platform || "").trim().toLowerCase();
  if (normalized === "whatsapp") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (normalized === "instagram") return "bg-rose-50 text-rose-700 border-rose-200";
  if (normalized === "facebook") return "bg-blue-50 text-blue-700 border-blue-200";
  if (normalized === "telegram") return "bg-cyan-50 text-cyan-700 border-cyan-200";
  if (normalized === "website") return "bg-violet-50 text-violet-700 border-violet-200";
  if (normalized === "api") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-slate-100 text-slate-600 border-slate-200";
}

function getResolvedLeadFlowName(
  lead: any,
  campaignDetailsById: Record<string, CampaignDetail>
) {
  if (lead?.flow_name) {
    return lead.flow_name;
  }

  const campaignId = String(lead?.campaign_id || "").trim();
  const entryPointId = String(lead?.entry_point_id || "").trim();
  if (!campaignId || !entryPointId) {
    return "";
  }

  const detail = campaignDetailsById[campaignId];
  const matchingEntry = Array.isArray(detail?.entryPoints)
    ? detail.entryPoints.find((entry: any) => String(entry.id || "").trim() === entryPointId)
    : null;

  return String(matchingEntry?.flow_name || matchingEntry?.name || "").trim();
}

export default function LeadsPage() {
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);
  const activeProject = useAuthStore((state) => state.activeProject);
  const hasWorkspacePermission = useAuthStore((state) => state.hasWorkspacePermission);
  const { canViewPage } = useVisibility();

  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [campaignDetailsById, setCampaignDetailsById] = useState<Record<string, CampaignDetail>>({});
  const [campaignDetail, setCampaignDetail] = useState<CampaignDetail | null>(null);
  const [listSummaries, setListSummaries] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [filters, setFilters] = useState({
    platform: "",
    campaignId: "",
    channelId: "",
    entryPointId: "",
    flowId: "",
    listId: "",
    status: "",
    search: "",
  });

  const canViewLeads = hasWorkspacePermission(activeWorkspace?.workspace_id, "view_leads");
  const canDeleteLeads = hasWorkspacePermission(activeWorkspace?.workspace_id, "delete_leads");
  const canViewLeadsPage = canViewPage("leads");

  const loadCampaigns = async () => {
    if (!activeWorkspace?.workspace_id || !activeProject?.id) {
      setCampaigns([]);
      setCampaignDetailsById({});
      return;
    }
    try {
      const data = await campaignService.list({
        workspaceId: activeWorkspace.workspace_id,
        projectId: activeProject.id,
      });
      setCampaigns(data);

      const detailEntries = await Promise.all(
        data.map(async (campaign) => {
          try {
            const detail = await campaignService.get(campaign.id);
            return [campaign.id, detail] as const;
          } catch {
            return [campaign.id, null] as const;
          }
        })
      );

      setCampaignDetailsById(
        detailEntries.reduce<Record<string, CampaignDetail>>((acc, [campaignId, detail]) => {
          if (detail) {
            acc[campaignId] = detail;
          }
          return acc;
        }, {})
      );
    } catch (error: any) {
      setErrorMessage(error?.message || "Failed to load campaigns.");
    }
  };

  const loadLeadLists = async (campaignId?: string) => {
    try {
      const data = await leadService.listSummaries(
        campaignId || undefined,
        activeWorkspace?.workspace_id || undefined,
        activeProject?.id || undefined
      );
      setListSummaries(data);
    } catch (error: any) {
      setErrorMessage(error?.message || "Failed to load lead lists.");
    }
  };

  const loadLeads = async (nextFilters = filters) => {
    if (!activeWorkspace?.workspace_id || !activeProject?.id) {
      setLeads([]);
      setLoading(false);
      return;
    }
    if (!canViewLeads) {
      setLeads([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      setErrorMessage(null);
      const data = await leadService.list({
        ...nextFilters,
        workspaceId: activeWorkspace.workspace_id,
        projectId: activeProject.id,
      });
      setLeads(data);
      setLastSyncedAt(new Date().toISOString());
      if (selectedLead) {
        const refreshed = data.find((lead: any) => lead.id === selectedLead.id);
        setSelectedLead(refreshed || null);
      }
    } catch (error: any) {
      setErrorMessage(error?.message || "Failed to load leads.");
      setLeads([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!canViewLeadsPage) {
      setCampaigns([]);
      setCampaignDetailsById({});
      setListSummaries([]);
      setLeads([]);
      setLoading(false);
      return;
    }

    loadCampaigns()
      .then(() => loadLeadLists())
      .then(() => loadLeads())
      .catch(console.error);
  }, [activeWorkspace?.workspace_id, activeProject?.id, canViewLeads, canViewLeadsPage]);

  useEffect(() => {
    if (!filters.campaignId) {
      setCampaignDetail(null);
      return;
    }

    const detail = campaignDetailsById[filters.campaignId];
    if (detail) {
      setCampaignDetail(detail);
      return;
    }

    campaignService.get(filters.campaignId).then(setCampaignDetail).catch(console.error);
  }, [filters.campaignId, campaignDetailsById]);

  useEffect(() => {
    if (!canViewLeadsPage) {
      return;
    }
    loadLeadLists(filters.campaignId).catch(console.error);
    loadLeads(filters).catch(console.error);
  }, [filters, activeWorkspace?.workspace_id, activeProject?.id, canViewLeads, canViewLeadsPage]);

  const campaignsForPlatform = useMemo(() => {
    if (!filters.platform) {
      return campaigns;
    }

    return campaigns.filter((campaign) => {
      const detail = campaignDetailsById[campaign.id];
      if (!detail?.channels?.length) {
        return false;
      }
      return detail.channels.some(
        (channel: any) =>
          String(channel.platform || channel.platform_type || "").trim().toLowerCase() ===
          filters.platform
      );
    });
  }, [campaigns, campaignDetailsById, filters.platform]);

  const availableChannels = useMemo(() => {
    const channels = campaignDetail?.channels || [];
    if (!filters.platform) {
      return channels;
    }
    return channels.filter(
      (channel: any) =>
        String(channel.platform || channel.platform_type || "").trim().toLowerCase() ===
        filters.platform
    );
  }, [campaignDetail, filters.platform]);

  const availableEntryPoints = useMemo(() => {
    const entries = campaignDetail?.entryPoints || [];
    return entries.filter((entry: any) => {
      if (filters.channelId && entry.channel_id !== filters.channelId) {
        return false;
      }
      return true;
    });
  }, [campaignDetail, filters.channelId]);

  const availableFlowOptions = useMemo(
    () =>
      availableEntryPoints.reduce((acc: any[], entry: any) => {
        if (!entry.flow_id) {
          return acc;
        }

        if (acc.some((item) => item.id === entry.flow_id)) {
          return acc;
        }

        acc.push({
          id: entry.flow_id,
          name: entry.flow_name || entry.name || "Unnamed flow",
        });
        return acc;
      }, []),
    [availableEntryPoints]
  );

  const availableLists = useMemo(() => {
    const scopedLists = filters.campaignId
      ? listSummaries.filter((list) => {
          if (list.campaign_id !== filters.campaignId) {
            return false;
          }
          if (filters.channelId && list.channel_id !== filters.channelId) {
            return false;
          }
          if (filters.entryPointId && list.entry_point_id !== filters.entryPointId) {
            return false;
          }
          return true;
        })
      : listSummaries;

    if (!filters.platform) {
      return scopedLists;
    }

    return scopedLists.filter(
      (list) => String(list.platform || "").trim().toLowerCase() === filters.platform
    );
  }, [filters.campaignId, filters.channelId, filters.entryPointId, filters.platform, listSummaries]);

  const selectedLeadFlowName = selectedLead
    ? getResolvedLeadFlowName(selectedLead, campaignDetailsById)
    : "";

  const selectedLeadFlowProgress = selectedLead
    ? [
        selectedLead.campaign_name || "No campaign",
        selectedLead.entry_point_name || "Default entry",
        selectedLeadFlowName || "Default flow",
        selectedLead.list_name || "Auto list",
      ]
    : [];

  const handleDelete = async (id: string) => {
    if (!canDeleteLeads) {
      return;
    }
    await leadService.remove(id);
    await loadLeads();
    if (selectedLead?.id === id) {
      setSelectedLead(null);
    }
  };

  const handleRefresh = async () => {
    await loadLeadLists(filters.campaignId);
    await loadLeads(filters);
  };

  return (
    <DashboardLayout>
      {!canViewLeadsPage ? (
        <PageAccessNotice
          title="Leads are restricted for this role"
          description="Lead visibility follows workspace, project, and assigned-scope rules. Platform operators should stay in support tools."
          href="/"
          ctaLabel="Open dashboard"
        />
      ) : (
        <div className="min-h-screen space-y-5">
          {!activeWorkspace?.workspace_id || !activeProject?.id ? (
            <div className="rounded-[1.5rem] border border-dashed border-[var(--line)] bg-[var(--surface)] p-8 text-sm text-[var(--muted)]">
              Select a workspace and project first. Leads are shown inside the active project only.
            </div>
          ) : !canViewLeads ? (
            <div className="rounded-[1.5rem] border border-dashed border-amber-200 bg-amber-50 p-8 text-sm text-amber-700">
              Lead visibility is restricted for your current workspace role. Ask an admin to grant the{" "}
              <span className="font-semibold">view leads</span> permission if you need access.
            </div>
          ) : null}

          {errorMessage ? (
            <div className="rounded-[1.25rem] border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
              {errorMessage}
            </div>
          ) : null}

          <div className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-sm">
            <div className="space-y-4">
              <div className="grid gap-3 xl:grid-cols-[220px_1fr_auto]">
                <select
                  className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm"
                  value={filters.platform}
                  onChange={(event) =>
                    setFilters((prev) => ({
                      ...prev,
                      platform: event.target.value,
                      campaignId: "",
                      channelId: "",
                      entryPointId: "",
                      flowId: "",
                      listId: "",
                    }))
                  }
                >
                  <option value="">All platforms</option>
                  {PLATFORMS.map((platform) => (
                    <option key={platform} value={platform}>
                      {formatPlatformLabel(platform)}
                    </option>
                  ))}
                </select>

                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm"
                    placeholder="Search lead, phone, email..."
                    value={filters.search}
                    onChange={(event) =>
                      setFilters((prev) => ({ ...prev, search: event.target.value }))
                    }
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setShowAdvancedFilters((prev) => !prev)}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[11px] font-black uppercase tracking-[0.18em] text-slate-700 transition hover:bg-slate-50"
                  >
                    <SlidersHorizontal size={14} />
                    {showAdvancedFilters ? "Hide filters" : "More filters"}
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.22em] text-slate-600">
                    <Filter size={12} />
                    Status
                  </div>
                  <button
                    onClick={() => setFilters((prev) => ({ ...prev, status: "" }))}
                    className={`rounded-full px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em] transition ${
                      !filters.status
                        ? "bg-slate-900 text-white"
                        : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    All
                  </button>
                  {STATUS_OPTIONS.map((status) => (
                    <button
                      key={status}
                      onClick={() => setFilters((prev) => ({ ...prev, status }))}
                      className={`rounded-full px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em] transition ${
                        filters.status === status
                          ? "bg-slate-900 text-white"
                          : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {formatStatusLabel(status)}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700">
                    <Activity size={14} />
                    Last sync {formatTimestamp(lastSyncedAt)}
                  </div>
                  <button
                    onClick={handleRefresh}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    <RefreshCw size={14} />
                    Refresh
                  </button>
                </div>
              </div>

              {showAdvancedFilters ? (
                <div className="grid gap-3 xl:grid-cols-5">
                  <select
                    className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                    value={filters.campaignId}
                    onChange={(event) =>
                      setFilters((prev) => ({
                        ...prev,
                        campaignId: event.target.value,
                        channelId: "",
                        entryPointId: "",
                        flowId: "",
                        listId: "",
                      }))
                    }
                  >
                    <option value="">All campaigns</option>
                    {campaignsForPlatform.map((campaign) => (
                      <option key={campaign.id} value={campaign.id}>
                        {campaign.name}
                      </option>
                    ))}
                  </select>

                  <select
                    className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                    value={filters.flowId}
                    onChange={(event) =>
                      setFilters((prev) => ({ ...prev, flowId: event.target.value }))
                    }
                    disabled={!filters.campaignId}
                  >
                    <option value="">All flows</option>
                    {availableFlowOptions.map((flow: any) => (
                      <option key={flow.id} value={flow.id}>
                        {flow.name}
                      </option>
                    ))}
                  </select>

                  <select
                    className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                    value={filters.listId}
                    onChange={(event) =>
                      setFilters((prev) => ({ ...prev, listId: event.target.value }))
                    }
                  >
                    <option value="">All lists</option>
                    {availableLists.map((list) => (
                      <option key={list.id} value={list.id}>
                        {list.name}
                      </option>
                    ))}
                  </select>

                  <select
                    className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm"
                    value={filters.channelId}
                    onChange={(event) =>
                      setFilters((prev) => ({
                        ...prev,
                        channelId: event.target.value,
                        entryPointId: "",
                        listId: "",
                      }))
                    }
                    disabled={!filters.campaignId}
                  >
                    <option value="">All channels</option>
                    {availableChannels.map((channel: any) => (
                      <option key={channel.id} value={channel.id}>
                        {channel.name}
                      </option>
                    ))}
                  </select>

                  <select
                    className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm"
                    value={filters.entryPointId}
                    onChange={(event) =>
                      setFilters((prev) => ({
                        ...prev,
                        entryPointId: event.target.value,
                        listId: "",
                      }))
                    }
                    disabled={!filters.campaignId}
                  >
                    <option value="">All entry points</option>
                    {availableEntryPoints.map((entry: any) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-[2.25fr_0.75fr]">
            <div className="overflow-hidden rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface)] shadow-sm">
              <div className="flex items-center justify-between border-b border-[var(--line)] bg-[var(--surface-muted)] px-6 py-4">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                    Lead Journey Table
                  </div>
                  <div className="mt-1 text-sm text-[var(--muted)]">
                    Source, route, and state in one place.
                  </div>
                </div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                  {loading ? "Loading..." : `${leads.length} rows`}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="border-b border-slate-200 bg-white text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">
                    <tr>
                      <th className="px-6 py-4">Lead</th>
                      <th className="px-6 py-4">Source</th>
                      <th className="px-6 py-4">Campaign</th>
                      <th className="px-6 py-4">Journey</th>
                      <th className="px-6 py-4">Current State</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {leads.map((lead: any) => (
                      <tr
                        key={lead.id}
                        onClick={() => setSelectedLead(lead)}
                        className={`cursor-pointer transition hover:bg-slate-50 ${
                          selectedLead?.id === lead.id ? "bg-slate-50" : ""
                        }`}
                      >
                        <td className="px-6 py-4">
                          <div className="font-bold text-slate-900">
                            {lead.name || lead.wa_name || "Unknown"}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {lead.phone || lead.wa_number || "No phone"}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {lead.email || "No email"}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${getSourceBadgeClass(
                              lead.platform || ""
                            )}`}
                          >
                            {formatPlatformLabel(lead.platform || "unknown")}
                          </span>
                        </td>
                        <td className="min-w-[220px] px-6 py-4 text-sm text-slate-700">
                          <div className="font-semibold text-slate-800">
                            {lead.campaign_name || "Unassigned"}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {lead.entry_point_name || "Default entry"}
                          </div>
                        </td>
                        <td className="min-w-[240px] px-6 py-4 text-sm text-slate-700">
                          <div className="font-semibold text-slate-800">
                            {getResolvedLeadFlowName(lead, campaignDetailsById) || "Default flow"}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {lead.list_name || "Auto list"}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-semibold text-slate-800">
                            {formatStatusLabel(lead.status || "new")}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {lead.platform ? `Last seen on ${formatPlatformLabel(lead.platform)}` : "Source pending"}
                          </div>
                        </td>
                      </tr>
                    ))}

                    {!loading && leads.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-sm text-slate-500">
                          No leads found for the selected filter set.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-5">
              <div className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
                <div className="mb-4 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                  <Route size={14} />
                  Lead Context
                </div>

                {!selectedLead ? (
                  <div className="text-sm leading-6 text-slate-500">
                    Select a lead to inspect its current route, source, and attribution context.
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-lg font-black text-slate-900">
                        {selectedLead.name || selectedLead.wa_name || "Unknown"}
                      </div>
                      <div className="mt-2 text-sm text-slate-500">
                        {selectedLead.phone || selectedLead.wa_number || "No phone"} ·{" "}
                        {selectedLead.email || "No email"}
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 p-4">
                      <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                        <Globe size={12} />
                        Source Badge
                      </div>
                      <span
                        className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${getSourceBadgeClass(
                          selectedLead.platform || ""
                        )}`}
                      >
                        {formatPlatformLabel(selectedLead.platform || "unknown")}
                      </span>
                    </div>

                    <div className="rounded-xl border border-slate-200 p-4">
                      <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                        <Activity size={12} />
                        Current Route
                      </div>
                      <div className="space-y-2 text-sm font-semibold text-slate-800">
                        {selectedLeadFlowProgress.map((item, index) => (
                          <div key={`${item}-${index}`} className="flex items-center gap-2">
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-[10px] font-black text-slate-600">
                              {index + 1}
                            </span>
                            <span>{item}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 p-4">
                      <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                        <Filter size={12} />
                        Current State
                      </div>
                      <div className="text-sm font-semibold text-slate-800">
                        {formatStatusLabel(selectedLead.status || "new")}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        Deep runtime waiting/delay state can be added here once the backend exposes it directly.
                      </div>
                    </div>

                    {availableLists.length > 0 ? (
                      <div className="rounded-xl border border-slate-200 p-4">
                        <div className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                          Available Lists
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {availableLists.slice(0, 4).map((list) => (
                            <span
                              key={list.id}
                              className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-600"
                            >
                              {list.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {canDeleteLeads ? (
                      <button
                        onClick={() => handleDelete(selectedLead.id)}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-[11px] font-black uppercase tracking-[0.2em] text-red-600 transition hover:bg-red-100"
                      >
                        <Trash2 size={14} />
                        Delete Lead
                      </button>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
