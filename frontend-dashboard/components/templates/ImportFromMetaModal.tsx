import { useEffect, useMemo, useState } from "react";
import { CheckSquare, CloudDownload, RefreshCcw, Square, X } from "lucide-react";

import apiClient from "../../services/apiClient";
import { campaignService } from "../../services/campaignService";
import { useAuthStore } from "../../store/authStore";
import { notify } from "../../store/uiStore";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  campaigns: any[];
  onImported?: () => void;
};

type MetaTemplatePreview = {
  id?: string;
  name?: string;
  language?: string;
  category?: string;
};

export default function ImportFromMetaModal({ isOpen, onClose, campaigns, onImported }: Props) {
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);
  const activeProject = useAuthStore((state) => state.activeProject);
  const [campaignId, setCampaignId] = useState("");
  const [isFetching, setIsFetching] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [templates, setTemplates] = useState<MetaTemplatePreview[]>([]);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);
  const [campaignOptions, setCampaignOptions] = useState<any[]>(campaigns);

  const selectedCount = selectedTemplateIds.length;
  const selectedCampaignId = campaignId;
  const allSelected = templates.length > 0 && selectedCount === templates.length;
  const previewLabel = useMemo(
    () => (templates.length > 0 ? `${selectedCount} selected` : "No templates fetched"),
    [selectedCount, templates.length]
  );
  console.log("Modal Campaigns:", campaigns);

  useEffect(() => {
    setCampaignOptions(campaigns);
  }, [campaigns]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setCampaignId((current) => {
      if (current && campaignOptions.some((campaign) => String(campaign.id) === String(current))) {
        return current;
      }
      return campaignOptions[0]?.id || "";
    });
    setStep(1);
    setTemplates([]);
    setSelectedTemplateIds([]);
  }, [campaignOptions, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const loadCampaigns = async () => {
      const workspaceId = String(activeWorkspace?.workspace_id || "").trim();
      const projectId = String(activeProject?.id || "").trim();

      if (!workspaceId || !projectId) {
        setCampaignOptions(campaigns);
        return;
      }

      try {
        const rows = await campaignService.list({
          workspaceId,
          projectId,
        });
        setCampaignOptions(Array.isArray(rows) ? rows : []);
      } catch (error) {
        console.error("Failed to load campaigns for Meta sync modal", error);
        setCampaignOptions(campaigns);
      }
    };

    loadCampaigns();
  }, [activeProject?.id, activeWorkspace?.workspace_id, campaigns, isOpen]);

  const fetchTemplates = async () => {
    if (!selectedCampaignId || selectedCampaignId.trim() === "") {
      notify("Select a campaign before fetching templates.", "error");
      return;
    }

    setIsFetching(true);
    try {
      const res = await apiClient.post("/templates/import-meta/preview", {
        campaign_id: selectedCampaignId.trim(),
      });
      const nextTemplates = Array.isArray(res.data?.templates) ? res.data.templates : [];
      setTemplates(nextTemplates);
      setSelectedTemplateIds(
        nextTemplates
          .map((template: MetaTemplatePreview) => String(template?.id || "").trim())
          .filter(Boolean)
      );
      setStep(2);
      notify(`Fetched ${nextTemplates.length} templates from Meta.`, "success");
    } catch (err: any) {
      notify(
        err?.response?.data?.error || "Failed to fetch templates from Meta.",
        "error"
      );
    } finally {
      setIsFetching(false);
    }
  };

  const toggleTemplate = (templateId: string) => {
    setSelectedTemplateIds((current) =>
      current.includes(templateId)
        ? current.filter((id) => id !== templateId)
        : [...current, templateId]
    );
  };

  const handleSelectAll = () => {
    if (allSelected) {
      setSelectedTemplateIds([]);
      return;
    }

    setSelectedTemplateIds(
      templates.map((template) => String(template?.id || "").trim()).filter(Boolean)
    );
  };

  const handleImportSelected = async () => {
    if (!selectedCampaignId || selectedCampaignId.trim() === "") {
      notify("Select a campaign first.", "error");
      return;
    }

    if (selectedTemplateIds.length === 0) {
      notify("Select at least one template to import.", "error");
      return;
    }

    setIsImporting(true);
    try {
      const res = await apiClient.post("/templates/import-meta", {
        campaign_id: selectedCampaignId.trim(),
        selectedTemplateIds,
      });
      notify(`Imported ${res.data?.importedCount || 0} selected templates from Meta.`, "success");
      onImported?.();
      setStep(1);
      setTemplates([]);
      setSelectedTemplateIds([]);
      onClose();
    } catch (err: any) {
      notify(err?.response?.data?.error || "Failed to import selected templates.", "error");
    } finally {
      setIsImporting(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/55 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl overflow-hidden rounded-[2rem] border border-border-main bg-surface p-8 shadow-sm">
        <div className="flex items-center justify-between border-b border-border-main bg-surface pb-6">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-tight text-text-main">
              <CloudDownload size={18} className="text-[var(--accent)]" />
              Sync Templates From Meta
            </h3>
            <p className="mt-1 text-xs text-text-muted">
              Fetch a preview from the connected WhatsApp business account, then choose which templates to import.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-text-muted transition-all hover:bg-canvas"
          >
            <X size={18} />
          </button>
        </div>

        <div className="border-b border-border-main bg-surface px-0 py-4">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">
            <span className={`rounded-full px-3 py-1 ${step === 1 ? "bg-primary text-white" : "bg-canvas"}`}>
              1. Campaign
            </span>
            <span className="h-px w-8 bg-border-main" />
            <span className={`rounded-full px-3 py-1 ${step === 2 ? "bg-primary text-white" : "bg-canvas"}`}>
              2. Select
            </span>
          </div>
        </div>

        {step === 1 ? (
          <div className="space-y-5 py-6">
            <div>
              <label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-text-muted">
                Campaign destination
              </label>
              <select
                value={selectedCampaignId}
                onChange={(e) => {
                  console.log("Selected ID:", e.target.value);
                  setCampaignId(e.target.value);
                }}
                className="w-full rounded-xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50"
              >
                {campaignOptions.length === 0 ? (
                  <option value="">No active campaigns found. Create one first.</option>
                ) : (
                  <>
                    <option value="">Select campaign</option>
                    {campaignOptions.map((campaign) => (
                      <option key={campaign.id} value={String(campaign.id)}>
                        {campaign.name}
                      </option>
                    ))}
                  </>
                )}
              </select>
            </div>

            <div className="rounded-2xl border border-border-main bg-canvas px-4 py-4 text-xs text-text-muted">
              Fetching will preview templates only. Nothing is saved until you choose which ones to import.
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-6" id="step-2-template-checklist">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-black uppercase tracking-widest text-text-muted">
                {previewLabel}
              </div>
              <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-border-main bg-canvas px-4 py-3 text-[10px] font-black uppercase tracking-[0.15em] text-text-main transition-all hover:border-primary hover:bg-primary/5">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={handleSelectAll}
                  className="h-5 w-5 rounded border-border-main text-primary focus:ring-primary"
                  aria-label={allSelected ? "Clear all templates" : "Select all templates"}
                />
                <span>{allSelected ? "Clear All" : "Select All"}</span>
              </label>
            </div>

            <div className="max-h-[360px] overflow-y-auto rounded-[2rem] border border-border-main bg-surface p-2">
              {templates.length === 0 ? (
                <div className="p-6 text-sm text-text-muted">
                  No templates were returned from Meta for this campaign.
                </div>
              ) : (
                <ul className="space-y-3">
                  {templates.map((template) => {
                    const templateId = String(template?.id || "").trim();
                    const checked = selectedTemplateIds.includes(templateId);
                    const status = String((template as any)?.status || "").toLowerCase();
                    const category = String(template?.category || "").trim();
                    const badgeClass =
                      status === "approved"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : status === "rejected"
                          ? "border-rose-200 bg-rose-50 text-rose-700"
                          : "border-amber-200 bg-amber-50 text-amber-700";
                    const badgeLabel = status ? status.toUpperCase() : "PENDING";
                    return (
                      <li key={templateId || `${template?.name || "template"}`}>
                        <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-border-main bg-canvas p-4 transition-colors hover:border-primary/30 hover:bg-primary/5 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold text-text-main">
                              {template?.name || "Unnamed template"}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-text-muted">
                              <span>Language: {template?.language || "unknown"}</span>
                              <span>Category: {category || "Marketing"}</span>
                              <span className={`rounded-md border px-2 py-1 ${badgeClass} text-[9px] font-black uppercase tracking-widest`}>
                                {badgeLabel}
                              </span>
                            </div>
                          </div>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleTemplate(templateId)}
                            className="h-5 w-5 rounded border-border-main text-primary focus:ring-primary"
                            aria-label={checked ? "Unselect template" : "Select template"}
                          />
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3 border-t border-border-main bg-surface pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-[10px] font-black uppercase tracking-widest text-text-muted">
            {step === 2 && templates.length > 0
              ? `${selectedCount} selected of ${templates.length}`
              : "Step 1 of 2"}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl border border-border-main bg-canvas py-3 px-6 text-[10px] font-black uppercase tracking-[0.15em] text-text-main transition-all hover:bg-surface active:scale-95"
            >
              Cancel
            </button>
            {step === 2 ? (
              <button
                type="button"
                onClick={() => setStep(1)}
                className="rounded-2xl border border-border-main bg-canvas py-3 px-6 text-[10px] font-black uppercase tracking-[0.15em] text-text-main transition-all hover:bg-surface active:scale-95"
              >
                Back
              </button>
            ) : null}
            {step === 1 ? (
              <button
                type="button"
                onClick={fetchTemplates}
                disabled={!selectedCampaignId || isFetching}
                className="inline-flex items-center gap-2 rounded-2xl border border-primary bg-primary py-3 px-6 text-[10px] font-black uppercase tracking-[0.15em] text-white shadow-sm transition-all hover:-translate-y-0.5 active:scale-95 disabled:opacity-50"
              >
                <RefreshCcw size={14} />
                {isFetching ? "Fetching..." : "Fetch Templates"}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleImportSelected}
                disabled={selectedTemplateIds.length === 0 || isImporting}
                className="inline-flex items-center gap-2 rounded-2xl border border-primary bg-primary py-3 px-6 text-[10px] font-black uppercase tracking-[0.15em] text-white shadow-sm transition-all hover:-translate-y-0.5 active:scale-95 disabled:opacity-50"
              >
                <RefreshCcw size={14} />
                {isImporting ? "Importing..." : "Import Selected"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
