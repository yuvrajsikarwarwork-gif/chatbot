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
        campaignName: `Manual Campaign - ${new Date().toLocaleDateString()}`
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
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-[2rem] border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] shadow-[var(--shadow-glass)] backdrop-blur-2xl">
        <div className="flex items-center justify-between border-b border-[var(--glass-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.12),rgba(255,255,255,0.04))] p-6">
          <div>
            <h2 className="bg-[linear-gradient(180deg,var(--text),color-mix(in_srgb,var(--text)_72%,var(--accent)_28%))] bg-clip-text text-xl font-black uppercase tracking-tight text-transparent">Launch Campaign</h2>
            <p className="text-xs font-bold uppercase tracking-widest text-[var(--muted)]">Step {step} of 3</p>
          </div>
          <button onClick={onClose} className="rounded-full border border-[var(--glass-border)] p-2 text-[var(--muted)] transition-all hover:-translate-y-0.5 hover:border-[var(--line-strong)] hover:text-[var(--text)]"><X size={20}/></button>
        </div>

        <div className="flex-1 overflow-y-auto p-8">
          {!canLaunchCampaign ? (
              <div className="mb-6 rounded-2xl border border-[rgba(245,158,11,0.35)] bg-[rgba(245,158,11,0.12)] px-4 py-3 text-sm text-[var(--text)]">
              Campaign launch is not available for this access level.
              </div>
          ) : null}
          {loadError ? (
            <div className="mb-6 rounded-2xl border border-rose-300/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {loadError}
            </div>
          ) : null}
          {step === 1 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-widest text-[var(--muted)]">
                  Project Bot
                </label>
                <select
                  value={selectedBotId}
                  onChange={(e) => setSelectedBotId(e.target.value)}
                  disabled={!canLaunchCampaign}
                  className="w-full rounded-2xl border border-[var(--glass-border)] bg-[var(--surface-strong)] px-4 py-3 text-sm font-medium text-[var(--text)] outline-none transition focus:border-[var(--line-strong)] focus:shadow-[0_0_0_4px_var(--accent-soft)]"
                >
                  <option value="">Select a bot</option>
                  {bots.map((bot) => (
                    <option key={bot.id} value={bot.id}>
                      {bot.name}
                    </option>
                  ))}
                </select>
              </div>
              <h3 className="flex items-center gap-2 text-sm font-black uppercase text-[var(--text)]"><Send size={18} className="text-[var(--accent)]"/> Select Template</h3>
              <div className="grid grid-cols-1 gap-3">
                {templates
                  .filter((t) => String(t.status || "").toLowerCase() === "approved")
                  .map(t => (
                  <button 
                    key={t.id} 
                    disabled={!canLaunchCampaign}
                    onClick={() => { setSelectedTemplate(t); setStep(2); }}
                    className="group rounded-2xl border border-[var(--glass-border)] bg-[var(--surface)] p-4 text-left text-[var(--text)] shadow-[var(--shadow-soft)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[var(--line-strong)] hover:bg-[var(--glass-surface-strong)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <div className="font-bold text-[var(--text)]">{t.name}</div>
                    <div className="line-clamp-1 text-xs text-[var(--muted)]">{getTemplatePreview(t)}</div>
                  </button>
                ))}
                {templates.filter((t) => String(t.status || "").toLowerCase() === "approved").length === 0 ? (
                  <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-muted)] px-4 py-4 text-sm text-[var(--muted)]">
                    No approved templates are available for this workspace/project yet.
                  </div>
                ) : null}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
              <div className="flex justify-between items-center">
                <h3 className="flex items-center gap-2 text-sm font-black uppercase text-[var(--text)]"><Users size={18} className="text-[var(--accent)]"/> Select Recipients</h3>
                <button 
                  onClick={() => setSelectedLeads(leads.map((l) => String(l.id)))}
                  disabled={!canLaunchCampaign}
                  className="border-b-2 border-[var(--accent)] text-[10px] font-black uppercase text-[var(--accent)]"
                >
                  Select All ({leads.length})
                </button>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                {leads.map(lead => (
                  <label key={lead.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-[var(--glass-border)] bg-[var(--surface)] p-3 transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--glass-surface-strong)]">
                    <input 
                      type="checkbox" 
                      checked={selectedLeads.includes(String(lead.id))}
                      disabled={!canLaunchCampaign}
                      onChange={(e) => {
                        const leadId = String(lead.id);
                        if (e.target.checked) setSelectedLeads([...selectedLeads, leadId]);
                        else setSelectedLeads(selectedLeads.filter(id => id !== leadId));
                      }}
                      className="h-4 w-4 rounded border-[var(--glass-border)] text-[var(--accent)] focus:ring-[var(--accent)]"
                    />
                    <div className="flex-1">
                        <div className="text-sm font-bold text-[var(--text)]">{lead.wa_name || 'Unknown'}</div>
                        <div className="font-mono text-[10px] text-[var(--muted)]">{lead.wa_number}</div>
                    </div>
                  </label>
                ))}
                {leads.length === 0 ? (
                  <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-muted)] px-4 py-4 text-sm text-[var(--muted)]">
                    No leads are available for the selected project bot yet.
                  </div>
                ) : null}
              </div>
            </div>
          )}

          {step === 3 && result && (
            <div className="text-center py-12 space-y-4 animate-in zoom-in-95 duration-300">
              <div className="mb-4 inline-flex rounded-full border border-[rgba(52,211,153,0.28)] bg-[rgba(16,185,129,0.12)] p-4 text-emerald-500">
                <CheckCircle2 size={48} />
              </div>
              <h3 className="text-2xl font-black uppercase text-[var(--text)]">Campaign Sent</h3>
              <div className="flex justify-center gap-8 mt-6">
                 <div className="text-center">
                    <div className="text-2xl font-black text-[var(--accent)]">{result.successCount}</div>
                    <div className="text-[10px] font-black uppercase text-[var(--muted)]">Successful</div>
                 </div>
                 <div className="text-center">
                    <div className="text-2xl font-black text-rose-500">{result.failCount}</div>
                    <div className="text-[10px] font-black uppercase text-[var(--muted)]">Failed</div>
                 </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-between gap-3 border-t border-[var(--glass-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))] p-6">
          {step > 1 && step < 3 && (
            <button onClick={() => setStep(step - 1)} className="rounded-2xl border border-[var(--glass-border)] px-6 py-3 text-xs font-black uppercase text-[var(--muted)] transition duration-300 hover:-translate-y-0.5 hover:border-[var(--line-strong)] hover:text-[var(--text)]">Back</button>
          )}
          <div className="flex-1" />
          {step === 2 && (
            <button 
              disabled={!canLaunchCampaign || selectedLeads.length === 0 || isSending}
              onClick={handleLaunch}
              className="flex items-center gap-2 rounded-2xl border border-[rgba(129,140,248,0.34)] bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] px-8 py-3 text-xs font-black uppercase tracking-widest text-white shadow-[0_18px_32px_var(--accent-glow)] transition-all duration-300 hover:-translate-y-0.5 disabled:opacity-50"
            >
              {isSending ? <Loader2 className="animate-spin" size={16}/> : <Send size={16}/>}
              Launch Campaign
            </button>
          )}
          {step === 3 && (
            <button onClick={onClose} className="w-full rounded-2xl border border-[rgba(129,140,248,0.34)] bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] px-8 py-3 text-xs font-black uppercase tracking-widest text-white shadow-[0_18px_32px_var(--accent-glow)]">Done</button>
          )}
        </div>
      </div>
    </div>
  );
}
