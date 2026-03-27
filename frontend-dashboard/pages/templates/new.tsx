import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlignLeft,
  ArrowLeft,
  Eye,
  Globe,
  Mail,
  MessageSquare,
  Plus,
  Send,
  Smartphone,
  Upload,
  Users,
} from "lucide-react";

import PageAccessNotice from "../../components/access/PageAccessNotice";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { useVisibility } from "../../hooks/useVisibility";
import { campaignService } from "../../services/campaignService";
import apiClient from "../../services/apiClient";
import { notify } from "../../store/uiStore";
import { useAuthStore } from "../../store/authStore";

const platforms = [
  { id: "whatsapp", name: "WhatsApp", icon: MessageSquare },
  { id: "telegram", name: "Telegram", icon: Send },
  { id: "email", name: "Email", icon: Mail },
  { id: "sms", name: "SMS", icon: Smartphone },
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
  status: "pending",
  campaign_id: "",
};

const buttonLimits: Record<string, { max: number; hint: string }> = {
  whatsapp: { max: 10, hint: "Up to 10 buttons. Group quick replies first, then CTA buttons." },
  telegram: { max: 8, hint: "Inline buttons or reply keyboard rows." },
  instagram: { max: 3, hint: "Card buttons or quick actions." },
  email: { max: 6, hint: "HTML CTA buttons or linked actions." },
  sms: { max: 0, hint: "SMS does not support native buttons. Use links or reply keywords in body text." },
};

function buildDefaultButton(platform: string) {
  if (platform === "whatsapp") {
    return { type: "quick_reply", title: "", value: "" };
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

function isLikelyHttpUrl(value: string) {
  return /^https?:\/\//i.test(String(value || "").trim());
}

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

function validateTemplateForm(formData: any) {
  if (!formData.campaign_id) {
    return "Select a connected campaign.";
  }
  if (!formData.name || !formData.body) {
    return "Internal name and body are required.";
  }
  if (formData.platform_type === "whatsapp") {
    const body = String(formData.body || "");
    const footer = String(formData.footer || "");
    const header = String(formData.header || "");
    const headerType = String(formData.header_type || "none");
    const buttons = Array.isArray(formData.buttons) ? formData.buttons : [];

    if (body.length > 1024) {
      return "WhatsApp body must stay within 1024 characters.";
    }
    if (footer.length > 60) {
      return "WhatsApp footer must stay within 60 characters.";
    }
    if (headerType === "text" && header.length > 60) {
      return "WhatsApp text header must stay within 60 characters.";
    }
    if (["image", "video", "document"].includes(headerType) && !header.trim()) {
      return "Provide a Meta media handle for the WhatsApp media header sample.";
    }
    if (["image", "video", "document"].includes(headerType) && isLikelyHttpUrl(header)) {
      return "WhatsApp media headers require a Meta media handle, not a public URL.";
    }

    const quickReplies = buttons.filter((button: any) => button?.type === "quick_reply");
    const urlButtons = buttons.filter((button: any) => button?.type === "url");
    const phoneButtons = buttons.filter((button: any) => button?.type === "phone");
    const copyCodeButtons = buttons.filter((button: any) => button?.type === "copy_code");
    const ctas = buttons.filter((button: any) => button?.type === "url" || button?.type === "phone" || button?.type === "copy_code");
    if (buttons.length > 10) {
      return "WhatsApp supports at most 10 buttons in total.";
    }
    if (quickReplies.length > 10) {
      return "WhatsApp supports at most 10 quick replies.";
    }
    if (urlButtons.length > 2) {
      return "WhatsApp supports at most 2 website CTA buttons.";
    }
    if (phoneButtons.length > 1) {
      return "WhatsApp supports at most 1 phone CTA button.";
    }
    if (copyCodeButtons.length > 1) {
      return "WhatsApp supports at most 1 copy code button.";
    }
    let seenCta = false;
    for (const button of buttons) {
      const type = String(button?.type || "").toLowerCase();
      const isQuickReply = type === "quick_reply";
      const isCta = type === "url" || type === "phone" || type === "copy_code";
      if (isCta) {
        seenCta = true;
      }
      if (seenCta && isQuickReply) {
        return "WhatsApp buttons must be grouped: quick replies first, CTA buttons after them.";
      }
      if (!isQuickReply && !isCta) {
        return "Unsupported WhatsApp button type selected.";
      }
    }
    if (String(formData.category || "").toLowerCase() !== "marketing" && copyCodeButtons.length > 0) {
      return "Copy code buttons are only allowed for marketing templates.";
    }
  }

  if (formData.platform_type === "sms" && String(formData.body || "").length > 160) {
    return "SMS body is over 160 characters. Keep it shorter or split it intentionally.";
  }

  return "";
}

function interpolatePreview(text: string, variables: Record<string, string>) {
  return String(text || "").replace(/{{(\d+)}}/g, (_, token) => {
    const mapped = variables[token];
    return mapped ? previewData[mapped] || `{{${token}}}` : `{{${token}}}`;
  });
}

function renderWhatsAppText(text: string) {
  return String(text || "")
    .split("\n")
    .map((line, index) => (
      <p key={`${line}-${index}`}>
        {line.split(/(\*[^*]+\*)/g).map((segment, segmentIndex) => {
          if (/^\*[^*]+\*$/.test(segment)) {
            return <strong key={`${segment}-${segmentIndex}`}>{segment.slice(1, -1)}</strong>;
          }
          return <span key={`${segment}-${segmentIndex}`}>{segment}</span>;
        })}
      </p>
    ));
}

function PlatformTemplatePreview({
  platform,
  name,
  category,
  campaignName,
  headerType,
  headerText,
  bodyText,
  footerText,
  headerSource,
  buttons,
}: {
  platform: string;
  name: string;
  category: string;
  campaignName: string;
  headerType: string;
  headerText: string;
  bodyText: string;
  footerText: string;
  headerSource: string;
  buttons: Array<{ type?: string; title?: string; value?: string }>;
}) {
  const normalizedHeaderSource = String(headerSource || "").trim();
  const hasRemoteAsset = /^https?:\/\//i.test(normalizedHeaderSource);
  const showsMetaHandleHint =
    ["image", "video", "document"].includes(headerType) && normalizedHeaderSource && !hasRemoteAsset;

  const mediaHeaderBlock =
    headerType === "image" ? (
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
        {hasRemoteAsset ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={normalizedHeaderSource}
            alt="Template header preview"
            className="h-40 w-full object-cover"
          />
        ) : (
          <div className="px-4 py-8 text-center text-xs font-semibold text-slate-500">
            {showsMetaHandleHint
              ? "Meta media handle stored. Preview is not available for handles."
              : "Paste a Meta media handle for submission. Public image URLs are preview-only and will be rejected by Meta."}
          </div>
        )}
      </div>
    ) : headerType === "video" ? (
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-950">
        {hasRemoteAsset ? (
          <video
            src={normalizedHeaderSource}
            controls
            className="h-40 w-full bg-black object-cover"
          />
        ) : (
          <div className="px-4 py-8 text-center text-xs font-semibold text-slate-300">
            {showsMetaHandleHint
              ? "Meta media handle stored. Preview is not available for handles."
              : "Paste a Meta media handle for submission. Public video URLs are preview-only and will be rejected by Meta."}
          </div>
        )}
      </div>
    ) : headerType === "document" ? (
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700">
        <div className="font-semibold text-slate-900">Document header</div>
        <div className="mt-1 break-all text-xs text-slate-500">
          {normalizedHeaderSource || "Paste a Meta media handle for the document header sample"}
        </div>
      </div>
    ) : headerType !== "none" ? (
      <div className="rounded-xl bg-slate-100 p-3 text-sm text-slate-700">
        {headerText || "Header text"}
      </div>
    ) : null;

  const previewHeaderBar = (
    <div className="mb-4 flex items-center justify-between rounded-2xl border border-black/5 bg-white/80 px-4 py-3 shadow-sm">
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700"
          aria-label="Back"
        >
          <ArrowLeft size={14} />
        </button>
        <div>
          <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
            {platform === "whatsapp"
              ? "WhatsApp"
              : platform === "telegram"
                ? "Telegram"
                : platform === "email"
                  ? "Email"
                  : platform === "sms"
                    ? "SMS"
                    : "Instagram"}
          </div>
          <div className="text-xs text-slate-500">{campaignName || "Preview mode"}</div>
        </div>
      </div>
      <div className="text-[11px] font-semibold text-slate-400">Return</div>
    </div>
  );

  const metaBlock = (
    <div className="rounded-xl border border-dashed border-slate-200 px-4 py-3 text-xs text-slate-500">
      <div><strong>Name:</strong> {name || "Untitled template"}</div>
      <div className="mt-1"><strong>Platform:</strong> {platform}</div>
      <div className="mt-1"><strong>Category:</strong> {category}</div>
      <div className="mt-1"><strong>Campaign:</strong> {campaignName || "No campaign link"}</div>
    </div>
  );

  if (platform === "email") {
    return (
      <div className="space-y-4">
        {previewHeaderBar}
        <div className="mx-auto max-w-[420px] rounded-[1.25rem] border border-slate-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
          <div className="border-b border-slate-100 px-5 py-4">
            <div className="text-sm font-bold text-slate-900">Email preview</div>
            <div className="mt-2 text-xs text-slate-500">To: sample@example.com</div>
            <div className="mt-1 text-xs text-slate-500">Subject: {name || "Template subject"}</div>
          </div>
          <div className="px-5 py-5 text-sm leading-6 text-slate-800">
            <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white">
              {mediaHeaderBlock}
              <div className="space-y-4 px-4 py-4">
                <div>{bodyText || "Your email body will appear here."}</div>
                {footerText ? <div className="border-t border-slate-100 pt-3 text-xs text-slate-500">{footerText}</div> : null}
              </div>
            </div>
          </div>
        </div>
        {metaBlock}
      </div>
    );
  }

  if (platform === "sms") {
    return (
      <div className="space-y-4">
        {previewHeaderBar}
        <div className="mx-auto max-w-[320px] rounded-[2rem] border border-slate-300 bg-slate-900 px-4 py-5 shadow-[0_18px_40px_rgba(15,23,42,0.2)]">
          <div className="mb-4 text-center text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
            SMS preview
          </div>
          <div className="rounded-[1.25rem] bg-emerald-400 px-4 py-3 text-sm leading-6 text-slate-950">
            {bodyText || "Your SMS body will appear here."}
          </div>
        </div>
        {metaBlock}
      </div>
    );
  }

  if (platform === "telegram") {
    return (
      <div className="space-y-4">
        {previewHeaderBar}
        <div className="mx-auto max-w-[340px] rounded-[1.75rem] border border-sky-200 bg-[#eaf4fb] p-4 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
          <div className="mb-4 text-center text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">
            Telegram preview
          </div>
          <div className="rounded-2xl bg-white px-4 py-3 text-sm leading-6 text-slate-900 shadow-sm">
            {bodyText || "Your Telegram message will appear here."}
            {footerText ? <div className="mt-3 border-t border-slate-100 pt-2 text-[11px] text-slate-500">{footerText}</div> : null}
          </div>
        </div>
        {metaBlock}
      </div>
    );
  }

  if (platform === "instagram") {
    return (
      <div className="space-y-4">
        {previewHeaderBar}
        <div className="mx-auto max-w-[340px] rounded-[1.75rem] border border-fuchsia-100 bg-white p-4 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
          <div className="mb-4 text-center text-xs font-semibold uppercase tracking-[0.16em] text-fuchsia-700">
            Instagram DM preview
          </div>
          <div className="overflow-hidden rounded-2xl bg-[linear-gradient(180deg,#faf5ff,#ffffff)] text-sm leading-6 text-slate-900 shadow-sm">
            {mediaHeaderBlock}
            <div className="px-4 py-3">
              {bodyText || "Your Instagram message will appear here."}
              {footerText ? <div className="mt-3 border-t border-fuchsia-100 pt-2 text-[11px] text-slate-500">{footerText}</div> : null}
            </div>
          </div>
        </div>
        {metaBlock}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {previewHeaderBar}
      <div className="mx-auto max-w-[360px] rounded-[1.5rem] border border-slate-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
        <div className="border-b border-slate-100 px-4 py-3">
          <div className="text-sm font-bold text-slate-900">WhatsApp preview</div>
          <div className="mt-1 text-xs text-slate-500">{campaignName || "No campaign link"}</div>
        </div>
        <div className="space-y-4 bg-[#efeae2] px-4 py-5">
          <div className="flex justify-start">
            <div className="relative w-full max-w-[292px]">
              <div className="absolute left-0 top-0 h-3 w-3 -translate-x-[7px] rotate-45 rounded-[2px] bg-white" />
              <div className="relative overflow-hidden rounded-[18px] rounded-tl-[6px] bg-white shadow-[0_1px_1px_rgba(15,23,42,0.18)]">
                {mediaHeaderBlock ? (
                  <div className="border-b border-black/5">{mediaHeaderBlock}</div>
                ) : null}
                {headerType === "text" && headerText ? (
                  <div className="px-4 pb-1 pt-3 text-[13.5px] font-semibold leading-tight text-[#111b21]">
                    {headerText}
                  </div>
                ) : null}
                <div className="px-4 pb-2 pt-3 text-[14.2px] leading-[1.62] text-[#111b21]">
                  {bodyText ? renderWhatsAppText(bodyText) : "Your template body will appear here."}
                </div>
                {footerText ? (
                  <div className="px-4 pb-1 text-[11px] text-[#667781]">
                    {footerText}
                  </div>
                ) : null}
                <div className="flex justify-end px-4 pb-2 text-[11px] text-[#667781]">
                  12:00 PM
                </div>
              </div>
            </div>
          </div>
          {Array.isArray(buttons) && buttons.length > 0 ? (
            <div className="flex w-full max-w-[292px] flex-col gap-[2px]">
              {buttons.map((button, index) => {
                const type = String(button?.type || "").toLowerCase();
                return (
                  <div
                    key={`${button?.title || button?.value || "button"}-${index}`}
                    className="flex items-center justify-center rounded-[14px] bg-white px-4 py-3 text-center text-[13.5px] font-medium text-[#00a884] shadow-[0_1px_1px_rgba(15,23,42,0.18)]"
                  >
                    {type === "url" ? "Link" : type === "phone" ? "Call" : ""}
                    {type === "url" || type === "phone" ? <span className="mr-2" /> : null}
                    {button?.title || "Reply"}
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
      {metaBlock}
    </div>
  );
}

export default function NewTemplatePage() {
  const router = useRouter();
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);
  const activeProject = useAuthStore((state) => state.activeProject);
  const hasWorkspacePermission = useAuthStore((state) => state.hasWorkspacePermission);
  const getProjectRole = useAuthStore((state) => state.getProjectRole);
  const { canViewPage } = useVisibility();

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
    canCreateTemplates || projectRole === "project_admin" || projectRole === "editor";
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
    const matches = String(formData.body || "").match(/{{(\d+)}}/g);
    return matches ? Array.from(new Set<string>(matches)) : [];
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
    if (!draftForm.campaign_id) {
      return "Select a connected campaign before saving a draft.";
    }
    if (!String(draftForm.name || "").trim()) {
      return "Internal name is required for a draft.";
    }
    return "";
  };

  const handleSave = async (mode: "draft" | "publish" = "publish") => {
    if (!canCreateProjectTemplates) {
      notify("Template creation is not available for this access level.", "error");
      return;
    }
    const validationError =
      mode === "draft" ? validateDraftForm(formData) : validateTemplateForm(formData);
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
          await apiClient.post(`/templates/${savedTemplate.id}/submit-meta`);
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

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)]">
          <div className="mb-2 text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">
            {pageMode === "edit" ? "Editing existing template" : pageMode === "duplicate" ? "Duplicating template" : "New template"}
          </div>
          <h1 className="mt-4 text-[1.8rem] font-extrabold tracking-tight text-[var(--text)]">
            {pageMode === "edit" ? "Edit template" : pageMode === "duplicate" ? "Duplicate template" : "Create template"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            Configure template content on the left. The right side shows how the message will look before you save it.
          </p>
        </section>

        {!activeWorkspace?.workspace_id || !activeProject?.id ? (
          <section className="rounded-[1.5rem] border border-dashed border-[var(--line)] bg-[var(--surface)] p-8 text-sm text-[var(--muted)]">
            Select a workspace and project before creating templates.
          </section>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
            {isTemplateHydrating ? (
              <section className="xl:col-span-2 rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface)] p-8 text-sm text-[var(--muted)] shadow-[var(--shadow-soft)]">
                Loading template into editor...
              </section>
            ) : (
            <>
            <section className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)]">
              {!canCreateProjectTemplates ? (
                <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Template creation is not available for this access level.
                </div>
              ) : null}

              <div>
                <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">
                  Connected campaign
                </label>
                <select
                  className="w-full rounded-xl border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] p-3 text-sm text-[var(--text)] outline-none shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]"
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
                        ? "border-emerald-300/45 bg-emerald-500/12 text-emerald-800"
                        : "border-amber-300/45 bg-amber-500/12 text-amber-800"
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
                  <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">
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
                            ? "border-[rgba(129,140,248,0.4)] bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] text-white shadow-[0_18px_30px_var(--accent-glow)]"
                            : "border-[var(--line)] bg-[var(--surface-strong)] text-[var(--muted)] hover:border-[var(--line-strong)]"
                        }`}
                      >
                        <platform.icon size={16} />
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">
                    Internal name
                  </label>
                  <input
                    type="text"
                    className="w-full rounded-xl border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] p-3 font-mono text-sm text-[var(--text)] outline-none shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]"
                    placeholder="welcome_user_v1"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">
                      Category
                    </label>
                    <select
                      className="w-full rounded-xl border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] p-3 text-sm text-[var(--text)] outline-none shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]"
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    >
                      <option value="marketing">Marketing</option>
                      <option value="utility">Utility</option>
                      <option value="authentication">Authentication</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">
                      Language
                    </label>
                    <input
                      type="text"
                      className="w-full rounded-xl border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] p-3 text-sm text-[var(--text)] outline-none shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]"
                      value={formData.language}
                      onChange={(e) => setFormData({ ...formData, language: e.target.value })}
                    />
                  </div>
                </div>

                {formData.platform_type === "whatsapp" ? (
                  <div className="space-y-3 rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] p-4">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">
                      Header content
                    </label>
                    <div className="flex gap-2">
                      <select
                        className="w-1/3 rounded-lg border border-[var(--line)] bg-white p-2 text-xs outline-none"
                        value={formData.header_type}
                        onChange={(e) => setFormData({ ...formData, header_type: e.target.value })}
                      >
                        <option value="none">None</option>
                        <option value="text">Text</option>
                        <option value="image">Image</option>
                        <option value="video">Video</option>
                        <option value="document">Document</option>
                      </select>
                      {formData.header_type !== "none" ? (
                        <input
                          className="flex-1 rounded-lg border border-[var(--line)] bg-white p-2 text-xs outline-none"
                          placeholder={
                            formData.header_type === "text"
                              ? "Header text"
                              : "Meta media handle required for submission"
                          }
                          value={formData.header}
                          onChange={(e) => setFormData({ ...formData, header: e.target.value })}
                        />
                      ) : null}
                    </div>
                    <div className="text-[11px] text-[var(--muted)]">
                      WhatsApp text headers should stay within 60 characters. Image, video, and document headers must use a valid Meta media handle for template submission.
                    </div>
                    {["image", "video", "document"].includes(formData.header_type) ? (
                      <div className="rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface)] p-3">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div className="text-[11px] text-[var(--muted)]">
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
                            className="inline-flex items-center gap-2 rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-[var(--text)] disabled:opacity-50"
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
                          <div className="mt-2 text-[11px] text-[var(--muted)]">
                            Preview asset ready. The Meta media handle has been applied automatically. Images are compressed before upload when possible.
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div>
                  <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">
                    Body text
                  </label>
                  <textarea
                    className="h-32 w-full resize-none rounded-xl border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] p-3 text-sm text-[var(--text)] outline-none shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]"
                    placeholder="Hello {{1}}, how can we help today?"
                    value={formData.body}
                    onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                  />
                  <div className="mt-1 flex items-center justify-between text-[11px] text-[var(--muted)]">
                    <span>{formData.platform_type === "whatsapp" ? "WhatsApp body limit: 1024" : formData.platform_type === "sms" ? "SMS text limit: 160" : "Message body"}</span>
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
                      <span className="rounded bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] px-1.5 py-0.5 text-[8px] font-black text-white">
                        Preview active
                      </span>
                    </div>
                    {dynamicVars.map((variable) => (
                      <div key={variable} className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="w-8 text-xs font-black text-blue-500">{variable}</span>
                          <select
                            className="flex-1 rounded-lg border border-blue-200 bg-white p-2 text-[10px] font-bold outline-none"
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
                          <div className="ml-10 flex items-center gap-1 text-[9px] font-bold italic text-[var(--muted)]">
                            <Eye size={10} /> Currently holds: "{previewData[formData.variables[variable]] || "No data"}"
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}

                {formData.platform_type === "whatsapp" || formData.platform_type === "telegram" ? (
                  <div>
                    <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">
                      Footer text
                    </label>
                    <input
                      type="text"
                      className="w-full rounded-xl border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] p-3 text-sm text-[var(--text)] outline-none shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]"
                      placeholder="Small grey text at bottom..."
                      value={formData.footer}
                      onChange={(e) => setFormData({ ...formData, footer: e.target.value })}
                    />
                    {formData.platform_type === "whatsapp" ? (
                      <div className="mt-1 flex items-center justify-between text-[11px] text-[var(--muted)]">
                        <span>WhatsApp footer limit: 60</span>
                        <span>{String(formData.footer || "").length}</span>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="space-y-3 rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">
                        Buttons and actions
                      </div>
                      <div className="mt-1 text-xs text-[var(--muted)]">
                        {buttonLimits[formData.platform_type]?.hint}
                      </div>
                      {formData.platform_type === "whatsapp" ? (
                        <div className="mt-1 text-[11px] text-[var(--muted)]">
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
                        className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-[var(--text)] disabled:opacity-50"
                      >
                        Add button
                      </button>
                    ) : null}
                  </div>

                  {currentButtonLimit === 0 ? (
                    <div className="rounded-lg border border-dashed border-[var(--line)] bg-[var(--surface)] px-3 py-3 text-xs text-[var(--muted)]">
                      Use body text such as "Reply YES" or include a short URL for SMS campaigns.
                    </div>
                  ) : (formData.buttons || []).length > 0 ? (
                    <div className="space-y-3">
                      {(formData.buttons || []).map((button: any, index: number) => (
                        <div key={`${formData.platform_type}-btn-${index}`} className="grid gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3 md:grid-cols-[140px_1fr_1fr_auto]">
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
                            className="rounded-lg border border-[var(--line)] bg-[var(--surface-strong)] px-3 py-2 text-xs text-[var(--text)]"
                          >
                            {(formData.platform_type === "whatsapp"
                              ? [
                                  { value: "quick_reply", label: "Quick reply" },
                                  { value: "url", label: "Website CTA" },
                                  { value: "phone", label: "Phone CTA" },
                                  { value: "copy_code", label: "Copy code" },
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
                            className="rounded-lg border border-[var(--line)] bg-[var(--surface-strong)] px-3 py-2 text-xs text-[var(--text)]"
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
                            placeholder={button.type === "url" ? "https://..." : button.type === "phone" ? "+91..." : "Action value"}
                            className="rounded-lg border border-[var(--line)] bg-[var(--surface-strong)] px-3 py-2 text-xs text-[var(--text)]"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setFormData((prev: any) => ({
                                ...prev,
                                buttons: (prev.buttons || []).filter((_: any, itemIndex: number) => itemIndex !== index),
                              }))
                            }
                            className="rounded-lg border border-rose-300/45 bg-rose-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-rose-800"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-[var(--line)] bg-[var(--surface)] px-3 py-3 text-xs text-[var(--muted)]">
                      No buttons added yet.
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => handleSave("draft")}
                  disabled={isSaving || !canCreateProjectTemplates}
                  className="flex items-center gap-2 rounded-xl border border-slate-300 bg-slate-100 px-5 py-3 text-xs font-black uppercase tracking-widest text-slate-800 disabled:opacity-50"
                >
                  <Eye size={16} />
                  {isSaving ? "Saving..." : editingTemplateId ? "Save Draft" : "Save as Draft"}
                </button>
                <button
                  onClick={() => handleSave("publish")}
                  disabled={isSaving || !canCreateProjectTemplates}
                  className="flex items-center gap-2 rounded-xl border border-[rgba(129,140,248,0.4)] bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] px-5 py-3 text-xs font-black uppercase tracking-widest text-white shadow-[0_18px_30px_var(--accent-glow)] disabled:opacity-50"
                >
                  <Plus size={16} />
                  {isSaving ? "Saving..." : editingTemplateId ? "Save and Submit" : "Create and Submit"}
                </button>
                <Link
                  href="/templates"
                  className="rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] px-5 py-3 text-xs font-black uppercase tracking-widest text-[var(--text)]"
                >
                  Cancel
                </Link>
              </div>
            </section>

            <section className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)]">
              <div className="mb-5 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">
                <AlignLeft size={14} />
                Live preview
              </div>

              <div className="rounded-[1.5rem] border border-[var(--line)] bg-[linear-gradient(180deg,#e7f0ff,#eef2ff)] p-5">
                <PlatformTemplatePreview
                  platform={formData.platform_type}
                  name={formData.name}
                  category={formData.category}
                  campaignName={selectedCampaignName}
                  headerType={formData.header_type}
                  headerText={previewHeader}
                  bodyText={previewBody}
                  footerText={previewFooter}
                  headerSource={headerPreviewUrl || formData.header}
                  buttons={Array.isArray(formData.buttons) ? formData.buttons : []}
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
