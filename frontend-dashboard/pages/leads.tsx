import { useEffect, useMemo, useState } from "react";
import { Activity, Download, Filter, Globe, RefreshCw, Route, Search, SlidersHorizontal, Trash2 } from "lucide-react";
import PageAccessNotice from "../components/access/PageAccessNotice";
import DashboardLayout from "../components/layout/DashboardLayout";
import { useVisibility } from "../hooks/useVisibility";
import { notifyApiError } from "../services/apiError";
import { campaignService, CampaignDetail, CampaignSummary } from "../services/campaignService";
import { leadFormService, type LeadFormRecord } from "../services/leadFormService";
import { leadService } from "../services/leadService";
import { useAuthStore } from "../store/authStore";

const PLATFORMS = ["whatsapp", "website", "facebook", "instagram", "api", "telegram"];
const STATUS_OPTIONS = ["new", "captured", "qualified", "engaged"];
const ATTR_KEYS = ["utm_source", "utm_medium", "entry_point_id", "channel", "campaign_id", "chat_id", "chat_url", "entry_channel"];
const CRM_PHASES = [
  {
    key: "new",
    title: "New",
    summary: "Fresh leads waiting for first review.",
  },
  {
    key: "captured",
    title: "Captured",
    summary: "Data has been collected and synced.",
  },
  {
    key: "qualified",
    title: "Qualified",
    summary: "Ready for deeper follow-up or routing.",
  },
  {
    key: "engaged",
    title: "Engaged",
    summary: "Active conversations and warm opportunities.",
  },
] as const;

const fmtPlatform = (p: string) => {
  const v = String(p || "").trim().toLowerCase();
  if (!v) return "Unknown";
  return v === "api" ? "API" : v.charAt(0).toUpperCase() + v.slice(1);
};
const fmtStatus = (s: string) => {
  const v = String(s || "").trim().toLowerCase();
  if (!v) return "Unknown";
  return v.charAt(0).toUpperCase() + v.slice(1);
};
const fmtTime = (v?: string | null) => {
  if (!v) return "Not synced yet";
  try { return new Date(v).toLocaleString(); } catch { return "Not synced yet"; }
};
const badgeClass = (p: string) => {
  const v = String(p || "").trim().toLowerCase();
  if (v === "whatsapp") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (v === "instagram") return "bg-rose-50 text-rose-700 border-rose-200";
  if (v === "facebook") return "bg-blue-50 text-blue-700 border-blue-200";
  if (v === "telegram") return "bg-cyan-50 text-cyan-700 border-cyan-200";
  if (v === "website") return "bg-violet-50 text-violet-700 border-violet-200";
  if (v === "api") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-canvas text-text-muted border-border-main";
};
const normObj = (v: unknown) => (!v || typeof v !== "object" || Array.isArray(v) ? {} : (v as Record<string, unknown>));
const labelize = (k: string) => String(k || "").replace(/[_-]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()).trim();
const fmtValue = (v: unknown) => v === null || v === undefined || v === "" ? "Not provided" : typeof v === "boolean" ? (v ? "Yes" : "No") : String(v);
const EXPORT_ATTR_KEYS = new Set(ATTR_KEYS);

function csvEscape(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/\r?\n/g, " ").replace(/"/g, '""')}"`;
}

function downloadCsv(fileName: string, rows: Record<string, unknown>[]): void {
  if (!rows.length) return;

  const headers = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row).forEach((key) => set.add(key));
      return set;
    }, new Set<string>())
  );

  const csv = [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(url);
}

function serializeLeadExportValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.map((item) => serializeLeadExportValue(item)).filter(Boolean).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function buildLeadExportRows(rows: any[]): Record<string, unknown>[] {
  return rows.map((lead: any) => {
    const customVariables = normObj(lead?.custom_variables);
    const customEntries = Object.entries(customVariables).filter(
      ([, value]) => value !== null && value !== undefined && String(value).trim() !== ""
    );
    const leadTags = Array.isArray(lead?.tags)
      ? lead.tags.map((tag: any) => String(tag?.tag || tag || "").trim()).filter(Boolean)
      : Array.isArray(lead?.tag_list)
        ? lead.tag_list.map((tag: any) => String(tag || "").trim()).filter(Boolean)
        : [];

    const nextRow: Record<string, unknown> = {
      "Lead ID": lead?.id || "",
      Name: lead?.name || lead?.wa_name || "",
      "Primary Channel": fmtPlatform(lead?.platform || lead?.channel || ""),
      "Contact Phone": lead?.phone || lead?.wa_number || "",
      "Contact Email": lead?.email || "",
      "Opt-In Status": serializeLeadExportValue(
        lead?.opt_in ??
          lead?.opt_in_status ??
          customVariables?.opt_in ??
          customVariables?.opt_in_status ??
          customVariables?.marketing_opt_in
      ),
      "Pipeline Stage": lead?.pipeline_stage || lead?.status || "",
      "Lead Status": lead?.status || "",
      "Assigned Agent": lead?.assigned_to_name || lead?.assigned_to || "",
      Tags: leadTags.join(", "),
      "Source Campaign": lead?.campaign_name || "",
      "Entry Bot / Flow": lead?.flow_name || lead?.bot_name || "",
      "Referral / UTMs": [
        customVariables.utm_source,
        customVariables.utm_medium,
        customVariables.utm_campaign,
        customVariables.utm_content,
        customVariables.utm_term,
      ]
        .map(serializeLeadExportValue)
        .filter(Boolean)
        .join(" | "),
      "Created At": lead?.created_at || "",
      "Last Interacted At": lead?.updated_at || lead?.last_interacted_at || "",
      "Agent Handoff Time":
        lead?.agent_handoff_at ||
        customVariables?.agent_handoff_at ||
        customVariables?.handoff_at ||
        lead?.handoff_at ||
        "",
      Company: lead?.company_name || "",
      Platform: lead?.platform || "",
      Campaign: lead?.campaign_name || "",
      Flow: lead?.flow_name || "",
      List: lead?.list_name || "",
      "Lead Form": lead?.lead_form_name || "",
    };

    for (const [key, value] of customEntries) {
      if (EXPORT_ATTR_KEYS.has(String(key))) {
        nextRow[`Attribution: ${labelize(String(key))}`] = serializeLeadExportValue(value);
        continue;
      }
      nextRow[`Custom: ${labelize(String(key))}`] = serializeLeadExportValue(value);
    }

    return nextRow;
  });
}

function getResolvedLeadFlowName(lead: any, details: Record<string, CampaignDetail>) {
  if (lead?.flow_name) return lead.flow_name;
  const campaignId = String(lead?.campaign_id || "").trim();
  const entryId = String(lead?.entry_point_id || "").trim();
  if (!campaignId || !entryId) return "";
  const detail = details[campaignId];
  const entry = Array.isArray(detail?.entryPoints) ? detail.entryPoints.find((e: any) => String(e.id || "").trim() === entryId) : null;
  return String(entry?.flow_name || entry?.name || "").trim();
}

export default function LeadsPage() {
  const activeWorkspace = useAuthStore((s) => s.activeWorkspace);
  const activeProject = useAuthStore((s) => s.activeProject);
  const hasWorkspacePermission = useAuthStore((s) => s.hasWorkspacePermission);
  const { canViewPage } = useVisibility();
  const canViewLeads = hasWorkspacePermission(activeWorkspace?.workspace_id, "view_leads");
  const canDeleteLeads = hasWorkspacePermission(activeWorkspace?.workspace_id, "delete_leads");
  const canViewLeadsPage = canViewPage("leads");

  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [campaignDetailsById, setCampaignDetailsById] = useState<Record<string, CampaignDetail>>({});
  const [campaignDetail, setCampaignDetail] = useState<CampaignDetail | null>(null);
  const [leadForms, setLeadForms] = useState<LeadFormRecord[]>([]);
  const [listSummaries, setListSummaries] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [draggingLeadId, setDraggingLeadId] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"current" | "all" | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [filters, setFilters] = useState({
    platform: "", campaignId: "", channelId: "", entryPointId: "", flowId: "", listId: "", leadFormId: "", status: "", search: "",
  });

  const loadCampaigns = async () => {
    if (!activeWorkspace?.workspace_id || !activeProject?.id) { setCampaigns([]); setCampaignDetailsById({}); return; }
    try {
      const data = await campaignService.list({ workspaceId: activeWorkspace.workspace_id, projectId: activeProject.id });
      setCampaigns(data);
      const entries = await Promise.all(data.map(async (c) => {
        try { return [c.id, await campaignService.get(c.id)] as const; } catch { return [c.id, null] as const; }
      }));
      setCampaignDetailsById(entries.reduce<Record<string, CampaignDetail>>((acc, [id, detail]) => {
        if (detail) acc[id] = detail;
        return acc;
      }, {}));
    } catch (e: any) { setErrorMessage(e?.message || "Failed to load campaigns."); }
  };
  const loadLeadForms = async () => {
    try {
      const data = await leadFormService.list(activeWorkspace?.workspace_id || undefined, activeProject?.id || undefined);
      setLeadForms(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setErrorMessage(e?.message || "Failed to load lead forms.");
      setLeadForms([]);
    }
  };
  const loadLeadLists = async (campaignId?: string) => {
    try {
      const data = await leadService.listSummaries(campaignId || undefined, activeWorkspace?.workspace_id || undefined, activeProject?.id || undefined);
      setListSummaries(data);
    } catch (e: any) { setErrorMessage(e?.message || "Failed to load lead lists."); }
  };
  const loadLeads = async (nextFilters = filters) => {
    if (!activeWorkspace?.workspace_id || !activeProject?.id || !canViewLeads) { setLeads([]); setLoading(false); return; }
    setLoading(true);
    try {
      setErrorMessage(null);
      const data = await leadService.list({ ...nextFilters, workspaceId: activeWorkspace.workspace_id, projectId: activeProject.id });
      setLeads(data);
      setLastSyncedAt(new Date().toISOString());
      if (selectedLead) setSelectedLead(data.find((lead: any) => lead.id === selectedLead.id) || null);
    } catch (e: any) {
      setErrorMessage(e?.message || "Failed to load leads.");
      setLeads([]);
    } finally { setLoading(false); }
  };

  useEffect(() => {
    if (!canViewLeadsPage) {
      setCampaigns([]); setCampaignDetailsById({}); setLeadForms([]); setListSummaries([]); setLeads([]); setLoading(false); return;
    }
    loadCampaigns().then(loadLeadForms).then(() => loadLeadLists()).then(() => loadLeads()).catch(console.error);
  }, [activeWorkspace?.workspace_id, activeProject?.id, canViewLeads, canViewLeadsPage]);

  useEffect(() => {
    if (!filters.campaignId) { setCampaignDetail(null); return; }
    const detail = campaignDetailsById[filters.campaignId];
    if (detail) { setCampaignDetail(detail); return; }
    campaignService.get(filters.campaignId).then(setCampaignDetail).catch(console.error);
  }, [filters.campaignId, campaignDetailsById]);

  useEffect(() => {
    if (!canViewLeadsPage) return;
    loadLeadLists(filters.campaignId).catch(console.error);
    loadLeads(filters).catch(console.error);
  }, [filters, activeWorkspace?.workspace_id, activeProject?.id, canViewLeads, canViewLeadsPage]);

  const campaignsForPlatform = useMemo(() => !filters.platform ? campaigns : campaigns.filter((c) => {
    const detail = campaignDetailsById[c.id];
    return Boolean(detail?.channels?.some((ch: any) => String(ch.platform || ch.platform_type || "").trim().toLowerCase() === filters.platform));
  }), [campaigns, campaignDetailsById, filters.platform]);
  const availableChannels = useMemo(() => {
    const channels = campaignDetail?.channels || [];
    return !filters.platform ? channels : channels.filter((ch: any) => String(ch.platform || ch.platform_type || "").trim().toLowerCase() === filters.platform);
  }, [campaignDetail, filters.platform]);
  const availableEntryPoints = useMemo(() => (campaignDetail?.entryPoints || []).filter((e: any) => !filters.channelId || e.channel_id === filters.channelId), [campaignDetail, filters.channelId]);
  const availableFlowOptions = useMemo(() => availableEntryPoints.reduce((acc: any[], e: any) => {
    if (!e.flow_id || acc.some((i) => i.id === e.flow_id)) return acc;
    acc.push({ id: e.flow_id, name: e.flow_name || e.name || "Unnamed flow" });
    return acc;
  }, []), [availableEntryPoints]);
  const availableLists = useMemo(() => {
    const scoped = filters.campaignId ? listSummaries.filter((l) => (!filters.campaignId || l.campaign_id === filters.campaignId) && (!filters.channelId || l.channel_id === filters.channelId) && (!filters.entryPointId || l.entry_point_id === filters.entryPointId)) : listSummaries;
    return !filters.platform ? scoped : scoped.filter((l) => String(l.platform || "").trim().toLowerCase() === filters.platform);
  }, [filters.campaignId, filters.channelId, filters.entryPointId, filters.platform, listSummaries]);

  const selectedLeadFlowName = selectedLead ? getResolvedLeadFlowName(selectedLead, campaignDetailsById) : "";
  const selectedLeadForm = leadForms.find((f) => String(f.id) === String(selectedLead?.lead_form_id || "")) || null;
  const selectedLeadCustomVariables = normObj(selectedLead?.custom_variables);
  const selectedLeadCustomEntries = Object.entries(selectedLeadCustomVariables).filter(([k, v]) => !ATTR_KEYS.includes(String(k)) && v !== null && v !== undefined && String(v).trim() !== "");
  const selectedLeadAttributionEntries = Object.entries(selectedLeadCustomVariables).filter(([k, v]) => ATTR_KEYS.includes(String(k)) && v !== null && v !== undefined && String(v).trim() !== "");
  const selectedLeadFlowProgress = selectedLead ? [
    selectedLead.campaign_name || "No campaign",
    selectedLead.entry_point_name || "Default entry",
    selectedLeadFlowName || "Default flow",
    selectedLead.lead_form_name || selectedLeadForm?.name || "No linked form",
  ] : [];
  const phaseCounts = useMemo(
    () =>
      CRM_PHASES.map((phase) => ({
        ...phase,
        count: leads.filter((lead: any) => String(lead.status || "new").toLowerCase() === phase.key).length,
        active: filters.status === phase.key,
      })),
    [leads, filters.status]
  );
  const leadBuckets = useMemo(
    () =>
      CRM_PHASES.map((phase) => ({
        ...phase,
        leads: leads.filter((lead: any) => String(lead.status || "new").toLowerCase() === phase.key),
      })),
    [leads]
  );

  const handleDelete = async (id: string) => {
    if (!canDeleteLeads) return;
    await leadService.remove(id);
    await loadLeads();
    if (selectedLead?.id === id) setSelectedLead(null);
  };
  const handleMoveLead = async (leadId: string, nextStatus: string) => {
    const currentLead = leads.find((lead: any) => String(lead.id) === String(leadId)) || null;
    const previousStatus = String(currentLead?.status || "new").toLowerCase();
    const normalizedNextStatus = String(nextStatus || "").toLowerCase();

    if (!currentLead || !normalizedNextStatus || previousStatus === normalizedNextStatus) {
      return;
    }

    setLeads((current) =>
      current.map((lead: any) =>
        String(lead.id) === String(leadId)
          ? { ...lead, status: normalizedNextStatus }
          : lead
      )
    );

    if (selectedLead?.id === leadId) {
      setSelectedLead((current: any) =>
        current ? { ...current, status: normalizedNextStatus } : current
      );
    }

    try {
      const updated = await leadService.updateStatus(leadId, normalizedNextStatus);
      if (selectedLead?.id === leadId) {
        setSelectedLead((current: any) => (current ? { ...current, ...updated } : current));
      }
    } catch (err) {
      console.error("Failed to update lead status", err);
      setLeads((current) =>
        current.map((lead: any) =>
          String(lead.id) === String(leadId)
            ? { ...lead, status: previousStatus }
            : lead
        )
      );
      if (selectedLead?.id === leadId) {
        setSelectedLead((current: any) =>
          current ? { ...current, status: previousStatus } : current
        );
      }
      notifyApiError(err, "Could not move the lead to the new CRM phase. The card was restored to its previous column.", "Lead Move Failed");
    }
  };
  const handleRefresh = async () => {
    await loadLeadForms();
    await loadLeadLists(filters.campaignId);
    await loadLeads(filters);
  };
  const handleExport = async (mode: "current" | "all") => {
    if (!activeWorkspace?.workspace_id || !activeProject?.id) {
      return;
    }

    try {
      setExporting(mode);
      const rows =
        mode === "current"
          ? leads
          : await leadService.list({
              workspaceId: activeWorkspace.workspace_id,
              projectId: activeProject.id,
            });
      downloadCsv(
        `leads-${mode === "current" ? "current-view" : "all"}-${new Date().toISOString().slice(0, 10)}.csv`,
        buildLeadExportRows(Array.isArray(rows) ? rows : [])
      );
    } catch (err) {
      console.error("Failed to export leads", err);
    } finally {
      setExporting(null);
    }
  };

  return (
    <DashboardLayout fullBleed>
      {!canViewLeadsPage ? (
        <PageAccessNotice title="Leads are restricted for this role" description="Lead visibility follows workspace, project, and assigned-scope rules. Platform operators should stay in support tools." href="/" ctaLabel="Open dashboard" />
      ) : (
        <div className="flex min-h-full flex-col gap-5 text-text-main">
          {!activeWorkspace?.workspace_id || !activeProject?.id ? (
            <div className="rounded-[1.5rem] border border-dashed border-border-main bg-surface p-8 text-sm text-text-muted">Select a workspace and project first. Leads are shown inside the active project only.</div>
          ) : !canViewLeads ? (
            <div className="rounded-[1.5rem] border border-dashed border-amber-200 bg-amber-50 p-8 text-sm text-amber-700">Lead visibility is restricted for your current workspace role. Ask an admin to grant the <span className="font-semibold">view leads</span> permission if you need access.</div>
          ) : null}
          {errorMessage ? <div className="rounded-[1.25rem] border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{errorMessage}</div> : null}

          <section className="rounded-[1.5rem] border border-border-main bg-surface p-5 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted">
                  CRM Pipeline
                </div>
                <h1 className="mt-2 text-[1.65rem] font-semibold tracking-tight text-text-main">
                  Lead lifecycle and detail workspace
                </h1>
                <p className="mt-2 text-sm leading-6 text-text-muted">
                  Move leads through the current phase, inspect the live journey, and keep the selected record visible beside the list.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => handleExport("current")}
                  disabled={exporting !== null}
                  data-allow-export="true"
                  className="inline-flex items-center gap-2 rounded-xl border border-primary bg-primary px-4 py-3 text-[11px] font-black uppercase tracking-[0.18em] text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Download size={14} />
                  {exporting === "current" ? "Exporting..." : "Export Current View"}
                </button>
                <button
                  type="button"
                  onClick={() => handleExport("all")}
                  disabled={exporting !== null}
                  data-allow-export="true"
                  className="inline-flex items-center gap-2 rounded-xl border border-border-main bg-surface px-4 py-3 text-[11px] font-black uppercase tracking-[0.18em] text-text-main transition hover:bg-canvas hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Download size={14} />
                  {exporting === "all" ? "Exporting..." : "Export All Leads"}
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {phaseCounts.map((phase) => (
                  <button
                    key={phase.key}
                    type="button"
                    onClick={() => setFilters((current) => ({ ...current, status: current.status === phase.key ? "" : phase.key }))}
                    className={`rounded-[1.1rem] border px-4 py-3 text-left transition ${
                      phase.active
                        ? "border-primary bg-primary text-white shadow-sm"
                        : "border-border-main bg-canvas text-text-main hover:border-primary/30 hover:bg-primary-fade hover:text-primary"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.18em]">{phase.title}</div>
                      <div className={`text-xs font-bold ${phase.active ? "text-white" : "text-text-muted"}`}>{phase.count}</div>
                    </div>
                    <div className={`mt-2 text-xs leading-5 ${phase.active ? "text-white/85" : "text-text-muted"}`}>
                      {phase.summary}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </section>

          <div className="rounded-[1.5rem] border border-border-main bg-surface p-4 shadow-sm transition-colors duration-300">
            <div className="space-y-4">
              <div className="grid gap-3 xl:grid-cols-[220px_1fr_auto]">
                <select className="rounded-xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main" value={filters.platform} onChange={(e) => setFilters((p) => ({ ...p, platform: e.target.value, campaignId: "", channelId: "", entryPointId: "", flowId: "", listId: "", leadFormId: "" }))}>
                  <option value="">All platforms</option>
                  {PLATFORMS.map((p) => <option key={p} value={p}>{fmtPlatform(p)}</option>)}
                </select>
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
                  <input className="w-full rounded-xl border border-border-main bg-canvas py-3 pl-11 pr-4 text-sm text-text-main placeholder:text-text-muted" placeholder="Search lead, company, phone, email..." value={filters.search} onChange={(e) => setFilters((p) => ({ ...p, search: e.target.value }))} />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={() => setShowAdvancedFilters((p) => !p)} className="inline-flex items-center gap-2 rounded-xl border border-border-main bg-transparent px-4 py-3 text-[11px] font-black uppercase tracking-[0.18em] text-text-main transition hover:bg-primary-fade hover:text-primary hover:border-primary/30">
                    <SlidersHorizontal size={14} />{showAdvancedFilters ? "Hide filters" : "More filters"}
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex items-center gap-2 rounded-full bg-primary-fade px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.22em] text-primary"><Filter size={12} />Status</div>
                  <button onClick={() => setFilters((p) => ({ ...p, status: "" }))} className={`rounded-full px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em] transition ${!filters.status ? "bg-primary text-white" : "border border-border-main bg-transparent text-text-main hover:bg-primary-fade hover:text-primary hover:border-primary/30"}`}>All</button>
                  {STATUS_OPTIONS.map((s) => <button key={s} onClick={() => setFilters((p) => ({ ...p, status: s }))} className={`rounded-full px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em] transition ${filters.status === s ? "bg-primary text-white" : "border border-border-main bg-transparent text-text-main hover:bg-primary-fade hover:text-primary hover:border-primary/30"}`}>{fmtStatus(s)}</button>)}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary-fade px-4 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-primary"><Activity size={14} />Last sync {fmtTime(lastSyncedAt)}</div>
                  <button onClick={handleRefresh} className="inline-flex items-center gap-2 rounded-full border border-border-main bg-transparent px-4 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-text-main transition hover:bg-primary-fade hover:text-primary hover:border-primary/30"><RefreshCw size={14} />Refresh</button>
                </div>
              </div>

              {showAdvancedFilters ? (
                <div className="grid gap-3 xl:grid-cols-6">
                  <select className="rounded-xl border border-border-main bg-canvas px-4 py-3 text-sm" value={filters.campaignId} onChange={(e) => setFilters((p) => ({ ...p, campaignId: e.target.value, channelId: "", entryPointId: "", flowId: "", listId: "" }))}>
                    <option value="">All campaigns</option>
                    {campaignsForPlatform.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <select className="rounded-xl border border-border-main bg-canvas px-4 py-3 text-sm" value={filters.flowId} onChange={(e) => setFilters((p) => ({ ...p, flowId: e.target.value }))} disabled={!filters.campaignId}>
                    <option value="">All flows</option>
                    {availableFlowOptions.map((f: any) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                  <select className="rounded-xl border border-border-main bg-canvas px-4 py-3 text-sm" value={filters.listId} onChange={(e) => setFilters((p) => ({ ...p, listId: e.target.value }))}>
                    <option value="">All lists</option>
                    {availableLists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                  <select className="rounded-xl border border-border-main bg-canvas px-4 py-3 text-sm" value={filters.leadFormId} onChange={(e) => setFilters((p) => ({ ...p, leadFormId: e.target.value }))}>
                    <option value="">All lead forms</option>
                    {leadForms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                  <select className="rounded-xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main" value={filters.channelId} onChange={(e) => setFilters((p) => ({ ...p, channelId: e.target.value, entryPointId: "", listId: "" }))} disabled={!filters.campaignId}>
                    <option value="">All channels</option>
                    {availableChannels.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <select className="rounded-xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main" value={filters.entryPointId} onChange={(e) => setFilters((p) => ({ ...p, entryPointId: e.target.value, listId: "" }))} disabled={!filters.campaignId}>
                    <option value="">All entry points</option>
                    {availableEntryPoints.map((e: any) => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>
              ) : null}
            </div>
          </div>

          <div className="grid min-h-0 gap-5 xl:grid-cols-[2.25fr_0.75fr]">
            <div className="min-h-0 overflow-hidden rounded-[1.5rem] border border-border-main bg-surface shadow-sm">
              <div className="flex items-center justify-between border-b border-border-main bg-canvas px-6 py-4">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">Lead Kanban</div>
                  <div className="mt-1 text-sm text-text-muted">Drag cards between phases to update the CRM pipeline.</div>
                </div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">{loading ? "Loading..." : `${leads.length} leads`}</div>
              </div>
              <div className="max-h-[calc(100vh-340px)] overflow-auto">
                <div className="grid gap-4 p-4 xl:grid-cols-4">
                  {leadBuckets.map((bucket) => (
                    <div
                      key={bucket.key}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault();
                        const leadId = event.dataTransfer.getData("text/lead-id") || draggingLeadId || "";
                        if (leadId) {
                          handleMoveLead(leadId, bucket.key);
                        }
                        setDraggingLeadId(null);
                      }}
                      className={`flex min-h-[420px] flex-col rounded-[1.25rem] border bg-canvas p-3 transition ${
                        filters.status === bucket.key ? "border-primary/50 shadow-[0_0_0_1px_rgba(16,185,129,0.12)]" : "border-border-main"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3 border-b border-border-main px-2 pb-3">
                        <div>
                          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">{bucket.title}</div>
                          <div className="mt-1 text-xs text-text-muted">{bucket.summary}</div>
                        </div>
                        <div className="rounded-full bg-primary-fade px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-primary">
                          {bucket.leads.length}
                        </div>
                      </div>
                      <div className="mt-3 flex-1 space-y-3 overflow-auto pr-1">
                        {bucket.leads.map((lead: any) => (
                          <button
                            key={lead.id}
                            type="button"
                            draggable
                            onDragStart={(event) => {
                              event.dataTransfer.setData("text/lead-id", String(lead.id));
                              setDraggingLeadId(String(lead.id));
                            }}
                            onDragEnd={() => setDraggingLeadId(null)}
                            onClick={() => setSelectedLead(lead)}
                            className={`w-full rounded-[1.1rem] border p-4 text-left transition ${
                              selectedLead?.id === lead.id
                                ? "border-primary bg-primary-fade shadow-sm"
                                : "border-border-main bg-surface hover:border-primary/30 hover:bg-primary-fade"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="font-bold text-text-main">{lead.name || lead.wa_name || "Unknown"}</div>
                                <div className="mt-1 text-xs text-text-muted">{lead.company_name || "No company"}</div>
                              </div>
                              <span className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${badgeClass(lead.platform || "")}`}>
                                {fmtPlatform(lead.platform || "unknown")}
                              </span>
                            </div>
                            <div className="mt-3 space-y-1 text-xs text-text-muted">
                              <div>{lead.phone || lead.wa_number || "No phone"}</div>
                              <div>{lead.email || "No email"}</div>
                              <div className="font-semibold text-text-main">{lead.campaign_name || "Unassigned"}</div>
                              <div>{getResolvedLeadFlowName(lead, campaignDetailsById) || "Default flow"}</div>
                            </div>
                          </button>
                        ))}
                        {bucket.leads.length === 0 ? (
                          <div className="rounded-[1.1rem] border border-dashed border-border-main bg-surface px-4 py-8 text-center text-xs text-text-muted">
                            Drop a lead here or wait for the next capture.
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="min-h-0 space-y-5">
              <div className="rounded-[1.5rem] border border-border-main bg-surface p-6 shadow-sm">
                <div className="mb-4 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted"><Route size={14} />Lead Context</div>
                {!selectedLead ? (
                  <div className="text-sm leading-6 text-text-muted">Select a lead to inspect its current route, source, attribution, and captured answers.</div>
                ) : (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-border-main bg-canvas p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-lg font-black text-text-main">{selectedLead.name || selectedLead.wa_name || "Unknown"}</div>
                          <div className="mt-2 text-sm text-text-muted">{selectedLead.phone || selectedLead.wa_number || "No phone"} | {selectedLead.email || "No email"}</div>
                          <div className="mt-2 text-sm text-text-muted">{selectedLead.company_name || "No company name"}</div>
                        </div>
                        <div className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${badgeClass(selectedLead.platform || "")}`}>{fmtPlatform(selectedLead.platform || "unknown")}</div>
                      </div>
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-border-main bg-surface px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                          {fmtStatus(selectedLead.status || "new")}
                        </span>
                        <span className="rounded-full border border-border-main bg-surface px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                          {selectedLeadFlowName || "Default flow"}
                        </span>
                      </div>
                    </div>
                    <div className="rounded-xl border border-border-main p-4">
                      <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-text-muted"><Filter size={12} />Lead Form</div>
                      <div className="text-sm font-semibold text-text-main">{selectedLead.lead_form_name || selectedLeadForm?.name || "No linked form"}</div>
                    </div>
                    <div className="rounded-xl border border-border-main p-4">
                      <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-text-muted"><Activity size={12} />Current Journey</div>
                      <div className="space-y-2 text-sm font-semibold text-text-main">
                        {selectedLeadFlowProgress.map((item, i) => (
                          <div key={`${item}-${i}`} className="flex items-center gap-2">
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-canvas text-[10px] font-black text-text-muted">{i + 1}</span>
                            <span>{item}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-xl border border-border-main p-4">
                      <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-text-muted"><Filter size={12} />Current State</div>
                      <div className="text-sm font-semibold text-text-main">{fmtStatus(selectedLead.status || "new")}</div>
                    </div>
                    <div className="rounded-xl border border-border-main p-4">
                      <div className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">Standard Fields</div>
                      <div className="space-y-2 text-sm text-text-muted">
                        <div className="flex items-center justify-between gap-3"><span className="text-text-muted">Full Name</span><span className="font-semibold text-text-main">{selectedLead.name || selectedLead.wa_name || "Not provided"}</span></div>
                        <div className="flex items-center justify-between gap-3"><span className="text-text-muted">Email</span><span className="font-semibold text-text-main">{selectedLead.email || "Not provided"}</span></div>
                        <div className="flex items-center justify-between gap-3"><span className="text-text-muted">Phone</span><span className="font-semibold text-text-main">{selectedLead.phone || selectedLead.wa_number || "Not provided"}</span></div>
                        <div className="flex items-center justify-between gap-3"><span className="text-text-muted">Company</span><span className="font-semibold text-text-main">{selectedLead.company_name || "Not provided"}</span></div>
                      </div>
                    </div>
                    {selectedLeadCustomEntries.length > 0 ? <div className="rounded-xl border border-border-main p-4"><div className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">Custom Responses</div><div className="space-y-3">{selectedLeadCustomEntries.map(([key, value]) => { const field = selectedLeadForm?.fields?.find((f) => String(f.fieldKey) === String(key)); return <div key={key} className="flex items-start justify-between gap-3 rounded-lg bg-canvas px-3 py-2"><div className="text-sm text-text-muted">{field?.questionLabel || labelize(key)}</div><div className="max-w-[55%] text-right text-sm font-semibold text-text-main">{fmtValue(value)}</div></div>; })}</div></div> : null}
                    {selectedLeadAttributionEntries.length > 0 ? <div className="rounded-xl border border-border-main p-4"><div className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">Attribution</div><div className="space-y-2 text-sm text-text-muted">{selectedLeadAttributionEntries.map(([key, value]) => <div key={key} className="flex items-start justify-between gap-3"><span className="text-text-muted">{labelize(key)}</span>{key === "chat_url" ? <a href={String(value)} target="_blank" rel="noreferrer" className="font-semibold text-blue-600 hover:underline">Open chat</a> : <span className="max-w-[55%] text-right font-semibold text-text-main">{fmtValue(value)}</span>}</div>)}</div></div> : null}
                    {availableLists.length > 0 ? <div className="rounded-xl border border-border-main p-4"><div className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">Available Lists</div><div className="flex flex-wrap gap-2">{availableLists.slice(0, 4).map((l) => <span key={l.id} className="rounded-full bg-canvas px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">{l.name}</span>)}</div></div> : null}
                    {canDeleteLeads ? <button onClick={() => handleDelete(selectedLead.id)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-[11px] font-black uppercase tracking-[0.2em] text-red-600 transition hover:bg-red-100"><Trash2 size={14} />Delete Lead</button> : null}
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

