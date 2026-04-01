import React, { useState, useEffect } from "react";
import { X, Send, Users, CheckCircle2, Loader2 } from "lucide-react";
import apiClient from "../../services/apiClient";
import { botService } from "../../services/botService";
import { notify } from "../../store/uiStore";
import { useAuthStore } from "../../store/authStore";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  templates: any[];
  canLaunchCampaign: boolean;
}

export default function CampaignSenderModal({ isOpen, onClose, templates, canLaunchCampaign }: Props) {
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);
  const activeProject = useAuthStore((state) => state.activeProject);
  const [step, setStep] = useState(1);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [leads, setLeads] = useState<any[]>([]);
  const [bots, setBots] = useState<any[]>([]);
  const [selectedBotId, setSelectedBotId] = useState("");
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [platformFilter, setPlatformFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [listFilter, setListFilter] = useState("");
  const [segmentFilter, setSegmentFilter] = useState("");
  const [suppressionFilter, setSuppressionFilter] = useState("");
  const [searchFilter, setSearchFilter] = useState("");
  const [scheduleAt, setScheduleAt] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (isOpen) {
      setLoadError("");
      fetchLeads();
      fetchBots();
      setStep(1);
      setResult(null);
      setSelectedTemplate(null);
      setSelectedLeads([]);
      setPlatformFilter("");
      setStatusFilter("");
      setListFilter("");
      setSegmentFilter("");
      setSuppressionFilter("");
      setSearchFilter("");
      setScheduleAt("");
    }
  }, [isOpen]);

  const getTemplatePreview = (template: any) => {
    const content = typeof template.content === "string" ? JSON.parse(template.content) : template.content;
    return content?.body || template.body || "No preview available";
  };

  const fetchLeads = async () => {
    if (!activeWorkspace?.workspace_id || !activeProject?.id) {
      setLeads([]);
      return;
    }

    try {
      const res = await apiClient.get("/leads", {
        params: {
          workspaceId: activeWorkspace.workspace_id,
          projectId: activeProject.id,
          ...(selectedBotId ? { botId: selectedBotId } : {}),
        },
      });
      setLeads(Array.isArray(res.data) ? res.data : []);
    } catch (err: any) {
      console.error("Failed to fetch leads");
      setLeads([]);
      setLoadError(err?.response?.data?.error || "Failed to load leads for campaign launch.");
    }
  };

  const fetchBots = async () => {
    if (!activeWorkspace?.workspace_id || !activeProject?.id) {
      setBots([]);
      setSelectedBotId("");
      return;
    }

    try {
      const rows = await botService.getBots({
        workspaceId: activeWorkspace.workspace_id,
        projectId: activeProject.id,
      });
      setBots(rows);
      setSelectedBotId((prev) => prev || rows[0]?.id || "");
    } catch (err: any) {
      console.error("Failed to fetch bots");
      setBots([]);
      setSelectedBotId("");
      setLoadError(err?.response?.data?.error || "Failed to load project bots.");
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchLeads();
    }
  }, [selectedBotId, activeWorkspace?.workspace_id, activeProject?.id, isOpen]);

  const visibleLeads = leads.filter((lead) => {
    const leadPlatform = String(lead.platform || "").toLowerCase();
    const leadStatus = String(lead.status || "").toLowerCase();
    const leadList = String(lead.list_name || lead.list_id || "").toLowerCase();
    const leadSearch =
      `${lead.wa_name || ""} ${lead.name || ""} ${lead.wa_number || ""} ${lead.phone || ""} ${lead.email || ""} ${lead.company_name || ""}`.toLowerCase();

    if (platformFilter && leadPlatform !== platformFilter) return false;
    if (statusFilter && leadStatus !== statusFilter) return false;
    if (listFilter && leadList !== listFilter) return false;
    if (suppressionFilter && lead.list_id && String(lead.list_id).toLowerCase() === suppressionFilter) return false;
    if (searchFilter.trim() && !leadSearch.includes(searchFilter.trim().toLowerCase())) return false;
    return true;
  });

  const savedSegments = Array.from(
    new Map(
      leads
        .filter((lead) => String(lead.source_type || lead.list_source_type || "").toLowerCase() === "segment")
        .map((lead) => {
          const id = String(lead.list_id || "").trim();
          return [
            id,
            {
              id,
              name: String(lead.list_name || lead.list_key || "Saved segment").trim(),
            },
          ] as const;
        })
        .filter(([id]) => Boolean(id))
    ).values()
  );

  const handleLaunch = async () => {
    if (!canLaunchCampaign) {
      notify("You do not have access to launch campaigns in this project.", "error");
      return;
    }
    if (!selectedTemplate || selectedLeads.length === 0 || !selectedBotId) return;
    setIsSending(true);
    try {
      const res = await apiClient.post("/templates/launch-campaign", {
        templateId: selectedTemplate.id,
        leadIds: selectedLeads,
        campaignName: `Manual Campaign - ${new Date().toLocaleDateString()}`,
        ...(suppressionFilter ? { suppressionListId: suppressionFilter } : {}),
        ...(scheduleAt ? { scheduleAt } : {}),
      });
      setResult(res.data);
      setStep(3);
    } catch (err: any) {
      notify(err?.response?.data?.error || "Campaign launch failed.", "error");
    } finally {
      setIsSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-md">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-[2rem] border border-border-main bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-border-main bg-canvas p-6">
          <div>
            <h2 className="text-xl font-black uppercase tracking-tight text-text-main">Launch Campaign</h2>
            <p className="text-xs font-bold uppercase tracking-widest text-text-muted">Step {step} of 3</p>
          </div>
          <button onClick={onClose} className="rounded-full border border-border-main p-2 text-text-muted transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:text-text-main"><X size={20}/></button>
        </div>

        <div className="flex-1 overflow-y-auto p-8">
          {!canLaunchCampaign ? (
              <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Campaign launch is not available for this access level.
              </div>
          ) : null}
          {loadError ? (
            <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {loadError}
            </div>
          ) : null}
          {step === 1 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-widest text-text-muted">
                  Project Bot
                </label>
                <select
                  value={selectedBotId}
                  onChange={(e) => setSelectedBotId(e.target.value)}
                  disabled={!canLaunchCampaign}
                  className="w-full rounded-2xl border border-border-main bg-canvas px-4 py-3 text-sm font-medium text-text-main outline-none transition focus:border-primary focus:shadow-[0_0_0_4px_var(--primary-fade)]"
                >
                  <option value="">Select a bot</option>
                  {bots.map((bot) => (
                    <option key={bot.id} value={bot.id}>
                      {bot.name}
                    </option>
                  ))}
                </select>
              </div>
              <h3 className="flex items-center gap-2 text-sm font-black uppercase text-text-main"><Send size={18} className="text-primary"/> Select Template</h3>
              <div className="grid grid-cols-1 gap-3">
                {templates
                  .filter((t) => String(t.status || "").toLowerCase() === "approved")
                  .map(t => (
                  <button 
                    key={t.id} 
                    disabled={!canLaunchCampaign}
                    onClick={() => { setSelectedTemplate(t); setStep(2); }}
                    className="group rounded-2xl border border-border-main bg-surface p-4 text-left text-text-main shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <div className="font-bold text-text-main">{t.name}</div>
                    <div className="line-clamp-1 text-xs text-text-muted">{getTemplatePreview(t)}</div>
                  </button>
                ))}
                {templates.filter((t) => String(t.status || "").toLowerCase() === "approved").length === 0 ? (
                  <div className="rounded-2xl border border-border-main bg-canvas px-4 py-4 text-sm text-text-muted">
                    No approved templates are available for this workspace/project yet.
                  </div>
                ) : null}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
              <div className="flex justify-between items-center">
                <h3 className="flex items-center gap-2 text-sm font-black uppercase text-text-main"><Users size={18} className="text-primary"/> Select Recipients</h3>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedLeads(visibleLeads.map((l) => String(l.id)))}
                    disabled={!canLaunchCampaign}
                    className="border-b-2 border-primary text-[10px] font-black uppercase text-primary"
                  >
                    Select Visible ({visibleLeads.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedLeads([])}
                    disabled={!canLaunchCampaign || selectedLeads.length === 0}
                    className="rounded-full border border-border-main bg-surface px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-text-muted transition hover:border-primary/30 hover:text-text-main disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Clear
                  </button>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <input
                  type="datetime-local"
                  value={scheduleAt}
                  onChange={(e) => setScheduleAt(e.target.value)}
                  className="rounded-2xl border border-border-main bg-canvas px-4 py-3 text-sm font-medium text-text-main outline-none"
                />
                <select
                  value={segmentFilter}
                  onChange={(e) => {
                    const next = e.target.value;
                    setSegmentFilter(next);
                    setListFilter(next);
                  }}
                  className="rounded-2xl border border-border-main bg-canvas px-4 py-3 text-sm font-medium text-text-main outline-none"
                >
                  <option value="">Saved segments</option>
                  {savedSegments.map((segment) => (
                    <option key={segment.id} value={segment.id}>
                      {segment.name}
                    </option>
                  ))}
                </select>
                <select
                  value={suppressionFilter}
                  onChange={(e) => setSuppressionFilter(e.target.value)}
                  className="rounded-2xl border border-border-main bg-canvas px-4 py-3 text-sm font-medium text-text-main outline-none"
                >
                  <option value="">Suppression lists</option>
                  {Array.from(
                    new Map(
                      leads
                        .filter((lead) => String(lead.source_type || lead.list_source_type || "").toLowerCase() === "suppression")
                        .map((lead) => [String(lead.list_id || "").trim(), String(lead.list_name || lead.list_key || "Suppression").trim()] as const)
                        .filter(([id]) => Boolean(id))
                    ).entries()
                  ).map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
                <select
                  value={platformFilter}
                  onChange={(e) => setPlatformFilter(e.target.value)}
                  className="rounded-2xl border border-border-main bg-canvas px-4 py-3 text-sm font-medium text-text-main outline-none"
                >
                  <option value="">All platforms</option>
                  {Array.from(new Set(leads.map((lead) => String(lead.platform || "").toLowerCase()).filter(Boolean))).map((platform) => (
                    <option key={platform} value={platform}>
                      {platform}
                    </option>
                  ))}
                </select>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="rounded-2xl border border-border-main bg-canvas px-4 py-3 text-sm font-medium text-text-main outline-none"
                >
                  <option value="">All statuses</option>
                  {Array.from(new Set(leads.map((lead) => String(lead.status || "").toLowerCase()).filter(Boolean))).map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
                <select
                  value={listFilter}
                  onChange={(e) => setListFilter(e.target.value)}
                  className="rounded-2xl border border-border-main bg-canvas px-4 py-3 text-sm font-medium text-text-main outline-none"
                >
                  <option value="">All lists</option>
                  {Array.from(new Set(leads.map((lead) => String(lead.list_name || lead.list_id || "").toLowerCase()).filter(Boolean))).map((list) => (
                    <option key={list} value={list}>
                      {list}
                    </option>
                  ))}
                </select>
                <input
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder="Search audience"
                  className="rounded-2xl border border-border-main bg-canvas px-4 py-3 text-sm font-medium text-text-main outline-none placeholder:text-text-muted"
                />
              </div>
              <div className="rounded-2xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-muted">
                Audience slice: <span className="font-semibold text-text-main">{visibleLeads.length}</span> visible /{" "}
                <span className="font-semibold text-text-main">{leads.length}</span> total leads
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-border-main bg-surface px-4 py-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">Bot</div>
                  <div className="mt-1 text-sm font-semibold text-text-main">
                    {bots.find((bot) => bot.id === selectedBotId)?.name || "No bot selected"}
                  </div>
                </div>
                <div className="rounded-2xl border border-border-main bg-surface px-4 py-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">Leads selected</div>
                  <div className="mt-1 text-sm font-semibold text-text-main">{selectedLeads.length}</div>
                </div>
                <div className="rounded-2xl border border-border-main bg-surface px-4 py-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">Filters</div>
                  <div className="mt-1 text-xs leading-5 text-text-muted">
                    {platformFilter || statusFilter || listFilter || suppressionFilter || searchFilter.trim()
                      ? "Audience segment applied"
                      : "No active segment filters"}
                  </div>
                </div>
                <div className="rounded-2xl border border-border-main bg-surface px-4 py-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">Ready</div>
                  <div className="mt-1 text-sm font-semibold text-text-main">
                    {selectedTemplate ? selectedTemplate.name : "Pick a template"}
                  </div>
                </div>
                <div className="rounded-2xl border border-border-main bg-surface px-4 py-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">Timing</div>
                  <div className="mt-1 text-xs leading-5 text-text-muted">
                    {scheduleAt ? `Scheduled for ${new Date(scheduleAt).toLocaleString()}` : "Send immediately"}
                  </div>
                </div>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                {visibleLeads.map(lead => (
                  <label key={lead.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-border-main bg-surface p-3 transition-colors hover:border-primary/30 hover:bg-canvas">
                    <input 
                      type="checkbox" 
                      checked={selectedLeads.includes(String(lead.id))}
                      disabled={!canLaunchCampaign}
                      onChange={(e) => {
                        const leadId = String(lead.id);
                        if (e.target.checked) setSelectedLeads([...selectedLeads, leadId]);
                        else setSelectedLeads(selectedLeads.filter(id => id !== leadId));
                      }}
                      className="h-4 w-4 rounded border-border-main text-primary focus:ring-primary"
                    />
                    <div className="flex-1">
                        <div className="text-sm font-bold text-text-main">{lead.wa_name || 'Unknown'}</div>
                        <div className="font-mono text-[10px] text-text-muted">{lead.wa_number}</div>
                    </div>
                  </label>
                ))}
                {visibleLeads.length === 0 ? (
                  <div className="rounded-2xl border border-border-main bg-canvas px-4 py-4 text-sm text-text-muted">
                    No leads match the current segment filters.
                  </div>
                ) : null}
              </div>
            </div>
          )}

          {step === 3 && result && (
            <div className="text-center py-12 space-y-4 animate-in zoom-in-95 duration-300">
              <div className="mb-4 inline-flex rounded-full border border-emerald-200 bg-emerald-50 p-4 text-emerald-700">
                <CheckCircle2 size={48} />
              </div>
              <h3 className="text-2xl font-black uppercase text-text-main">Campaign Sent</h3>
              <div className="flex justify-center gap-8 mt-6">
                 <div className="text-center">
                    <div className="text-2xl font-black text-primary">{result.successCount}</div>
                    <div className="text-[10px] font-black uppercase text-text-muted">Successful</div>
                 </div>
                 <div className="text-center">
                    <div className="text-2xl font-black text-rose-500">{result.failCount}</div>
                    <div className="text-[10px] font-black uppercase text-text-muted">Failed</div>
                 </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-between gap-3 border-t border-border-main bg-canvas p-6">
          {step > 1 && step < 3 && (
            <button onClick={() => setStep(step - 1)} className="rounded-2xl border border-border-main px-6 py-3 text-xs font-black uppercase text-text-muted transition duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:text-text-main">Back</button>
          )}
          <div className="flex-1" />
          {step === 2 && (
            <button 
              disabled={!canLaunchCampaign || selectedLeads.length === 0 || isSending}
              onClick={handleLaunch}
              className="flex items-center gap-2 rounded-2xl border border-primary bg-primary px-8 py-3 text-xs font-black uppercase tracking-widest text-white shadow-sm transition-all duration-300 hover:-translate-y-0.5 disabled:opacity-50"
            >
              {isSending ? <Loader2 className="animate-spin" size={16}/> : <Send size={16}/>}
              {scheduleAt ? "Schedule Campaign" : "Launch Campaign"}
            </button>
          )}
          {step === 3 && (
            <button onClick={onClose} className="w-full rounded-2xl border border-primary bg-primary px-8 py-3 text-xs font-black uppercase tracking-widest text-white shadow-sm">Done</button>
          )}
        </div>
      </div>
    </div>
  );
}
