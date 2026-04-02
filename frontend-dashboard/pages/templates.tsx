import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { io } from "socket.io-client";
import apiClient from "../services/apiClient";
import RequirePermission from "../components/access/RequirePermission";
import DashboardLayout from "../components/layout/DashboardLayout";
import { useVisibility } from "../hooks/useVisibility";
import { campaignService } from "../services/campaignService";
import { projectService } from "../services/projectService";
import { workspaceService } from "../services/workspaceService";
import { API_URL } from "../config/apiConfig";
import {
  Plus, Trash2, Edit, MessageSquare,
  Mail, Send, Globe, LayoutTemplate,
  CheckCircle, Clock, BarChart3, ShieldCheck, ShieldAlert, Timer, Eye, Upload, RefreshCcw, CloudUpload
} from "lucide-react";
import CampaignSenderModal from "../components/campaign/CampaignSenderModal";
import BulkUploadModal from "./templates/BulkUploadModal";
import ImportFromMetaModal from "../components/templates/ImportFromMetaModal";
import SingleSendTemplateModal from "../components/templates/SingleSendTemplateModal";
import { confirmAction, notify } from "../store/uiStore";
import { useAuthStore } from "../store/authStore";

function getSocketServerUrl() {
  return API_URL.replace(/\/api\/?$/, "");
}

export default function TemplatesPage() {
  const router = useRouter();
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);
  const activeProject = useAuthStore((state) => state.activeProject);
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const setActiveWorkspace = useAuthStore((state) => state.setActiveWorkspace);
  const setActiveProject = useAuthStore((state) => state.setActiveProject);
  const hasWorkspacePermission = useAuthStore((state) => state.hasWorkspacePermission);
  const getProjectRole = useAuthStore((state) => state.getProjectRole);
  const { isPlatformOperator } = useVisibility();
  const [activeView, setActiveView] = useState<"templates" | "campaigns">("templates");
  const [templates, setTemplates] = useState<any[]>([]);
  const [campaignLogs, setCampaignLogs] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPlatform, setSelectedPlatform] = useState("whatsapp");
  const [selectedStatus, setSelectedStatus] = useState("all");
  
  const [isCampaignModalOpen, setIsCampaignModalOpen] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkTemplateId, setBulkTemplateId] = useState<string>("");
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [singleSendTemplate, setSingleSendTemplate] = useState<any | null>(null);
  const canCreateTemplates = hasWorkspacePermission(activeWorkspace?.workspace_id, "can_create_campaign");
  const canEditTemplates = hasWorkspacePermission(activeWorkspace?.workspace_id, "edit_campaign");
  const canDeleteTemplates = hasWorkspacePermission(activeWorkspace?.workspace_id, "delete_campaign");
  const projectRole = getProjectRole(activeProject?.id);
  const canCreateProjectTemplates =
    canCreateTemplates || projectRole === "project_admin" || projectRole === "editor";
  const canEditProjectTemplates =
    canEditTemplates || projectRole === "project_admin" || projectRole === "editor";
  const canDeleteProjectTemplates =
    canDeleteTemplates || projectRole === "project_admin";
  const shouldHoldForWorkspace =
    !hasHydrated ||
    (!isPlatformOperator && !activeWorkspace?.workspace_id);

  useEffect(() => {
    if (!hasHydrated || isPlatformOperator) {
      return;
    }

    if (activeWorkspace?.workspace_id && activeProject?.id) {
      return;
    }

    let cancelled = false;

    const setProjectFromList = (workspaceId: string, projectSource: any) => {
      if (cancelled) {
        return;
      }

      const projectList = Array.isArray(projectSource)
        ? projectSource
        : Array.isArray(projectSource?.data)
          ? projectSource.data
          : [];

      const nextProject = projectList[0] || null;
      if (nextProject?.id) {
        setActiveProject({
          id: nextProject.id,
          workspace_id: nextProject.workspace_id,
          name: nextProject.name,
          status: nextProject.status,
          is_default: nextProject.is_default,
        });
      }
    };

    if (activeWorkspace?.workspace_id && !activeProject?.id) {
      projectService.list(activeWorkspace.workspace_id)
        .then((res) => setProjectFromList(activeWorkspace.workspace_id, res))
        .catch((err) => {
          console.error("Failed to resolve fallback project", err);
        });
    } else if (!activeWorkspace?.workspace_id) {
      workspaceService
        .list()
        .then((rows) => {
          if (cancelled) {
            return;
          }

          const workspaceList = Array.isArray(rows)
            ? rows
            : Array.isArray((rows as any)?.data)
              ? (rows as any).data
              : [];
          const firstWorkspace = workspaceList[0] || null;
          if (firstWorkspace?.id) {
            setActiveWorkspace(firstWorkspace.id);
            projectService.list(firstWorkspace.id)
              .then((res) => setProjectFromList(firstWorkspace.id, res))
              .catch((err) => {
                console.error("Failed to resolve fallback project", err);
              });
          }
        })
        .catch((err) => {
          console.error("Failed to resolve fallback workspace", err);
        });
    }

    return () => {
      cancelled = true;
    };
  }, [
    activeWorkspace?.workspace_id,
    activeProject?.id,
    hasHydrated,
    isPlatformOperator,
    router,
    setActiveWorkspace,
    setActiveProject,
  ]);

  const buildTemplateContent = (template: any) => ({
    header: template?.header_type && template?.header_type !== "none"
      ? { type: template.header_type || "text", text: template.header || "" }
      : null,
    body: template?.body || "",
    footer: template?.footer || "",
    buttons: Array.isArray(template?.buttons) ? template.buttons : [],
  });

  const parseTemplateContent = (template: any) => {
    if (!template?.content) return buildTemplateContent(template);
    return typeof template.content === "string" ? JSON.parse(template.content) : template.content;
  };

  const getTemplatePreview = (template: any) => {
    const content = parseTemplateContent(template);
    return content?.body || template.body || "No preview available";
  };

  const isMetaSubmitted = (template: any) =>
    Boolean(template?.meta_template_id || template?.meta_template_name);

  const getMetaActionClass = (template: any, disabled = false) => {
    if (disabled) {
      return "rounded-lg p-2 text-text-muted transition-all disabled:cursor-not-allowed disabled:opacity-40";
    }

    return isMetaSubmitted(template)
      ? "rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-emerald-700 transition-all hover:-translate-y-[1px] hover:border-emerald-300 hover:bg-emerald-100 hover:text-emerald-800"
      : "rounded-lg border border-border-main p-2 text-text-muted transition-all hover:-translate-y-[1px] hover:border-primary/30 hover:bg-primary-fade hover:text-primary";
  };

  const getMetaSourceLabel = (template: any) => {
    if (isMetaSubmitted(template)) {
      return "Linked to Meta";
    }

    switch (String(template?.template_origin || "").toLowerCase()) {
      case "meta_imported":
        return "Imported from Meta";
      case "repaired":
        return "Recovered";
      default:
        return "Local";
    }
  };

  const getReadinessBadge = (template: any) => {
    switch (String(template?.runtime_readiness || "").toLowerCase()) {
      case "missing_runtime_asset":
        return <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-amber-700">Missing media asset</span>;
      case "broken_meta_link":
        return <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-rose-700">Broken meta link</span>;
      case "in_review":
        return <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-sky-700">In review</span>;
      default:
        return <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-emerald-700">Ready</span>;
    }
  };

  // Helper for Status Badges
  const getStatusBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'approved': 
        return <span className="flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase text-emerald-700"><ShieldCheck size={12}/> Approved</span>;
      case 'rejected': 
        return <span className="flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1 text-[10px] font-black uppercase text-rose-700"><ShieldAlert size={12}/> Rejected</span>;
      case 'paused':
        return <span className="flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-black uppercase text-amber-700"><Timer size={12}/> Paused</span>;
      case 'draft':
        return <span className="flex items-center gap-1 rounded-md border border-border-main/40 bg-canvas px-2.5 py-1 text-[10px] font-black uppercase text-text-main"><Clock size={12}/> Draft</span>;
      default: 
        return <span className="flex items-center gap-1 rounded-md border border-border-main bg-canvas px-2.5 py-1 text-[10px] font-black uppercase text-text-muted"><Timer size={12}/> Pending</span>;
    }
  };

  const fetchCampaigns = async () => {
    if (!activeWorkspace?.workspace_id || !activeProject?.id) {
      setCampaigns([]);
      return;
    }

    try {
      const campaignRows = await campaignService.list({
        workspaceId: activeWorkspace.workspace_id,
        projectId: activeProject.id,
      }).catch(() => []);
      setCampaigns(campaignRows);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchTemplates = async () => {
    if (!activeWorkspace?.workspace_id || !activeProject?.id) {
      setTemplates([]);
      setCampaignLogs([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const res = await apiClient.get(`/templates`, {
        params: {
          platform: selectedPlatform,
          workspaceId: activeWorkspace.workspace_id,
          projectId: activeProject.id,
        },
      });
      const rows = Array.isArray(res.data) ? res.data : [];
      setTemplates(
        selectedStatus === "all"
          ? rows
          : rows.filter((row: any) => {
              const status = String(row.status || "").toLowerCase();
              if (selectedStatus === "pending") {
                return status === "pending" || status === "in_review";
              }
              return status === selectedStatus;
            })
      );
      
      try {
        const logs = await apiClient.get(`/templates/logs`, {
          params: {
            platform: selectedPlatform,
            workspaceId: activeWorkspace.workspace_id,
            projectId: activeProject.id,
          },
        });
        setCampaignLogs(logs.data || []);
      } catch (logErr) {
        setCampaignLogs([]);
      }
    } catch (err) { console.error(err); } finally { setIsLoading(false); }
  };

  useEffect(() => {
    fetchCampaigns();
  }, [activeWorkspace?.workspace_id, activeProject?.id]);
  useEffect(() => {
    fetchTemplates();
  }, [selectedPlatform, selectedStatus, activeView, activeWorkspace?.workspace_id, activeProject?.id]);

  useEffect(() => {
    const socket = io(getSocketServerUrl());
    const handleTemplateStatusUpdate = (payload: any) => {
      if (!payload?.templateId) {
        return;
      }
      setTemplates((current) =>
        current.map((template) =>
          template.id === payload.templateId
            ? {
                ...template,
                status: payload.status || template.status,
                rejected_reason: payload.rejectedReason ?? template.rejected_reason,
                meta_template_id: payload.metaTemplateId ?? template.meta_template_id,
                meta_template_name: payload.metaTemplateName ?? template.meta_template_name,
                updated_at: payload.updatedAt || template.updated_at,
              }
            : template
        )
      );
    };

    socket.on("template_status_update", handleTemplateStatusUpdate);
    return () => {
      socket.off("template_status_update", handleTemplateStatusUpdate);
      socket.disconnect();
    };
  }, []);

  const handleDelete = async (id: string) => {
    if (!canDeleteProjectTemplates) {
      notify("You can view templates here, but you cannot delete them.", "error");
      return;
    }
    if (!(await confirmAction("Delete template", "This template will be removed permanently.", "Delete"))) return;
    try {
      await apiClient.delete(`/templates/${id}`);
      fetchTemplates();
    } catch (err: any) { notify(err?.response?.data?.error || "Error deleting template.", "error"); }
  };

  const handleSubmitToMeta = async (templateId: string) => {
    try {
      const response = await apiClient.post(`/templates/${templateId}/submit-meta`);
      if (response?.data?.template) {
        setTemplates((current) =>
          current.map((template) =>
            template.id === templateId ? { ...template, ...response.data.template } : template
          )
        );
      }
      notify("Template submitted to Meta.", "success");
      setTimeout(() => {
        fetchTemplates().catch(console.error);
      }, 1200);
    } catch (err: any) {
      notify(err?.response?.data?.error || "Failed to submit template to Meta.", "error");
    }
  };

  const handleSyncMetaStatus = async (templateId: string) => {
    try {
      const response = await apiClient.post(`/templates/${templateId}/sync-meta`);
      if (response?.data?.template) {
        setTemplates((current) =>
          current.map((template) =>
            template.id === templateId ? { ...template, ...response.data.template } : template
          )
        );
      }
      notify("Template status synced from Meta.", "success");
      setTimeout(() => {
        fetchTemplates().catch(console.error);
      }, 1200);
    } catch (err: any) {
      notify(err?.response?.data?.error || "Failed to sync template status.", "error");
    }
  };

  const platforms = [
    { id: "whatsapp", name: "WhatsApp", icon: MessageSquare },
    { id: "telegram", name: "Telegram", icon: Send },
    { id: "email", name: "Email", icon: Mail },
    { id: "facebook", name: "Facebook", icon: Globe },
    { id: "instagram", name: "Instagram", icon: Globe }
  ];

  if (shouldHoldForWorkspace) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center rounded-[2rem] border border-dashed border-border-main bg-surface px-6 py-12 text-sm font-semibold tracking-wide text-text-muted">
        Loading workspace context...
      </div>
    );
  }

  return (
    <>
      <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden px-4 pb-4 pt-1 md:px-5 md:pb-5 md:pt-1">
        {!activeWorkspace?.workspace_id || !activeProject?.id ? (
          <div className="mx-auto mb-4 w-full max-w-7xl rounded-2xl border border-dashed border-border-main bg-canvas p-6 text-sm text-text-muted">
            Select a workspace and project before managing templates.
          </div>
        ) : null}
        
        <div className="mx-auto mb-4 w-full max-w-7xl">
          <div className="flex items-center justify-center">
            <div className="flex w-fit items-center gap-2 rounded-2xl border border-border-main bg-surface p-1.5 shadow-sm">
            <button onClick={() => setActiveView("templates")} className={`rounded-xl px-6 py-2.5 text-xs font-black uppercase tracking-widest transition-all ${activeView === 'templates' ? 'border border-primary/30 bg-primary-fade text-primary shadow-sm' : 'text-text-muted hover:text-text-main'}`}>Templates</button>
            <button onClick={() => setActiveView("campaigns")} className={`rounded-xl px-6 py-2.5 text-xs font-black uppercase tracking-widest transition-all ${activeView === 'campaigns' ? 'border border-primary/30 bg-primary-fade text-primary shadow-sm' : 'text-text-muted hover:text-text-main'}`}>Delivery Activity</button>
          </div>
          </div>

          {activeView === 'templates' && (
              <div className="mt-3 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex flex-col gap-3 sm:flex-row xl:flex-1">
                  <div className="min-w-0 sm:w-[220px]">
                    <label className="mb-1 block text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">
                      Channel
                    </label>
                    <select
                      value={selectedPlatform}
                      onChange={(event) => setSelectedPlatform(event.target.value)}
                      className="w-full rounded-xl border border-border-main bg-surface px-4 py-3 text-sm font-semibold text-text-main shadow-sm outline-none"
                    >
                      {platforms.map((platform) => (
                        <option key={platform.id} value={platform.id}>
                          {platform.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="min-w-0 sm:w-[220px]">
                    <label className="mb-1 block text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">
                      Status
                    </label>
                    <select
                      value={selectedStatus}
                      onChange={(event) => setSelectedStatus(event.target.value)}
                      className="w-full rounded-xl border border-border-main bg-surface px-4 py-3 text-sm font-semibold text-text-main shadow-sm outline-none"
                    >
                      {[
                        { id: "all", label: "All" },
                        { id: "draft", label: "Drafts" },
                        { id: "pending", label: "Pending" },
                        { id: "approved", label: "Approved" },
                        { id: "rejected", label: "Rejected" },
                        { id: "paused", label: "Paused" },
                      ].map((status) => (
                        <option key={status.id} value={status.id}>
                          {status.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 xl:justify-end">
                <RequirePermission permissionKey="can_create_campaign">
                  <button
                    onClick={() => setIsCampaignModalOpen(true)} 
                    disabled={!canCreateProjectTemplates}
                    className="inline-flex min-h-[52px] items-center gap-2 rounded-xl border border-border-main bg-surface px-5 py-2.5 text-sm font-bold text-text-main transition-all hover:border-primary/30 hover:bg-canvas"
                  >
                    <Send size={18} /> Launch Campaign
                  </button>
                </RequirePermission>
                {selectedPlatform === "whatsapp" ? (
                  <RequirePermission permissionKey="can_create_campaign">
                    <button
                      onClick={() => setIsImportModalOpen(true)}
                      disabled={!canCreateProjectTemplates}
                      className="inline-flex min-h-[52px] items-center gap-2 rounded-xl border border-border-main bg-surface px-5 py-2.5 text-sm font-bold text-text-main transition-all hover:border-primary/30 hover:bg-canvas disabled:opacity-50"
                    >
                      <Upload size={18} /> Sync All From Meta
                    </button>
                  </RequirePermission>
                ) : null}
                <RequirePermission permissionKey="can_create_campaign">
                  <Link
                    href="/templates/new"
                    className={`inline-flex min-h-[52px] items-center gap-2 rounded-xl border border-primary bg-primary px-5 py-2.5 text-sm font-bold !text-white shadow-sm transition-all [&>*]:!text-white ${!canCreateProjectTemplates ? "pointer-events-none opacity-50" : ""}`}
                  >
                    <Plus size={18} /> Create Template
                  </Link>
                </RequirePermission>
              </div>
              </div>
            )}
        </div>

        <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col">
          {activeView === 'templates' ? (
            <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-border-main bg-surface shadow-sm">
              <div className="flex-1 min-h-0 overflow-y-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="border-b border-border-main bg-canvas text-[11px] font-black uppercase tracking-widest text-text-muted">
                    <tr>
                      <th className="px-6 py-4">Template Name</th>
                      <th className="px-6 py-4">Category</th>
                      <th className="px-6 py-4">Approval Status</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-main">
                  {templates.map((t: any) => (
                    <tr key={t.id} className="group transition-colors hover:bg-canvas/60">
                      <td className="flex flex-col px-6 py-4 text-sm font-bold text-text-main">
                        <div className="flex items-center gap-2"><LayoutTemplate size={14} className="text-text-muted"/> {t.name}</div>
                        <span className="mt-1 line-clamp-1 text-[11px] font-medium text-text-muted">{getTemplatePreview(t)}</span>
                        {t.meta_template_name ? (
                          <span className="mt-1 text-[10px] font-medium text-text-muted">
                            Meta: {t.meta_template_name}
                          </span>
                        ) : null}
                        {getMetaSourceLabel(t) ? (
                          <span
                            className={`mt-1 inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] ${
                              isMetaSubmitted(t)
                                ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border border-border-main bg-canvas text-text-muted"
                            }`}
                          >
                            {getMetaSourceLabel(t)}
                          </span>
                        ) : null}
                        <div className="mt-1">{getReadinessBadge(t)}</div>
                        <span className="mt-1 flex items-center gap-1 text-[9px] text-text-muted"><Clock size={10}/> Updated {new Date(t.updated_at).toLocaleDateString()}</span>
                      </td>
                      <td className="px-6 py-4 text-xs font-bold uppercase text-text-muted">{t.category}</td>
                      <td className="px-6 py-4">
                        {getStatusBadge(t.status)}
                        {t.status === 'rejected' && <p className="mt-1 max-w-[220px] text-[10px] italic text-rose-700">{t.rejected_reason}</p>}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <Link
                            href={`/templates/${t.id}`}
                            className="rounded-lg p-2 text-text-muted transition-all hover:bg-primary-fade hover:text-primary"
                            title="Open Template Detail"
                          >
                            <Eye size={16} />
                          </Link>
                          <button
                            onClick={() => setSingleSendTemplate(t)}
                            disabled={t.status !== "approved" || t.runtime_readiness === "missing_runtime_asset" || t.runtime_readiness === "broken_meta_link"}
                            className="rounded-lg p-2 text-text-muted transition-all hover:bg-primary-fade hover:text-primary disabled:opacity-40"
                            title="Send Once"
                          >
                            <Send size={16} />
                          </button>
                          <button
                            onClick={() => {
                              setBulkTemplateId(t.id);
                              setIsBulkModalOpen(true);
                            }}
                            disabled={t.status !== "approved" || t.runtime_readiness === "missing_runtime_asset" || t.runtime_readiness === "broken_meta_link"}
                            className="rounded-lg p-2 text-text-muted transition-all hover:bg-primary-fade hover:text-primary disabled:opacity-40"
                            title="Bulk Send"
                          >
                            <Upload size={16} />
                          </button>
                          {t.platform_type === "whatsapp" && String(t.status || "").toLowerCase() !== "approved" ? (
                            <>
                              <RequirePermission permissionKey="edit_campaign">
                                <button
                                  onClick={() => handleSubmitToMeta(t.id)}
                                  disabled={!canEditProjectTemplates || isMetaSubmitted(t)}
                                  className={getMetaActionClass(t, !canEditProjectTemplates || isMetaSubmitted(t))}
                                  title={isMetaSubmitted(t) ? "Already linked to Meta" : "Submit to Meta for approval"}
                                >
                                  <CloudUpload size={16} />
                                </button>
                                <button
                                  onClick={() => handleSyncMetaStatus(t.id)}
                                  className={getMetaActionClass(t)}
                                  title="Sync status from Meta"
                                >
                                  <RefreshCcw size={16} />
                                </button>
                              </RequirePermission>
                            </>
                          ) : null}
                          <RequirePermission permissionKey="edit_campaign">
                            <Link
                              href={`/templates/${t.id}/edit`}
                              className={`rounded-lg p-2 transition-all ${t.status === 'approved' || !canEditProjectTemplates ? 'pointer-events-none text-text-muted/40' : 'text-text-muted hover:bg-primary-fade hover:text-primary'}`}
                              title={t.status === 'approved' ? "Approved templates cannot be edited" : !canEditProjectTemplates ? "Edit permission required" : "Edit Template"}
                            >
                              <Edit size={16} />
                            </Link>
                          </RequirePermission>
                          <RequirePermission permissionKey="delete_campaign">
                            <button disabled={!canDeleteProjectTemplates} onClick={() => handleDelete(t.id)} className="rounded-lg p-2 text-text-muted transition-all hover:bg-rose-500/10 hover:text-rose-700 disabled:opacity-40"><Trash2 size={16} /></button>
                          </RequirePermission>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {templates.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-sm text-text-muted">No templates match the current platform/status filter.</td>
                    </tr>
                  )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                 <div className="rounded-2xl border border-border-main bg-surface p-6 shadow-sm">
                    <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-text-muted">Total Broadcasts</span>
                    <div className="flex items-center justify-between">
                      <div className="text-2xl font-black text-[var(--text)]">{campaignLogs.length}</div>
                      <div className="rounded-lg bg-primary-fade p-2 text-primary"><BarChart3 size={20} /></div>
                    </div>
                 </div>
                 <div className="rounded-2xl border border-border-main bg-surface p-6 shadow-sm">
                    <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-text-muted">Delivered</span>
                    <div className="flex items-center justify-between">
                      <div className="text-2xl font-black text-emerald-200">{campaignLogs.reduce((acc, curr) => acc + (curr.success_count || 0), 0)}</div>
                      <div className="rounded-lg bg-emerald-50 p-2 text-emerald-700"><CheckCircle size={20} /></div>
                    </div>
                 </div>
              </div>

              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border-main bg-surface shadow-sm">
                <div className="flex-1 min-h-0 overflow-y-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="border-b border-border-main bg-canvas text-[11px] font-black uppercase tracking-widest text-text-muted">
                      <tr>
                        <th className="px-6 py-4">Campaign / Template</th>
                        <th className="px-6 py-4">Target Leads</th>
                        <th className="px-6 py-4">Performance</th>
                        <th className="px-6 py-4">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-main">
                  {campaignLogs.map((log: any) => (
                      <tr key={log.id} className="transition-colors hover:bg-canvas/60">
                        <td className="px-6 py-4">
                          <div className="text-sm font-bold text-[var(--text)]">{log.campaign_name || 'Campaign launch'}</div>
                          <div className="font-mono text-[10px] italic text-text-muted">{log.template_name}</div>
                        </td>
                        <td className="px-6 py-4 text-xs font-bold text-text-muted">
                          {log.total_leads || 0} recipients
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-canvas">
                              <div 
                                className="h-full bg-primary"
                                style={{ width: `${((log.success_count || 0) / (log.total_leads || 1)) * 100}%` }}
                              />
                            </div>
                            <span className="text-[10px] font-black text-text-muted">{log.success_count || 0} / {log.total_leads || 0}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                           <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-[9px] font-black uppercase text-emerald-700">Completed</span>
                        </td>
                      </tr>
                    ))}
                    {campaignLogs.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-6 py-8 text-center text-sm text-text-muted">No campaigns launched yet.</td>
                      </tr>
                    )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal */}
        <CampaignSenderModal 
          isOpen={isCampaignModalOpen} 
          onClose={() => setIsCampaignModalOpen(false)} 
          templates={templates} 
          canLaunchCampaign={canCreateProjectTemplates}
        />
        <BulkUploadModal
          isOpen={isBulkModalOpen}
          onClose={() => setIsBulkModalOpen(false)}
          templates={templates}
          campaigns={campaigns}
          initialTemplateId={bulkTemplateId}
        />
        <SingleSendTemplateModal
          isOpen={Boolean(singleSendTemplate)}
          onClose={() => setSingleSendTemplate(null)}
          template={singleSendTemplate}
        />
        <ImportFromMetaModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          campaigns={campaigns}
          onImported={fetchTemplates}
        />
        
        </div>
    </>
  );
}

(TemplatesPage as any).getLayout = (page: any) => <DashboardLayout>{page}</DashboardLayout>;
