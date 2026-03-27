import { useEffect, useState } from "react";
import { CloudDownload, RefreshCcw, X } from "lucide-react";

import apiClient from "../../services/apiClient";
import { notify } from "../../store/uiStore";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  campaigns: any[];
  onImported?: () => void;
};

export default function ImportFromMetaModal({ isOpen, onClose, campaigns, onImported }: Props) {
  const [campaignId, setCampaignId] = useState("");
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setCampaignId((current) => {
      if (current && campaigns.some((campaign) => campaign.id === current)) {
        return current;
      }
      return campaigns[0]?.id || "";
    });
  }, [campaigns, isOpen]);

  const handleImport = async () => {
    if (!campaignId) {
      notify("Select a campaign to import templates into.", "error");
      return;
    }

    setIsImporting(true);
    try {
      const res = await apiClient.post("/templates/import-meta", {
        campaign_id: campaignId,
      });
      notify(`Synced ${res.data?.importedCount || 0} templates from Meta.`, "success");
      onImported?.();
      onClose();
    } catch (err: any) {
      notify(err?.response?.data?.error || "Failed to sync templates from Meta.", "error");
    } finally {
      setIsImporting(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/55 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-glass)]">
        <div className="flex items-center justify-between border-b border-[var(--line)] bg-[var(--surface-strong)] p-6">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-tight text-[var(--text)]">
              <CloudDownload size={18} className="text-[var(--accent)]" />
              Sync All From Meta
            </h3>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Pull WhatsApp templates from the connected Meta business account and align them into one campaign.
            </p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-[var(--muted)] transition-all hover:bg-[var(--surface-muted)]">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-5 p-6">
          <div>
            <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">
              Campaign destination
            </label>
            <select
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value)}
              className="w-full rounded-xl border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] px-4 py-3 text-sm font-medium text-[var(--text)]"
            >
              <option value="">Select campaign</option>
              {campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-4 text-xs text-[var(--muted)]">
            This syncs templates from the WhatsApp business account linked to the selected campaign's active WhatsApp channel.
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-[var(--line)] bg-[var(--surface-strong)] p-6">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-2.5 text-xs font-black uppercase tracking-widest text-[var(--text)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={!campaignId || isImporting}
            className="inline-flex items-center gap-2 rounded-xl border border-[rgba(129,140,248,0.4)] bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] px-5 py-2.5 text-xs font-black uppercase tracking-widest text-white shadow-[0_18px_30px_var(--accent-glow)] disabled:opacity-50"
          >
            <RefreshCcw size={14} />
            {isImporting ? "Syncing..." : "Sync All Templates"}
          </button>
        </div>
      </div>
    </div>
  );
}
