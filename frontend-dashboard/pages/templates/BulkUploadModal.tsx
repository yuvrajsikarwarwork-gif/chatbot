import { useEffect, useMemo, useState } from "react";
import { Download, FileSpreadsheet, Send, Upload, X } from "lucide-react";

import apiClient from "../../services/apiClient";
import { notify } from "../../store/uiStore";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  templates: any[];
  campaigns: any[];
  initialTemplateId?: string;
};

const SAMPLE_CSV = [
  "name,email,phone,company,city",
  "Aarav Singh,aarav@example.com,919999999999,Iterra,Delhi",
  "Priya Sharma,priya@example.com,918888888888,StudioWeb,Mumbai",
].join("\n");

export default function BulkUploadModal({
  isOpen = false,
  onClose = () => undefined,
  templates = [],
  campaigns = [],
  initialTemplateId = "",
}: Partial<Props>) {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");

  const approvedTemplates = useMemo(
    () => templates.filter((template) => template.status === "approved"),
    [templates]
  );

  const selectedTemplate = approvedTemplates.find((template) => template.id === selectedTemplateId) || null;
  const selectedCampaignId = selectedTemplate?.campaign_id || "";
  const selectedCampaign = campaigns.find((campaign) => campaign.id === selectedCampaignId) || null;

  useEffect(() => {
    if (initialTemplateId) {
      setSelectedTemplateId(initialTemplateId);
    }
  }, [initialTemplateId]);

  const handleSampleDownload = () => {
    const blob = new Blob([SAMPLE_CSV], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "template-bulk-send-sample.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleUpload = async () => {
    if (!file || !selectedTemplate) return;
    if (!selectedCampaignId) {
      notify("Selected template is not connected to a campaign.", "error");
      return;
    }

    setIsUploading(true);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("template_id", selectedTemplate.id);
    formData.append("campaign_id", selectedCampaignId);
    formData.append("campaign_name", selectedCampaign?.name || "CSV Bulk Send");

    try {
      await apiClient.post("/upload/csv", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });
      notify("Bulk send started from uploaded CSV.", "success");
      onClose();
    } catch (err: any) {
      notify(err?.response?.data?.error || "Failed to process bulk send CSV.", "error");
    } finally {
      setIsUploading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/55 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-glass)]">
        <div className="flex items-center justify-between border-b border-[var(--line)] bg-[var(--surface-strong)] p-6">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-tight text-[var(--text)]">
              <FileSpreadsheet size={18} className="text-[var(--accent)]" />
              Bulk Send Template
            </h3>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Upload a CSV with `name`, `email`, and `phone`. Extra columns can be used as template variables later.
            </p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-[var(--muted)] transition-all hover:bg-[var(--surface-muted)]">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-6 p-6">
          <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
            <div>
              <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">
                Approved template
              </label>
              <select
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                className="w-full rounded-xl border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] px-4 py-3 text-sm font-medium text-[var(--text)]"
              >
                <option value="">Select template</option>
                {approvedTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-3">
              <div className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">Connected campaign</div>
              <div className="mt-2 text-sm font-bold text-[var(--text)]">
                {selectedCampaign?.name || "No campaign connected"}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleSampleDownload}
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-2.5 text-xs font-black uppercase tracking-widest text-[var(--text)]"
            >
              <Download size={14} />
              Download Sample CSV
            </button>
            <div className="text-xs text-[var(--muted)]">
              Sample columns: `name`, `email`, `phone`, plus any extra detail columns you want to keep.
            </div>
          </div>

          <div className={`relative rounded-2xl border-2 border-dashed p-8 text-center transition-all ${file ? "border-emerald-300 bg-emerald-50/60" : "border-[var(--line)] bg-[var(--surface-strong)]"}`}>
            <Upload size={28} className={`mx-auto ${file ? "text-emerald-600" : "text-[var(--muted)]"}`} />
            <input
              type="file"
              accept=".csv"
              className="absolute inset-0 cursor-pointer opacity-0"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            <div className="mt-4 text-sm font-bold text-[var(--text)]">
              {file ? file.name : "Choose CSV file"}
            </div>
            <div className="mt-1 text-xs text-[var(--muted)]">
              One row per contact. Phone is required for WhatsApp and SMS sends.
            </div>
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
            disabled={!file || !selectedTemplateId || !selectedCampaignId || isUploading}
            onClick={handleUpload}
            className="inline-flex items-center gap-2 rounded-xl border border-[rgba(129,140,248,0.4)] bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] px-5 py-2.5 text-xs font-black uppercase tracking-widest text-white shadow-[0_18px_30px_var(--accent-glow)] disabled:opacity-50"
          >
            <Send size={14} />
            {isUploading ? "Processing..." : "Upload And Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
