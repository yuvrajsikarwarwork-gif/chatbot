import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlignLeft,
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  Globe,
  MapPin,
  Mail,
  MessageSquare,
  Plus,
  Rocket,
  Send,
  Upload,
  Users,
} from "lucide-react";

import PageAccessNotice from "../../components/access/PageAccessNotice";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { useVisibility } from "../../hooks/useVisibility";
import { validateTemplateInput } from "../../lib/whatsappTemplateSchema";
import { campaignService } from "../../services/campaignService";
import apiClient from "../../services/apiClient";
import { notify } from "../../store/uiStore";
import { useAuthStore } from "../../store/authStore";
import TemplatePreview from "../../components/templates/TemplatePreview";

const platforms = [
  { id: "whatsapp", name: "WhatsApp", icon: MessageSquare },
  { id: "telegram", name: "Telegram", icon: Send },
  { id: "email", name: "Email", icon: Mail },
  { id: "facebook", name: "Facebook", icon: Globe },
  { id: "instagram", name: "Instagram", icon: Globe },
];

const defaultForm = {
  name: "",
  platform_type: "whatsapp",
  category: "marketing",
  language: "en_US",
  header_type: "none",
  header: "",
  body: "",
  footer: "",
  buttons: [],
  variables: {},
  samples: {
    headerText: [""],
    bodyText: [],
    dynamicUrls: [],
  },
  header_location: {
    latitude: "",
    longitude: "",
    placeName: "",
    address: "",
  },
  status: "pending",
  campaign_id: "",
};

const whatsappLanguageOptions = [
  { value: "en_US", label: "English (US)" },
  { value: "en_GB", label: "English (UK)" },
  { value: "hi", label: "Hindi" },
  { value: "es_ES", label: "Spanish" },
  { value: "pt_BR", label: "Portuguese (BR)" },
  { value: "zh_TW", label: "Chinese (Traditional)" },
];

const metaFieldOptions = [
  { value: "name", label: "Lead name" },
  { value: "full_name", label: "Full name" },
  { value: "wa_number", label: "Phone number" },
  { value: "email", label: "Email" },
  { value: "source", label: "Lead source" },
];

const buttonLimits: Record<string, { max: number; hint: string }> = {
  whatsapp: { max: 10, hint: "Up to 10 buttons. Group quick replies first, then CTA buttons." },
  telegram: { max: 8, hint: "Inline buttons or reply keyboard rows." },
  facebook: { max: 3, hint: "Messenger buttons or quick actions." },
  instagram: { max: 3, hint: "Card buttons or quick actions." },
  email: { max: 6, hint: "HTML CTA buttons or linked actions." },
};

function buildDefaultButton(platform: string) {
  if (platform === "whatsapp") {
    return { type: "quick_reply", title: "", value: "", urlMode: "static", sampleValue: "" };
  }
  if (platform === "telegram") {
    return { type: "callback", title: "", value: "" };
  }
  if (platform === "instagram" || platform === "email") {
    return { type: "url", title: "", value: "" };
  }
  return { type: "text", title: "", value: "" };
}

const previewData: Record<string, string> = {
  name: "Sample Name",
  wa_number: "+00 0000 000000",
  email: "sample@example.com",
  source: "Sample Source",
};

async function compressImageFile(file: File) {
  if (!file.type.startsWith("image/")) {
    return file;
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to load image for compression."));
      img.src = objectUrl;
    });

    const maxDimension = 1600;
    const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
    const targetWidth = Math.max(1, Math.round(image.width * scale));
    const targetHeight = Math.max(1, Math.round(image.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      return file;
    }

    context.drawImage(image, 0, 0, targetWidth, targetHeight);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", 0.82);
    });

    if (!blob || blob.size >= file.size) {
      return file;
    }

    return new File(
      [blob],
      file.name.replace(/\.(png|webp|jpeg|jpg)$/i, ".jpg"),
      { type: "image/jpeg" }
    );
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function getMediaUploadAccept(headerType: string) {
  if (headerType === "image") {
    return "image/png,image/jpeg,image/webp";
  }
  if (headerType === "video") {
    return "video/mp4";
  }
  if (headerType === "document") {
    return "application/pdf";
  }
  return "";
}

function getMediaUploadLabel(headerType: string) {
  if (headerType === "image") {
    return "Upload Preview Image";
  }
  if (headerType === "video") {
    return "Upload Preview Video";
  }
  if (headerType === "document") {
    return "Upload Preview Document";
  }
  return "Upload Preview";
}

function interpolatePreview(text: string, variables: Record<string, string>) {
  return String(text || "").replace(/{{(\d+)}}/g, (_, token) => {
    const mapped = variables[token];
    return mapped ? previewData[mapped] || `{{${token}}}` : `{{${token}}}`;
  });
}

function extractVariableTokens(value: string) {
  return Array.from(
    new Set(
      String(value || "")
        .match(/{{\s*(\d+)\s*}}/g)
        ?.map((token) => token.replace(/[{}]/g, "").trim()) || []
    )
  );
}

function getButtonMetaLabel(button: any) {
  const type = String(button?.type || "").toLowerCase();
  if (type === "quick_reply") return "Quick reply";
  if (type === "url") return String(button?.urlMode || "static").toLowerCase() === "dynamic" ? "Dynamic URL" : "Static URL";
  if (type === "phone") return "Phone number";
  if (type === "copy_code") return "Copy code";
  if (type === "flow") return "WhatsApp flow";
  if (type === "catalog") return "Catalog / MPM";
  return "Button";
}

function computeEditorReadiness(formData: any, selectedCampaignHasActiveWhatsAppChannel: boolean) {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const headerType = String(formData.header_type || "none").toLowerCase();
  const bodyVariableTokens = extractVariableTokens(formData.body);
  const headerVariableTokens = extractVariableTokens(formData.header);
  const samples = formData.samples || {};
  const buttons = Array.isArray(formData.buttons) ? formData.buttons : [];

  if (!formData.campaign_id) {
    blockers.push("Select a connected campaign.");
  }

  if (String(formData.platform_type || "").toLowerCase() === "whatsapp" && formData.campaign_id && !selectedCampaignHasActiveWhatsAppChannel) {
    blockers.push("The selected campaign still has no active WhatsApp runtime channel.");
  }

  if (headerType === "text" && headerVariableTokens.length > 0 && !String(samples?.headerText?.[0] || "").trim()) {
    blockers.push("Text header variables need a header sample value.");
  }

  if (["image", "video", "document"].includes(headerType) && !String(formData.header || "").trim()) {
    blockers.push("Media headers need a Meta sample handle.");
  }

  if (headerType === "location") {
    if (!String(formData.header_location?.latitude || "").trim() || !String(formData.header_location?.longitude || "").trim()) {
      blockers.push("Location headers need latitude and longitude.");
    }
  }

  if (bodyVariableTokens.length > 0) {
    const missingSamples = bodyVariableTokens.filter((_, index) => !String(samples?.bodyText?.[index] || "").trim());
    if (missingSamples.length > 0) {
      blockers.push("Add sample data for each body variable before submit.");
    }
  }

  for (const button of buttons) {
    const type = String(button?.type || "").toLowerCase();
    const title = String(button?.title || "").trim();
    const value = String(button?.value || "").trim();
    const urlMode = String(button?.urlMode || "static").toLowerCase();
    const sampleValue = String(button?.sampleValue || "").trim();
    const buttonLabel = title || getButtonMetaLabel(button);

    if (!title) {
      blockers.push(`Add button text for ${getButtonMetaLabel(button).toLowerCase()}.`);
    }
    if (type === "url" && !value) {
      blockers.push(`Add a website URL for "${buttonLabel}".`);
    }
    if (type === "url" && urlMode === "dynamic" && !sampleValue) {
      blockers.push(`Add a sample slug for "${buttonLabel}".`);
    }
    if (type === "phone" && !value) {
      blockers.push(`Add a phone number for "${buttonLabel}".`);
    }
    if (type === "copy_code" && !value) {
      blockers.push(`Add an offer code for "${buttonLabel}".`);
    }
    if (type === "flow" && !value) {
      warnings.push(`"${buttonLabel}" is saved locally as a flow button. Confirm the connected Meta account supports the final flow payload before submit.`);
    }
    if (type === "catalog" && !value) {
      warnings.push(`"${buttonLabel}" is saved locally as a catalog button. Add a catalog id when your commerce setup is ready.`);
    }
  }

  return { blockers, warnings };
}

export default function NewTemplatePage() {
  const router = useRouter();
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);
  const activeProject = useAuthStore((state) => state.activeProject);
  const hasWorkspacePermission = useAuthStore((state) => state.hasWorkspacePermission);
  const getProjectRole = useAuthStore((state) => state.getProjectRole);
  const { canViewPage, isReadOnly } = useVisibility();

  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [selectedCampaignChannels, setSelectedCampaignChannels] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<any>(defaultForm);
  const [editingTemplateId, setEditingTemplateId] = useState("");
  const [isTemplateHydrating, setIsTemplateHydrating] = useState(false);
  const [headerPreviewUrl, setHeaderPreviewUrl] = useState("");
  const [isUploadingHeaderPreview, setIsUploadingHeaderPreview] = useState(false);
  const headerPreviewInputRef = useRef<HTMLInputElement | null>(null);

  const canCreateTemplates = hasWorkspacePermission(activeWorkspace?.workspace_id, "can_create_campaign");
  const projectRole = getProjectRole(activeProject?.id);
  const canCreateProjectTemplates =
    !isReadOnly && (canCreateTemplates || projectRole === "project_admin" || projectRole === "editor");
  const canViewTemplatesPage = canViewPage("templates");
  const editRouteId = useMemo(() => {
    if (router.pathname !== "/templates/[id]/edit") {
      return "";
    }
    return String(router.query.id || "").trim();
  }, [router.pathname, router.query.id]);
  const editQueryId = useMemo(() => {
    const legacyEditId = String(router.query.edit || "").trim();
    return editRouteId || legacyEditId;
  }, [editRouteId, router.query.edit]);
  const duplicateQueryId = useMemo(() => String(router.query.duplicate || "").trim(), [router.query.duplicate]);
  const sourceTemplateId = editQueryId || duplicateQueryId;
  const pageMode = editQueryId ? "edit" : duplicateQueryId ? "duplicate" : "create";

  const dynamicVars = useMemo<string[]>(() => {
    return extractVariableTokens(formData.body).map((token) => `{{${token}}}`);
  }, [formData.body]);

  useEffect(() => {
    if (!canViewTemplatesPage || !activeWorkspace?.workspace_id || !activeProject?.id) {
      setCampaigns([]);
      return;
    }

    campaignService
      .list({
        workspaceId: activeWorkspace.workspace_id,
        projectId: activeProject.id,
      })
      .then((campaignRows) => {
        setCampaigns(campaignRows);
      })
      .catch((err) => {
        console.error("Failed to load template setup data", err);
        setCampaigns([]);
      });
  }, [activeWorkspace?.workspace_id, activeProject?.id, canViewTemplatesPage]);

  useEffect(() => {
    if (!canViewTemplatesPage || !formData.campaign_id) {
      setSelectedCampaignChannels([]);
      return;
    }

    campaignService
      .getChannels(String(formData.campaign_id))
      .then((rows) => {
        setSelectedCampaignChannels(Array.isArray(rows) ? rows : []);
      })
      .catch((err) => {
        console.error("Failed to load selected campaign channels", err);
        setSelectedCampaignChannels([]);
      });
  }, [canViewTemplatesPage, formData.campaign_id]);

  useEffect(() => {
    if (!router.isReady) return;
    if (!sourceTemplateId) {
      setEditingTemplateId("");
      setIsTemplateHydrating(false);
      return;
    }
    setIsTemplateHydrating(true);
    apiClient
      .get(`/templates/${sourceTemplateId}`)
      .then((res) => {
        const template = res.data;
        const rawContent =
          typeof template?.content === "string"
            ? JSON.parse(template.content)
            : template?.content || {};
        const content = {
          header:
            rawContent?.header ??
            (template?.header_type && template?.header_type !== "none"
              ? { type: template.header_type, text: template.header || "" }
              : null),
          body: rawContent?.body || template?.body || "",
          footer: rawContent?.footer || template?.footer || "",
          buttons: Array.isArray(rawContent?.buttons)
            ? rawContent.buttons
            : Array.isArray(template?.buttons)
              ? template.buttons
              : [],
          samples:
            rawContent?.samples && typeof rawContent.samples === "object"
              ? rawContent.samples
              : {
                  headerText: [""],
                  bodyText: [],
                  dynamicUrls: [],
                },
        };
        setEditingTemplateId(editQueryId ? template.id : "");
        setFormData({
          name: editQueryId ? (template.name || "") : `${template.name || "template"}_copy`,
          platform_type: template.platform_type || "whatsapp",
          category: template.category || "marketing",
          language: template.language || "en_US",
          header_type: content?.header?.type || "none",
          header: content?.header?.text || "",
          body: content?.body || "",
          footer: content?.footer || "",
          buttons: Array.isArray(content?.buttons) ? content.buttons : [],
          variables: template.variables || {},
          samples: content?.samples || {
            headerText: [""],
            bodyText: [],
            dynamicUrls: [],
          },
          header_location: {
            latitude: content?.header?.latitude || "",
            longitude: content?.header?.longitude || "",
            placeName: content?.header?.placeName || "",
            address: content?.header?.address || "",
          },
          status: "pending",
          campaign_id: template.campaign_id || "",
        });
        setHeaderPreviewUrl(String(content?.header?.assetUrl || ""));
      })
      .catch((err) => {
        notify(err?.response?.data?.error || "Failed to load template.", "error");
      })
      .finally(() => {
        setIsTemplateHydrating(false);
      });
  }, [router.isReady, sourceTemplateId, editQueryId]);

  const handleHeaderPreviewUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!formData.campaign_id) {
      notify("Select a campaign before uploading media samples to Meta.", "error");
      event.target.value = "";
      return;
    }

    setIsUploadingHeaderPreview(true);
    try {
      const preparedFile = await compressImageFile(file);
      const payload = new FormData();
      payload.append("file", preparedFile);
      payload.append("campaign_id", String(formData.campaign_id || ""));
      payload.append("header_type", String(formData.header_type || ""));
      const response = await apiClient.post("/upload/meta-template-sample", payload, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });
      setHeaderPreviewUrl(String(response.data?.url || ""));
      if (response.data?.metaHandle) {
        setFormData((prev: any) => ({
          ...prev,
          header: String(response.data.metaHandle),
        }));
      }
      notify("Media uploaded to Meta. The sample handle was applied automatically.", "success");
    } catch (error: any) {
      notify(error?.response?.data?.error || "Failed to upload media sample.", "error");
    } finally {
      setIsUploadingHeaderPreview(false);
      event.target.value = "";
    }
  };

  useEffect(() => {
    setHeaderPreviewUrl("");
  }, [formData.header_type]);

  useEffect(() => {
    const isWA = formData.platform_type === "whatsapp";
    const isTelegram = formData.platform_type === "telegram";
    setFormData((prev: any) => ({
      ...prev,
      header_type: isWA ? prev.header_type : "none",
      header: isWA ? prev.header : "",
      footer: isWA || isTelegram ? prev.footer : "",
    }));
  }, [formData.platform_type]);

  useEffect(() => {
    const limit = buttonLimits[formData.platform_type]?.max ?? 0;
    setFormData((prev: any) => ({
      ...prev,
      buttons: limit === 0 ? [] : Array.isArray(prev.buttons) ? prev.buttons.slice(0, limit) : [],
    }));
  }, [formData.platform_type]);

  const validateDraftForm = (draftForm: any) => {
    const validation = validateTemplateInput(draftForm, "draft");
    return validation.errors[0] || "";
  };

  const handleSave = async (mode: "draft" | "publish" = "publish") => {
    if (!canCreateProjectTemplates) {
      notify("Template creation is not available for this access level.", "error");
      return;
    }
    const validationError =
      mode === "draft"
        ? validateDraftForm(formData)
        : validateTemplateInput(formData, "publish").errors[0] || "";
    if (validationError) {
      notify(validationError, "error");
      return;
    }

    if (mode !== "draft" && String(formData.platform_type || "").toLowerCase() === "whatsapp") {
      const hasActiveWhatsAppChannel = selectedCampaignChannels.some((channel: any) => {
        const platform = String(channel?.platform || channel?.platform_type || "").trim().toLowerCase();
        const status = String(channel?.status || "").trim().toLowerCase();
        return platform === "whatsapp" && (status === "active" || status === "");
      });

      if (!hasActiveWhatsAppChannel) {
        notify(
          "The selected campaign does not have an active WhatsApp channel. Connect the WhatsApp integration to this same campaign first.",
          "error"
        );
        return;
      }
    }

    setIsSaving(true);
    try {
      const payload = {
        ...formData,
        status: mode === "draft" ? "draft" : "pending",
        campaign_id: formData.campaign_id || null,
        content: {
          header:
            formData.header_type !== "none"
              ? {
                  type: formData.header_type || "text",
                  text: formData.header,
                  ...(formData.header_type === "location"
                    ? {
                        latitude: String(formData.header_location?.latitude || "").trim(),
                        longitude: String(formData.header_location?.longitude || "").trim(),
                        placeName: String(formData.header_location?.placeName || "").trim(),
                        address: String(formData.header_location?.address || "").trim(),
                      }
                    : {}),
                  ...(["image", "video", "document"].includes(String(formData.header_type || "").toLowerCase()) &&
                  formData.header
                    ? { assetId: formData.header }
                    : {}),
                  ...(["image", "video", "document"].includes(String(formData.header_type || "").toLowerCase()) &&
                  headerPreviewUrl
                    ? { assetUrl: headerPreviewUrl }
                    : {}),
                }
              : null,
          body: formData.body || "",
          footer: formData.footer || "",
          buttons: Array.isArray(formData.buttons) ? formData.buttons : [],
          samples: formData.samples || {},
        },
      };

      let savedTemplate: any;
      if (editingTemplateId) {
        const res = await apiClient.put(`/templates/${editingTemplateId}`, payload);
        savedTemplate = res.data;
      } else {
        const res = await apiClient.post("/templates", payload);
        savedTemplate = res.data;
      }

      let metaSubmitError = "";
      if (
        mode !== "draft" &&
        String(formData.platform_type || "").toLowerCase() === "whatsapp" &&
        savedTemplate?.id
      ) {
        try {
          const submitRes = await apiClient.post(`/templates/${savedTemplate.id}/submit-meta`);
          if (submitRes?.data?.template) {
            savedTemplate = submitRes.data.template;
          }
          try {
            const syncRes = await apiClient.post(`/templates/${savedTemplate.id}/sync-meta`);
            if (syncRes?.data?.template) {
              savedTemplate = syncRes.data.template;
            }
          } catch {
            // Meta can take a moment to expose a just-submitted template; keep the create flow moving.
          }
        } catch (err: any) {
          metaSubmitError =
            err?.response?.data?.error ||
            err?.message ||
            "Template was saved locally, but Meta submission failed.";
        }
      }

      notify(
        mode === "draft"
          ? editingTemplateId
            ? "Draft updated."
            : "Draft saved."
          : editingTemplateId
            ? "Template updated."
            : "Template created.",
        "success"
      );
      if (metaSubmitError) {
        notify(metaSubmitError, "error");
      }
      router.push(savedTemplate?.id ? `/templates/${savedTemplate.id}` : "/templates");
    } catch (err: any) {
      console.error(err);
      notify(err?.response?.data?.error || "Failed to save template.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  if (!canViewTemplatesPage) {
    return (
      <DashboardLayout>
        <PageAccessNotice
          title="Templates are restricted for this role"
          description="Templates are available to workspace admins and project operators with campaign access."
          href="/"
          ctaLabel="Open dashboard"
        />
      </DashboardLayout>
    );
  }

  const previewBody = interpolatePreview(formData.body, formData.variables || {});
  const previewFooter = interpolatePreview(formData.footer, formData.variables || {});
  const previewHeader = interpolatePreview(formData.header, formData.variables || {});
  const selectedCampaignName =
    campaigns.find((campaign) => campaign.id === formData.campaign_id)?.name || "";
  const selectedCampaignHasActiveWhatsAppChannel = selectedCampaignChannels.some((channel: any) => {
    const platform = String(channel?.platform || channel?.platform_type || "").trim().toLowerCase();
    const status = String(channel?.status || "").trim().toLowerCase();
    return platform === "whatsapp" && (status === "active" || status === "");
  });
  const currentButtonLimit = buttonLimits[formData.platform_type]?.max ?? 0;
  const editorReadiness = computeEditorReadiness(
    formData,
    selectedCampaignHasActiveWhatsAppChannel
  );

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-[1.75rem] border border-border-main bg-surface p-6 shadow-lg">
          <div className="mb-2 text-[10px] font-black uppercase tracking-widest text-text-muted">
            {pageMode === "edit" ? "Editing existing template" : pageMode === "duplicate" ? "Duplicating template" : "New template"}
          </div>
          <h1 className="mt-4 text-[1.8rem] font-extrabold tracking-tight text-text-main">
            {pageMode === "edit" ? "Edit template" : pageMode === "duplicate" ? "Duplicate template" : "Create template"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-text-muted">
            Configure template content on the left. The right side shows how the message will look before you save it.
          </p>
        </section>

        {!activeWorkspace?.workspace_id || !activeProject?.id ? (
          <section className="rounded-[1.5rem] border border-dashed border-border-main bg-surface p-8 text-sm text-text-muted">
            Select a workspace and project before creating templates.
          </section>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
            {isTemplateHydrating ? (
              <section className="xl:col-span-2 rounded-[1.5rem] border border-border-main bg-surface p-8 text-sm text-text-muted shadow-lg">
                Loading template into editor...
              </section>
            ) : (
            <>
            <section className="rounded-[1.5rem] border border-border-main bg-surface p-6 shadow-lg">
              {!canCreateProjectTemplates ? (
                <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Template creation is not available for this access level.
                </div>
              ) : null}

              <div>
                <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-text-muted">
                  Connected campaign
                </label>
                <select
                  className="w-full rounded-xl border border-border-main bg-surface p-3 text-sm text-text-main outline-none"
                  value={formData.campaign_id || ""}
                  onChange={(e) => setFormData({ ...formData, campaign_id: e.target.value })}
                >
                  <option value="">Select campaign</option>
                  {campaigns.map((campaign) => (
                    <option key={campaign.id} value={campaign.id}>
                      {campaign.name}
                    </option>
                  ))}
                </select>
                {formData.platform_type === "whatsapp" && formData.campaign_id ? (
                  <div
                    className={`mt-2 rounded-xl border px-3 py-2 text-xs ${
                      selectedCampaignHasActiveWhatsAppChannel
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-amber-200 bg-amber-50 text-amber-700"
                    }`}
                  >
                    {selectedCampaignHasActiveWhatsAppChannel
                      ? "Active WhatsApp channel found for this campaign."
                      : "No active WhatsApp channel found for this selected campaign."}
                  </div>
                ) : null}
              </div>

              <div className="mt-5 space-y-4">
                <div>
                  <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-text-muted">
                    Target platform
                  </label>
                  <div className="grid grid-cols-5 gap-2">
                    {platforms.map((platform) => (
                      <button
                        key={platform.id}
                        type="button"
                        onClick={() => setFormData({ ...formData, platform_type: platform.id })}
                        className={`flex items-center justify-center rounded-xl border p-3 transition-all ${
                          formData.platform_type === platform.id
                            ? "border-primary bg-primary text-white shadow-lg"
                            : "border-border-main bg-surface text-text-muted hover:border-primary"
                        }`}
                      >
                        <platform.icon size={16} />
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-text-muted">
                    Internal name
                  </label>
                  <input
                    type="text"
                    className="w-full rounded-xl border border-border-main bg-surface p-3 font-mono text-sm text-text-main outline-none"
                    placeholder="welcome_user_v1"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-text-muted">
                      Category
                    </label>
                    <select
                      className="w-full rounded-xl border border-border-main bg-surface p-3 text-sm text-text-main outline-none"
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    >
                      <option value="marketing">Marketing</option>
                      <option value="utility">Utility</option>
                      <option value="authentication">Authentication</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-text-muted">
                      Language
                    </label>
                    <select
                      className="w-full rounded-xl border border-border-main bg-surface p-3 text-sm text-text-main outline-none"
                      value={formData.language}
                      onChange={(e) => setFormData({ ...formData, language: e.target.value })}
                    >
                      {whatsappLanguageOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {formData.platform_type === "whatsapp" ? (
                  <div className="space-y-3 rounded-xl border border-border-main bg-surface p-4">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-text-muted">
                      Header content
                    </label>
                    <div className="flex gap-2">
                      <select
                        className="w-1/3 rounded-lg border border-border-main bg-surface p-2 text-xs outline-none"
                        value={formData.header_type}
                        onChange={(e) => setFormData({ ...formData, header_type: e.target.value })}
                      >
                        <option value="none">None</option>
                        <option value="text">Text</option>
                        <option value="image">Image</option>
                        <option value="video">Video</option>
                        <option value="document">Document</option>
                        <option value="location">Location</option>
                      </select>
                      {formData.header_type !== "none" ? (
                        <input
                          className="flex-1 rounded-lg border border-border-main bg-surface p-2 text-xs outline-none"
                          placeholder={
                            formData.header_type === "text"
                              ? "Header text"
                              : formData.header_type === "location"
                                ? "Optional location label"
                                : "Meta media handle required for submission"
                          }
                          value={formData.header}
                          onChange={(e) => setFormData({ ...formData, header: e.target.value })}
                        />
                      ) : null}
                    </div>
                    <div className="text-[11px] text-text-muted">
                      WhatsApp text headers should stay within 60 characters. Image, video, and document headers must use a valid Meta media handle for template submission. Location headers need latitude and longitude.
                    </div>
                    {formData.header_type === "text" && extractVariableTokens(formData.header).length > 0 ? (
                      <input
                        className="w-full rounded-lg border border-border-main bg-surface p-2 text-xs outline-none"
                        placeholder="Header sample text for {{1}}"
                        value={formData.samples?.headerText?.[0] || ""}
                        onChange={(e) =>
                          setFormData((prev: any) => ({
                            ...prev,
                            samples: { ...(prev.samples || {}), headerText: [e.target.value] },
                          }))
                        }
                      />
                    ) : null}
                    {["image", "video", "document"].includes(formData.header_type) ? (
                      <div className="rounded-xl border border-dashed border-border-main bg-canvas p-3">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div className="text-[11px] text-text-muted">
                            {formData.header_type === "image"
                              ? "Upload an image from your desktop. The platform will upload it to Meta, apply the returned media handle automatically, and keep a local preview."
                              : formData.header_type === "video"
                                ? "Upload an MP4 video from your desktop. The platform will upload it to Meta, apply the returned media handle automatically, and keep a local preview."
                                : "Upload a PDF document from your desktop. The platform will upload it to Meta, apply the returned media handle automatically, and keep a local preview."}
                          </div>
                          <button
                            type="button"
                            onClick={() => headerPreviewInputRef.current?.click()}
                            disabled={isUploadingHeaderPreview}
                            className="inline-flex items-center gap-2 rounded-lg border border-border-main bg-surface px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-text-main disabled:opacity-50"
                          >
                            <Upload size={14} />
                            {isUploadingHeaderPreview ? "Uploading..." : getMediaUploadLabel(formData.header_type)}
                          </button>
                        </div>
                        <input
                          ref={headerPreviewInputRef}
                          type="file"
                          accept={getMediaUploadAccept(formData.header_type)}
                          className="hidden"
                          onChange={handleHeaderPreviewUpload}
                        />
                        {headerPreviewUrl ? (
                          <div className="mt-2 text-[11px] text-text-muted">
                            Preview asset ready. The Meta media handle has been applied automatically. Images are compressed before upload when possible.
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    {formData.header_type === "location" ? (
                      <div className="grid gap-3 md:grid-cols-2">
                        <input
                          className="rounded-lg border border-border-main bg-surface p-2 text-xs outline-none"
                          placeholder="Latitude"
                          value={formData.header_location?.latitude || ""}
                          onChange={(e) =>
                            setFormData((prev: any) => ({
                              ...prev,
                              header_location: { ...(prev.header_location || {}), latitude: e.target.value },
                            }))
                          }
                        />
                        <input
                          className="rounded-lg border border-border-main bg-surface p-2 text-xs outline-none"
                          placeholder="Longitude"
                          value={formData.header_location?.longitude || ""}
                          onChange={(e) =>
                            setFormData((prev: any) => ({
                              ...prev,
                              header_location: { ...(prev.header_location || {}), longitude: e.target.value },
                            }))
                          }
                        />
                        <input
                          className="rounded-lg border border-border-main bg-surface p-2 text-xs outline-none"
                          placeholder="Place name"
                          value={formData.header_location?.placeName || ""}
                          onChange={(e) =>
                            setFormData((prev: any) => ({
                              ...prev,
                              header_location: { ...(prev.header_location || {}), placeName: e.target.value },
                            }))
                          }
                        />
                        <input
                          className="rounded-lg border border-border-main bg-surface p-2 text-xs outline-none"
                          placeholder="Address"
                          value={formData.header_location?.address || ""}
                          onChange={(e) =>
                            setFormData((prev: any) => ({
                              ...prev,
                              header_location: { ...(prev.header_location || {}), address: e.target.value },
                            }))
                          }
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div>
                  <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-text-muted">
                    Body text
                  </label>
                  <textarea
                    className="h-32 w-full resize-none rounded-xl border border-border-main bg-surface p-3 text-sm text-text-main outline-none"
                    placeholder="Hello {{1}}, how can we help today?"
                    value={formData.body}
                    onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                  />
                  <div className="mt-1 flex items-center justify-between text-[11px] text-text-muted">
                    <span>{formData.platform_type === "whatsapp" ? "WhatsApp body limit: 1024" : "Message body"}</span>
                    <span>{String(formData.body || "").length}</span>
                  </div>
                </div>

                {dynamicVars.length > 0 ? (
                  <div className="space-y-3 rounded-xl border border-blue-100 bg-blue-50/60 p-4">
                    <div className="flex items-center justify-between">
                      <h3 className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-blue-700">
                        <Users size={12} />
                        Variable mapper
                      </h3>
                      <span className="rounded bg-primary px-1.5 py-0.5 text-[8px] font-black text-white">
                        Preview active
                      </span>
                    </div>
                    {dynamicVars.map((variable) => (
                      <div key={variable} className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="w-8 text-xs font-black text-blue-500">{variable}</span>
                          <select
                            className="flex-1 rounded-lg border border-border-main bg-surface p-2 text-[10px] font-bold outline-none"
                            value={formData.variables[variable] || ""}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                variables: { ...formData.variables, [variable]: e.target.value },
                              })
                            }
                          >
                            <option value="">Map to lead field...</option>
                            <option value="name">Lead Name</option>
                            <option value="wa_number">Phone Number</option>
                            <option value="email">Email</option>
                            <option value="source">Lead Source</option>
                          </select>
                        </div>
                        {formData.variables[variable] ? (
                          <div className="ml-10 flex items-center gap-1 text-[9px] font-bold italic text-text-muted">
                            <Eye size={10} /> Currently holds: "{previewData[formData.variables[variable]] || "No data"}"
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}

                {formData.platform_type === "whatsapp" ? (
                  <div className="space-y-3 rounded-xl border border-border-main bg-surface p-4">
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-text-muted">
                      <Upload size={12} />
                      Approval sample data
                    </div>
                    <div className="text-[11px] text-text-muted">
                      Use this section the same way Meta does: variables, dynamic URLs, and media headers all need sample values during review.
                    </div>
                    {dynamicVars.length > 0 ? (
                      <div className="space-y-2">
                        {dynamicVars.map((variable, index) => (
                          <div key={`body-sample-${variable}`} className="grid gap-2 md:grid-cols-[110px_1fr]">
                            <div className="rounded-lg border border-border-main bg-canvas px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-text-main">
                              Body {variable}
                            </div>
                            <input
                              className="rounded-lg border border-border-main bg-surface p-2 text-xs outline-none"
                              placeholder={`Sample value for ${variable}`}
                              value={formData.samples?.bodyText?.[index] || ""}
                              onChange={(e) =>
                                setFormData((prev: any) => {
                                  const nextSamples = Array.isArray(prev.samples?.bodyText)
                                    ? [...prev.samples.bodyText]
                                    : [];
                                  nextSamples[index] = e.target.value;
                                  return {
                                    ...prev,
                                    samples: { ...(prev.samples || {}), bodyText: nextSamples },
                                  };
                                })
                              }
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed border-border-main bg-canvas px-3 py-3 text-xs text-text-muted">
                        No body variables found. Static templates can skip body samples.
                      </div>
                    )}
                  </div>
                ) : null}

                {formData.platform_type === "whatsapp" || formData.platform_type === "telegram" ? (
                  <div>
                    <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-text-muted">
                      Footer text
                    </label>
                    <input
                      type="text"
                      className="w-full rounded-xl border border-border-main bg-surface p-3 text-sm text-text-main outline-none"
                      placeholder="Small grey text at bottom..."
                      value={formData.footer}
                      onChange={(e) => setFormData({ ...formData, footer: e.target.value })}
                    />
                    {formData.platform_type === "whatsapp" ? (
                      <div className="mt-1 flex items-center justify-between text-[11px] text-text-muted">
                        <span>WhatsApp footer limit: 60</span>
                        <span>{String(formData.footer || "").length}</span>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="space-y-3 rounded-xl border border-border-main bg-surface p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-widest text-text-muted">
                        Buttons and actions
                      </div>
                      <div className="mt-1 text-xs text-text-muted">
                        {buttonLimits[formData.platform_type]?.hint}
                      </div>
                      {formData.platform_type === "whatsapp" ? (
                        <div className="mt-1 text-[11px] text-text-muted">
                          WhatsApp supports grouped mixed buttons here: quick replies first, then CTA buttons. Max 10 total.
                        </div>
                      ) : null}
                    </div>
                    {currentButtonLimit > 0 ? (
                      <button
                        type="button"
                        onClick={() =>
                          setFormData((prev: any) => ({
                            ...prev,
                            buttons: [...(prev.buttons || []), buildDefaultButton(prev.platform_type)],
                          }))
                        }
                        disabled={(formData.buttons || []).length >= currentButtonLimit}
                        className="rounded-lg border border-border-main bg-canvas px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-text-main disabled:opacity-50"
                      >
                        Add button
                      </button>
                    ) : null}
                  </div>

                  {currentButtonLimit === 0 ? (
                    <div className="rounded-lg border border-dashed border-border-main bg-canvas px-3 py-3 text-xs text-text-muted">
                      Use body text such as "Reply YES" or include a short URL for SMS campaigns.
                    </div>
                  ) : (formData.buttons || []).length > 0 ? (
                    <div className="space-y-3">
                      {(formData.buttons || []).map((button: any, index: number) => (
                        <div key={`${formData.platform_type}-btn-${index}`} className="grid gap-3 rounded-lg border border-border-main bg-canvas p-3 md:grid-cols-[140px_1fr_1fr_auto]">
                          <select
                            value={button.type || ""}
                            onChange={(e) =>
                              setFormData((prev: any) => ({
                                ...prev,
                                buttons: (prev.buttons || []).map((item: any, itemIndex: number) =>
                                  itemIndex === index ? { ...item, type: e.target.value } : item
                                ),
                              }))
                            }
                            className="rounded-lg border border-border-main bg-surface px-3 py-2 text-xs text-text-main"
                          >
                            {(formData.platform_type === "whatsapp"
                              ? [
                                  { value: "quick_reply", label: "Quick reply" },
                                  { value: "url", label: "Visit website" },
                                  { value: "phone", label: "Call phone number" },
                                  { value: "copy_code", label: "Copy offer code" },
                                  { value: "flow", label: "WhatsApp Flow" },
                                  { value: "catalog", label: "Catalog / MPM" },
                                ]
                              : formData.platform_type === "telegram"
                                ? [
                                    { value: "callback", label: "Callback" },
                                    { value: "url", label: "URL" },
                                  ]
                                : [
                                    { value: "url", label: "URL" },
                                    { value: "postback", label: "Postback" },
                                  ]
                            ).map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <input
                            value={button.title || ""}
                            onChange={(e) =>
                              setFormData((prev: any) => ({
                                ...prev,
                                buttons: (prev.buttons || []).map((item: any, itemIndex: number) =>
                                  itemIndex === index ? { ...item, title: e.target.value } : item
                                ),
                              }))
                            }
                            placeholder="Button label"
                            className="rounded-lg border border-border-main bg-surface px-3 py-2 text-xs text-text-main"
                          />
                          <input
                            value={button.value || ""}
                            onChange={(e) =>
                              setFormData((prev: any) => ({
                                ...prev,
                                buttons: (prev.buttons || []).map((item: any, itemIndex: number) =>
                                  itemIndex === index ? { ...item, value: e.target.value } : item
                                ),
                              }))
                            }
                            placeholder={
                              button.type === "url"
                                ? button.urlMode === "dynamic"
                                  ? "https://iterra.ai/{{1}}"
                                  : "https://iterra.ai"
                                : button.type === "phone"
                                  ? "+91..."
                                  : button.type === "copy_code"
                                    ? "Offer code"
                                    : button.type === "flow"
                                      ? "Published flow id"
                                      : button.type === "catalog"
                                        ? "Catalog id"
                                        : "Action value"
                            }
                            className="rounded-lg border border-border-main bg-surface px-3 py-2 text-xs text-text-main"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setFormData((prev: any) => ({
                                ...prev,
                                buttons: (prev.buttons || []).filter((_: any, itemIndex: number) => itemIndex !== index),
                              }))
                            }
                            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-rose-700"
                          >
                            Remove
                          </button>
                          {button.type === "url" ? (
                            <>
                              <select
                                value={button.urlMode || "static"}
                                onChange={(e) =>
                                  setFormData((prev: any) => ({
                                    ...prev,
                                    buttons: (prev.buttons || []).map((item: any, itemIndex: number) =>
                                      itemIndex === index ? { ...item, urlMode: e.target.value } : item
                                    ),
                                  }))
                                }
                                className="rounded-lg border border-border-main bg-surface px-3 py-2 text-xs text-text-main md:col-span-2"
                              >
                                <option value="static">Static URL</option>
                                <option value="dynamic">Dynamic URL</option>
                              </select>
                              <input
                                value={button.sampleValue || ""}
                                onChange={(e) =>
                                  setFormData((prev: any) => ({
                                    ...prev,
                                    buttons: (prev.buttons || []).map((item: any, itemIndex: number) =>
                                      itemIndex === index ? { ...item, sampleValue: e.target.value } : item
                                    ),
                                  }))
                                }
                                placeholder="Sample slug for dynamic URL"
                                className={`rounded-lg border border-border-main bg-surface px-3 py-2 text-xs text-text-main ${button.urlMode === "dynamic" ? "" : "opacity-60"}`}
                              />
                            </>
                          ) : null}
                          {button.type === "copy_code" ? (
                            <input
                              value={button.sampleValue || ""}
                              onChange={(e) =>
                                setFormData((prev: any) => ({
                                  ...prev,
                                  buttons: (prev.buttons || []).map((item: any, itemIndex: number) =>
                                    itemIndex === index ? { ...item, sampleValue: e.target.value } : item
                                  ),
                                }))
                              }
                              placeholder="Sample text shown during Meta review"
                              className="rounded-lg border border-border-main bg-surface px-3 py-2 text-xs text-text-main md:col-span-2"
                            />
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-border-main bg-canvas px-3 py-3 text-xs text-text-muted">
                      No buttons added yet.
                    </div>
  )}
  </div>
  </div>
  {formData.platform_type === "whatsapp" ? (
  <div className="mt-6 rounded-xl border border-border-main bg-surface p-4">
  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-text-muted">
  <Rocket size={12} />
  Runtime readiness
  </div>
  <div className="mt-3 space-y-2">
  {editorReadiness.blockers.length === 0 ? (
  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-700">
  <div className="flex items-center gap-2 font-semibold">
  <CheckCircle2 size={16} />
  Builder checks are green for Meta submission.
  </div>
  </div>
  ) : (
  editorReadiness.blockers.map((item) => (
  <div key={item} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-700">
  <div className="flex items-start gap-2">
  <AlertCircle size={16} className="mt-0.5 shrink-0" />
  <span>{item}</span>
  </div>
  </div>
  ))
  )}
  {editorReadiness.warnings.map((item) => (
  <div key={item} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-700">
  <div className="flex items-start gap-2">
  <AlertCircle size={16} className="mt-0.5 shrink-0" />
  <span>{item}</span>
  </div>
  </div>
  ))}
  </div>
  </div>
  ) : null}
  <div className="mt-6 flex gap-3">
  <button
  onClick={() => handleSave("draft")}
                  disabled={isSaving || !canCreateProjectTemplates}
                  className="flex items-center gap-2 rounded-xl border border-border-main bg-canvas px-5 py-3 text-xs font-black uppercase tracking-widest text-text-main disabled:opacity-50"
                >
                  <Eye size={16} />
                  {isSaving ? "Saving..." : editingTemplateId ? "Save Draft" : "Save as Draft"}
                </button>
                <button
                  onClick={() => handleSave("publish")}
                  disabled={isSaving || !canCreateProjectTemplates}
                  className="flex items-center gap-2 rounded-xl border border-primary bg-primary px-5 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg disabled:opacity-50"
                >
                  <Plus size={16} />
                  {isSaving ? "Saving..." : editingTemplateId ? "Save and Submit" : "Create and Submit"}
                </button>
                <Link
                  href="/templates"
                  className="rounded-xl border border-border-main bg-surface px-5 py-3 text-xs font-black uppercase tracking-widest text-text-main"
                >
                  Cancel
                </Link>
              </div>
            </section>

            <section className="rounded-[1.5rem] border border-border-main bg-surface p-6 shadow-lg">
              <div className="mb-5 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-text-muted">
                <AlignLeft size={14} />
                Live preview
              </div>

              <div className="rounded-[1.5rem] border border-border-main bg-canvas p-5">
                <TemplatePreview
                  template={{
                    ...formData,
                    target_platform: formData.platform_type,
                  }}
                  campaignName={selectedCampaignName}
                />
              </div>
            </section>
            </>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

