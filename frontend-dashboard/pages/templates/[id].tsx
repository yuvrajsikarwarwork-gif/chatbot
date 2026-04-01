import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { CloudUpload, Eye, RefreshCcw, Send, Upload } from "lucide-react";

import DashboardLayout from "../../components/layout/DashboardLayout";
import PageAccessNotice from "../../components/access/PageAccessNotice";
import BulkUploadModal from "./BulkUploadModal";
import SingleSendTemplateModal from "../../components/templates/SingleSendTemplateModal";
import apiClient from "../../services/apiClient";
import { notify } from "../../store/uiStore";
import { useVisibility } from "../../hooks/useVisibility";
import { campaignService } from "../../services/campaignService";
import { useAuthStore } from "../../store/authStore";

function isMetaSubmitted(template: any) {
  return Boolean(template?.meta_template_id || template?.meta_template_name);
}

function getReadinessMessage(template: any) {
  switch (String(template?.runtime_readiness || "").toLowerCase()) {
    case "missing_runtime_asset":
      return "Missing runtime media asset";
    case "broken_meta_link":
      return "Broken Meta link";
    case "in_review":
      return "In review on Meta";
    default:
      return "Ready to send";
  }
}

function getMetaButtonClass(active: boolean) {
  return active
    ? "inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-emerald-800 transition-all hover:-translate-y-[1px] hover:border-emerald-400 hover:bg-emerald-100 hover:text-emerald-900"
    : "inline-flex items-center gap-2 rounded-xl border border-border-main bg-surface px-4 py-2.5 text-xs font-black uppercase tracking-widest text-text-main transition-all hover:-translate-y-[1px] hover:border-primary/30 hover:bg-canvas";
}

function renderPreview(template: any) {
  const rawContent =
    typeof template?.content === "string" ? JSON.parse(template.content) : template?.content || {};
  const content = {
    header:
      rawContent?.header ??
      (template?.header_type && template?.header_type !== "none"
        ? { type: template.header_type, text: template.header || "" }
        : null),
    body: rawContent?.body || template?.body || "",
    footer: rawContent?.footer || template?.footer || "",
  };
  return (
    <div className="rounded-[1.5rem] border border-border-main bg-surface p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-text-muted">
        <Eye size={12} />
        Live Preview
      </div>
      <div className="mx-auto max-w-[420px] rounded-[1.5rem] border border-border-main bg-surface shadow-sm">
        <div className="border-b border-border-main px-4 py-3 text-sm font-bold text-text-main">
          {template.platform_type || "message"} template
        </div>
        <div className="space-y-3 px-4 py-4">
          {content?.header ? (
            <div className="rounded-xl bg-canvas p-3 text-sm text-text-muted">
              {content.header.type === "text" ? content.header.text : `${content.header.type} header`}
            </div>
          ) : null}
          <div className="rounded-2xl bg-[#efeae2] px-4 py-3">
            <div className="rounded-2xl bg-[#dcf8c6] px-4 py-3 text-sm leading-6 text-text-main">
              {content?.body || "No body"}
              {content?.footer ? (
                <div className="mt-3 border-t border-black/5 pt-2 text-[11px] text-text-muted">{content.footer}</div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TemplateDetailPage() {
  const router = useRouter();
  const { canViewPage, isReadOnly } = useVisibility();
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);
  const activeProject = useAuthStore((state) => state.activeProject);
  const [template, setTemplate] = useState<any>(null);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [isSingleSendModalOpen, setIsSingleSendModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const canViewTemplatesPage = canViewPage("templates");
  const templateId = useMemo(() => String(router.query.id || ""), [router.query.id]);
  const metaSubmitted = isMetaSubmitted(template);
  const hasTemplateScope = Boolean(activeWorkspace?.workspace_id);
  const canMutateTemplate = !isReadOnly;

  const loadPage = async () => {
    if (!templateId || !hasTemplateScope) {
      setTemplate(null);
      setLoadError("");
      setIsLoading(!templateId ? false : true);
      return;
    }
    setIsLoading(true);
    setLoadError("");
    try {
      const [templateRes, campaignRows] = await Promise.all([
        apiClient.get(`/templates/${templateId}`),
        activeWorkspace?.workspace_id && activeProject?.id
          ? campaignService.list({
              workspaceId: activeWorkspace.workspace_id,
              projectId: activeProject.id,
            })
          : Promise.resolve([]),
      ]);
      setTemplate(templateRes.data);
      setCampaigns(campaignRows || []);
    } catch (err: any) {
      const message = err?.response?.data?.error || "Failed to load template.";
      setTemplate(null);
      setLoadError(message);
      notify(message, "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!router.isReady || !canViewTemplatesPage || !hasTemplateScope) return;
    loadPage();
  }, [router.isReady, canViewTemplatesPage, hasTemplateScope, templateId, activeWorkspace?.workspace_id, activeProject?.id]);

  const handleSubmitToMeta = async () => {
    if (!canMutateTemplate) {
      return;
    }
    try {
      const response = await apiClient.post(`/templates/${templateId}/submit-meta`);
      if (response?.data?.template) {
        setTemplate(response.data.template);
      }
      notify("Template submitted to Meta.", "success");
      setTimeout(() => {
        loadPage().catch(console.error);
      }, 1200);
    } catch (err: any) {
      notify(err?.response?.data?.error || "Failed to submit template to Meta.", "error");
    }
  };

  const handleSyncMeta = async () => {
    if (!canMutateTemplate) {
      return;
    }
    try {
      const response = await apiClient.post(`/templates/${templateId}/sync-meta`);
      if (response?.data?.template) {
        setTemplate(response.data.template);
      }
      notify("Template synced from Meta.", "success");
      setTimeout(() => {
        loadPage().catch(console.error);
      }, 1200);
    } catch (err: any) {
      notify(err?.response?.data?.error || "Failed to sync template.", "error");
    }
  };

  if (!canViewTemplatesPage) {
    return (
      <DashboardLayout>
        <PageAccessNotice title="Templates are restricted for this role" description="Templates are available to workspace admins and project operators with campaign access." href="/" ctaLabel="Open dashboard" />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-7xl space-y-6">
        {!router.isReady || isLoading ? (
          <section className="rounded-[1.5rem] border border-border-main bg-surface p-8 text-sm text-text-muted">
            Loading template...
          </section>
        ) : loadError || !template ? (
          <section className="rounded-[1.5rem] border border-rose-200 bg-rose-50 p-8 text-sm text-rose-700">
            {loadError || "Template could not be loaded."}
          </section>
        ) : (
          <>
            <section className="rounded-[1.75rem] border border-border-main bg-surface p-6 shadow-sm">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-text-muted">Template detail</div>
                  <h1 className="mt-3 text-[1.9rem] font-extrabold tracking-tight text-text-main">{template.name}</h1>
                  <div className="mt-2 text-sm text-text-muted">
                    Platform: {template.platform_type} / Status: {template.status}
                  </div>
                  {template.platform_type === "whatsapp" ? (
                    <div className="mt-2 text-sm text-text-muted">
                      Meta: {metaSubmitted ? "Submitted / linked" : "Not submitted yet"}
                    </div>
                  ) : null}
                  <div className="mt-2 text-sm text-text-muted">
                    Runtime: {getReadinessMessage(template)}
                  </div>
                  {template.rejected_reason ? (
                    <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                      {template.rejected_reason}
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-3">
                  {template.platform_type === "whatsapp" ? (
                    <>
                      <button
                        onClick={handleSubmitToMeta}
                        disabled={metaSubmitted || !canMutateTemplate}
                        className={`${getMetaButtonClass(metaSubmitted)} ${metaSubmitted ? "cursor-not-allowed opacity-80" : ""}`}
                        title={metaSubmitted ? "Already linked to Meta" : "Submit to Meta"}
                      >
                        <CloudUpload size={14} />
                        {metaSubmitted ? "Linked to Meta" : "Submit to Meta"}
                      </button>
                      <button
                        onClick={handleSyncMeta}
                        disabled={!canMutateTemplate}
                        className={getMetaButtonClass(metaSubmitted)}
                      >
                        <RefreshCcw size={14} />
                        Sync Status
                      </button>
                    </>
                  ) : null}
                  <button onClick={() => setIsBulkModalOpen(true)} disabled={!canMutateTemplate || template.status !== "approved" || template.runtime_readiness === "missing_runtime_asset" || template.runtime_readiness === "broken_meta_link"} className="inline-flex items-center gap-2 rounded-xl border border-primary bg-primary px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50">
                    <Upload size={14} />
                    Bulk Send
                  </button>
                  <button onClick={() => setIsSingleSendModalOpen(true)} disabled={!canMutateTemplate || template.status !== "approved" || template.runtime_readiness === "missing_runtime_asset" || template.runtime_readiness === "broken_meta_link"} className="inline-flex items-center gap-2 rounded-xl border border-border-main bg-surface px-4 py-2.5 text-xs font-black uppercase tracking-widest text-text-main transition-all hover:-translate-y-[1px] hover:border-primary/30 hover:bg-canvas disabled:opacity-50">
                    <Send size={14} />
                    Send Once
                  </button>
                </div>
              </div>
            </section>

            <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
              <section className="rounded-[1.5rem] border border-border-main bg-surface p-6 shadow-sm">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-border-main bg-canvas p-4">
                    <div className="text-[10px] font-black uppercase tracking-widest text-text-muted">Campaign</div>
                    <div className="mt-2 text-lg font-bold text-text-main">{campaigns.find((row) => row.id === template.campaign_id)?.name || "Connected campaign"}</div>
                  </div>
                  <div className="rounded-2xl border border-border-main bg-canvas p-4">
                    <div className="text-[10px] font-black uppercase tracking-widest text-text-muted">Meta template id</div>
                    <div className="mt-2 break-all text-sm font-medium text-text-main">
                      {template.meta_template_id || template.meta_template_name || "Not submitted yet"}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-border-main bg-canvas p-4">
                    <div className="text-[10px] font-black uppercase tracking-widest text-text-muted">Category</div>
                    <div className="mt-2 text-lg font-bold text-text-main">{template.category}</div>
                  </div>
                  <div className="rounded-2xl border border-border-main bg-canvas p-4">
                    <div className="text-[10px] font-black uppercase tracking-widest text-text-muted">Language</div>
                    <div className="mt-2 text-lg font-bold text-text-main">{template.language}</div>
                  </div>
                  <div className="rounded-2xl border border-border-main bg-canvas p-4">
                    <div className="text-[10px] font-black uppercase tracking-widest text-text-muted">Origin</div>
                    <div className="mt-2 text-lg font-bold capitalize text-text-main">{String(template.template_origin || "local").replace(/_/g, " ")}</div>
                  </div>
                  <div className="rounded-2xl border border-border-main bg-canvas p-4">
                    <div className="text-[10px] font-black uppercase tracking-widest text-text-muted">Runtime readiness</div>
                    <div className="mt-2 text-lg font-bold text-text-main">{getReadinessMessage(template)}</div>
                  </div>
                </div>
              </section>

              {renderPreview(template)}
            </div>
          </>
        )}

        <BulkUploadModal
          isOpen={isBulkModalOpen}
          onClose={() => setIsBulkModalOpen(false)}
          templates={template ? [template] : []}
          campaigns={campaigns}
          initialTemplateId={template?.id || ""}
        />
        <SingleSendTemplateModal
          isOpen={isSingleSendModalOpen}
          onClose={() => setIsSingleSendModalOpen(false)}
          template={template}
        />
      </div>
    </DashboardLayout>
  );
}


