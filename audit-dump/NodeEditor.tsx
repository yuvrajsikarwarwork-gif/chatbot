// frontend-dashboard/components/flow/NodeEditor.tsx

import { Node } from "reactflow";
import { useEffect, useRef, useState } from "react";
import apiClient from "../../services/apiClient";
import { botService } from "../../services/botService";
import { leadFormService } from "../../services/leadFormService";
import { RotateCcw, Link, Headset, Bot, LayoutTemplate, MessageSquare, List, Clock, Split, BrainCircuit } from "lucide-react";

type LeadFormOption = {
  id: string;
  name?: string;
  fields?: Array<{
    id?: string;
    fieldKey: string;
    fieldType?: string;
    questionLabel: string;
    isRequired?: boolean;
    sortOrder?: number;
  }>;
};

interface NodeEditorProps {
  node: Node | null;
  onSaveAndClose?: (data: any) => void | Promise<void>;
  onClose: () => void;
  currentBotId?: string;
  currentFlowId?: string | null;
  isSystemFlow?: boolean;
  flowOptions?: Array<{ id: string; flow_name?: string; name?: string; is_default?: boolean }>;
  botOptions?: Array<{ id: string; name?: string }>;
  flowOptionsByBot?: Record<
    string,
    Array<{ id: string; flow_name?: string; name?: string; is_default?: boolean }>
  >;
  leadForms?: Array<{
    id: string;
    name?: string;
    fields?: Array<{
      id?: string;
      fieldKey: string;
      fieldType?: string;
      questionLabel: string;
      isRequired?: boolean;
      sortOrder?: number;
    }>;
  }>;
}

export default function NodeEditor({
  node,
  onSaveAndClose,
  onClose,
  currentBotId,
  currentFlowId,
  isSystemFlow = false,
  flowOptions = [],
  botOptions = [],
  flowOptionsByBot = {},
  leadForms = [],
}: NodeEditorProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [draftData, setDraftData] = useState<any>(node?.data || {});
  const draftDataRef = useRef<any>(node?.data || {});
  const [resolvedLeadForms, setResolvedLeadForms] = useState<LeadFormOption[]>(leadForms as LeadFormOption[]);
  const [hasFetchedLeadForms, setHasFetchedLeadForms] = useState(false);

  const normalizeDraftData = (rawData: any) => {
    const next = { ...(rawData || {}) };
    const normalizedLeadFormId = String(
      next.linkedFormId ||
        next.leadFormId ||
        next.formId ||
        next.lead_form_id ||
        ""
    ).trim();
    const normalizedFieldKey = String(
      next.linkedFieldKey ||
        next.leadField ||
        next.field ||
        ""
    ).trim();
    const hasExplicitLeadFormLink = Boolean(next.linkLeadForm || normalizedLeadFormId);
    const hasLegacyFieldKey = Boolean(normalizedFieldKey);

    if (hasExplicitLeadFormLink) {
      next.linkLeadForm = true;
      if (normalizedLeadFormId) {
        next.linkedFormId = normalizedLeadFormId;
        next.leadFormId = normalizedLeadFormId;
        next.formId = normalizedLeadFormId;
        next.lead_form_id = normalizedLeadFormId;
      }
      if (normalizedFieldKey) {
        next.linkedFieldKey = normalizedFieldKey;
        next.leadField = normalizedFieldKey;
        next.field = normalizedFieldKey;
        if (!String(next.variable || "").trim()) {
          next.variable = normalizedFieldKey;
        }
      }
    } else {
      next.linkLeadForm = false;
      if (hasLegacyFieldKey) {
        next.linkedFieldKey = next.linkedFieldKey || normalizedFieldKey;
        next.leadField = next.leadField || normalizedFieldKey;
        next.field = next.field || normalizedFieldKey;
        if (!String(next.variable || "").trim()) {
          next.variable = normalizedFieldKey;
        }
      }
    }

    return next;
  };

  const handleSaveAndCloseClick = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const latestDraft = normalizeDraftData({ ...draftDataRef.current, ...draftData });
    draftDataRef.current = latestDraft;
    setDraftData(latestDraft);

    if (onSaveAndClose) {
      await onSaveAndClose(latestDraft);
      return;
    }

    onClose();
  };

  useEffect(() => {
    const normalizedDraft = normalizeDraftData(node?.data || {});
    setDraftData(normalizedDraft);
    draftDataRef.current = normalizedDraft;
  }, [node?.id]);

  useEffect(() => {
    draftDataRef.current = draftData;
  }, [draftData]);

  useEffect(() => {
    setResolvedLeadForms(Array.isArray(leadForms) ? (leadForms as LeadFormOption[]) : []);
    if (Array.isArray(leadForms) && leadForms.length > 0) {
      setHasFetchedLeadForms(true);
    }
  }, [leadForms]);

  useEffect(() => {
    setResolvedLeadForms(Array.isArray(leadForms) ? (leadForms as LeadFormOption[]) : []);
    setHasFetchedLeadForms(false);
  }, [currentBotId]);

  useEffect(() => {
    if (!currentBotId || hasFetchedLeadForms) {
      return;
    }

    let cancelled = false;

    const loadLeadForms = async () => {
      try {
        const bot = await botService.getBot(currentBotId);
        const workspaceId = String(bot?.workspace_id || "").trim();
        const projectId = String(bot?.project_id || "").trim();
        if (!workspaceId || cancelled) {
          if (!cancelled) {
            setHasFetchedLeadForms(true);
          }
          return;
        }

        const rows = await leadFormService.list(workspaceId, projectId || undefined);
        if (!cancelled) {
          setResolvedLeadForms(Array.isArray(rows) ? (rows as LeadFormOption[]) : []);
          setHasFetchedLeadForms(true);
        }
      } catch (error) {
        console.error("Failed to hydrate lead forms in node editor:", error);
        if (!cancelled) {
          setHasFetchedLeadForms(true);
        }
      }
    };

    loadLeadForms();

    return () => {
      cancelled = true;
    };
  }, [currentBotId, hasFetchedLeadForms]);

  if (!node) return null;
  const nodeType = String(node.type || "").trim().toLowerCase();
  const isLockedTopology = Boolean(isSystemFlow);
  const isMessageNode = ["message", "msg_text", "msg_media"].includes(nodeType);
  const isMenuNode = ["menu", "menu_button", "menu_list"].includes(nodeType);
  const isAiGenerateNode = nodeType === "ai_generate";
  const isBusinessHoursNode = nodeType === "business_hours";
  const isSplitTrafficNode = nodeType === "split_traffic";

  const updateData = (key: string, value: any) => {
    setDraftData((prev: any) => {
      const next = { ...prev, [key]: value };
      draftDataRef.current = next;
      return next;
    });
  };

  const inferValidationForLeadField = (fieldType?: string, fieldKey?: string) => {
    const normalizedType = String(fieldType || "").trim().toLowerCase();
    const normalizedKey = String(fieldKey || "").trim().toLowerCase();

    if (normalizedType === "email" || normalizedKey === "email") return "email";
    if (normalizedType === "phone" || normalizedKey === "phone") return "phone";
    if (normalizedType === "number") return "number";
    if (normalizedType === "date") return "date";
    return "text";
  };

  const gotoType = String(draftData.gotoType || "node").trim().toLowerCase();
  const selectedLeadFormId = String(
    draftData.linkedFormId ||
      draftData.leadFormId ||
      draftData.formId ||
      draftData.lead_form_id ||
    ""
  ).trim();
  const selectedLeadForm =
    resolvedLeadForms.find((form) => String(form.id) === selectedLeadFormId) || null;
  const selectedLeadFormFields = Array.isArray(selectedLeadForm?.fields)
    ? [...selectedLeadForm.fields].sort(
        (a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0)
      )
    : [];
  const sameBotFlowOptions = flowOptions.filter(
    (flow) => String(flow.id) !== String(currentFlowId || "")
  );
  const selectedTargetBotId = String(draftData.targetBotId || "").trim();
  const targetBotFlowOptions = selectedTargetBotId
    ? flowOptionsByBot[selectedTargetBotId] || []
    : [];
  const isLeadFormLinked = Boolean(
    draftData.linkLeadForm ||
      draftData.linkedFormId ||
      draftData.leadFormId ||
      draftData.formId ||
      draftData.lead_form_id
  );

  const applyLeadFormFieldSelection = (formId: string, fieldKey: string) => {
    const form = resolvedLeadForms.find((item) => String(item.id) === String(formId)) || null;
    const field =
      Array.isArray(form?.fields)
        ? form.fields.find((item) => String(item.fieldKey) === String(fieldKey)) || null
        : null;

    setDraftData((prev: any) => {
      const next = {
        ...prev,
        linkLeadForm: true,
        linkedFormId: formId,
        leadFormId: formId,
        formId,
        linkedFieldKey: field?.fieldKey || "",
        leadField: field?.fieldKey || "",
        field: field?.fieldKey || "",
        variable: field?.fieldKey || "",
        validation: inferValidationForLeadField(field?.fieldType, field?.fieldKey),
        text:
          String(prev.text || "").trim().length > 0
            ? prev.text
            : field?.questionLabel || prev.text || "",
      };
      draftDataRef.current = next;
      return next;
    });
  };

  useEffect(() => {
    if (!isLeadFormLinked || selectedLeadFormId || leadForms.length === 0) {
      return;
    }

    const firstAvailableForm = leadForms[0] || null;
    const firstAvailableField = Array.isArray(firstAvailableForm?.fields)
      ? firstAvailableForm.fields[0]
      : null;

    if (firstAvailableForm) {
      applyLeadFormFieldSelection(
        String(firstAvailableForm.id),
        String(firstAvailableField?.fieldKey || "")
      );
    }
  }, [applyLeadFormFieldSelection, isLeadFormLinked, leadForms, selectedLeadFormId]);

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      let fileToUpload = file;

      if (file.type.startsWith('image/')) {
        fileToUpload = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = (event) => {
            const img = new Image();
            img.src = event.target?.result as string;
            img.onload = () => {
              const canvas = document.createElement('canvas');
              const MAX_WIDTH = 1024;
              let width = img.width;
              let height = img.height;

              if (width > MAX_WIDTH) {
                height = Math.round((height * MAX_WIDTH) / width);
                width = MAX_WIDTH;
              }

              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext('2d');
              ctx?.drawImage(img, 0, 0, width, height);
              
              canvas.toBlob((blob) => {
                if (blob) resolve(new File([blob], file.name, { type: file.type }));
                else resolve(file); 
              }, file.type, 0.7); 
            };
          };
        });
      }

      const formData = new FormData();
      formData.append("file", fileToUpload);

      const response = await apiClient.post("/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });

      if (response.data?.url) updateData('media_url', response.data.url);
    } catch (error) {
      console.error("Upload failed", error);
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  /* =====================================================================
     SHARED LOGIC (For Inputs and Menus)
  ===================================================================== */
  
  const RenderTimeoutAndRetryLogic = () => (
    <div className="space-y-4 pt-4 border-t border-border-main">
      <div>
        <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Invalid Response Message</label>
        <textarea disabled={isLockedTopology} className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs resize-none h-12 disabled:cursor-not-allowed disabled:opacity-60" placeholder="Invalid format/selection. Please try again." value={draftData.onInvalidMessage || ""} onChange={(e) => updateData('onInvalidMessage', e.target.value)} />
      </div>

      <div className="grid grid-cols-1 gap-4">
        <div>
          <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Max Retries</label>
          <input type="number" disabled={isLockedTopology} className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs disabled:cursor-not-allowed disabled:opacity-60" placeholder="3" value={draftData.maxRetries || ""} onChange={(e) => updateData('maxRetries', Number(e.target.value))} />
        </div>
      </div>

      <div className="bg-amber-50 p-3 rounded-lg border border-amber-100 space-y-3">
        <div className="flex items-center gap-1 mb-1">
          <RotateCcw size={12} className="text-amber-600" />
          <span className="text-[10px] font-black text-amber-800 uppercase tracking-widest">Validation, Timeout & Fallback</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[8px] font-black text-amber-600 uppercase mb-1">Reminder Delay (Sec)</label>
            <input type="number" disabled={isLockedTopology} className="w-full border border-border-main bg-canvas rounded p-2 text-xs text-text-main outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60" placeholder="300" value={draftData.reminderDelay || ""} onChange={(e) => updateData('reminderDelay', Number(e.target.value))} />
          </div>
          <div>
            <label className="block text-[8px] font-black text-amber-600 uppercase mb-1">Timeout (Sec)</label>
            <input type="number" disabled={isLockedTopology} className="w-full border border-border-main bg-canvas rounded p-2 text-xs text-text-main outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60" placeholder="900" value={draftData.timeout || ""} onChange={(e) => updateData('timeout', Number(e.target.value))} />
          </div>
        </div>
        <textarea disabled={isLockedTopology} className="w-full border border-border-main bg-canvas rounded p-2 text-xs text-text-main resize-none h-12 outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60" placeholder="Reminder text..." value={draftData.reminderText || ""} onChange={(e) => updateData('reminderText', e.target.value)} />
        <textarea disabled={isLockedTopology} className="w-full border border-border-main bg-canvas rounded p-2 text-xs text-text-main resize-none h-12 outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60" placeholder="Fallback text if timeout path is missing..." value={draftData.timeoutFallback || ""} onChange={(e) => updateData('timeoutFallback', e.target.value)} />
      </div>
    </div>
  );

  /* =====================================================================
     NODE-SPECIFIC RENDER COMPONENTS
  ===================================================================== */

  const RenderMenuOptionsNode = (maxOptions: number, label: string, isList = false, includeTimeout = false) => (
    <div className="space-y-4 pt-4 border-t border-border-main">
      {isList ? (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Button Text</label>
            <input className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-medium" placeholder="View Options" value={draftData.buttonText || ""} onChange={(e) => updateData("buttonText", e.target.value)} />
          </div>
          <div>
            <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Section Title</label>
            <input className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-medium" placeholder="Options" value={draftData.sectionTitle || ""} onChange={(e) => updateData("sectionTitle", e.target.value)} />
          </div>
        </div>
      ) : null}
      <div className="space-y-2">
        <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest">{label}s (Max {maxOptions})</label>
        {Array.from({ length: maxOptions }).map((_, i) => {
          const num = i + 1;
          return (
            <input
              key={num}
              className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-medium text-text-main focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
              placeholder={`${label} ${num}`}
              value={draftData[`item${num}`] || ""}
              onChange={(e) => updateData(`item${num}`, e.target.value)}
            />
          );
        })}
      </div>
      {includeTimeout ? RenderTimeoutAndRetryLogic() : null}
    </div>
  );

  const RenderMenuNode = () => (
    <div className="space-y-4 pt-4 border-t border-border-main">
      <div className="rounded-lg border border-violet-100 bg-violet-50 p-3 text-[11px] leading-5 text-violet-800 flex items-start gap-2">
        <List size={12} className="mt-0.5 shrink-0" />
        <span>One menu node handles both buttons and lists. The runtime renders buttons for 1-3 options and a list for 4-10 options automatically.</span>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Button Text</label>
          <input className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-medium" placeholder="View Options" value={draftData.buttonText || ""} onChange={(e) => updateData("buttonText", e.target.value)} />
        </div>
        <div>
          <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Section Title</label>
          <input className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-medium" placeholder="Options" value={draftData.sectionTitle || ""} onChange={(e) => updateData("sectionTitle", e.target.value)} />
        </div>
      </div>
      {RenderMenuOptionsNode(10, "Option", false, true)}
    </div>
  );

  const RenderMessageNode = () => {
    const messageType = String(
      draftData.messageType ||
        draftData.contentType ||
        (nodeType === "msg_media" ? "image" : "text")
    ).trim().toLowerCase();

    return (
      <div className="space-y-4 pt-4 border-t border-border-main">
      <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-[11px] leading-5 text-emerald-800 flex items-start gap-2">
          <MessageSquare size={12} className="mt-0.5 shrink-0" />
          <span>A single Message node can send text or media. Use the selector below to switch between text, image, video, audio, and file.</span>
        </div>
        <div>
          <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Message Type</label>
          <select
            disabled={isLockedTopology}
            className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-medium outline-none disabled:cursor-not-allowed disabled:opacity-60"
            value={messageType}
            onChange={(e) => updateData("messageType", e.target.value)}
          >
            <option value="text">Text</option>
            <option value="image">Image</option>
            <option value="video">Video</option>
            <option value="audio">Audio</option>
            <option value="document">File / Document</option>
          </select>
        </div>
        {messageType !== "text" ? (
          <div>
            <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Media URL</label>
            <div className="flex gap-2 mb-2">
              <input disabled={isLockedTopology} className="flex-1 border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-mono disabled:cursor-not-allowed disabled:opacity-60" placeholder="https://..." value={draftData.media_url || draftData.url || ""} onChange={(e) => updateData('media_url', e.target.value)} />
              <label className={`bg-blue-50 border border-blue-100 text-blue-600 px-3 rounded-lg text-xs font-bold flex items-center justify-center transition-all min-w-[70px] ${isLockedTopology ? "opacity-60 cursor-not-allowed" : "cursor-pointer hover:bg-blue-100"}`}>
                {isUploading ? "..." : "Upload"}
                <input type="file" accept="image/*,video/*,audio/*,application/pdf" className="hidden" onChange={handleMediaUpload} disabled={isUploading || isLockedTopology} />
              </label>
            </div>
            <div className="rounded-lg border border-border-main bg-canvas p-3 text-[11px] leading-5 text-text-muted">
              Use the top text box above as a caption or notes for this message.
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-border-main bg-canvas p-3 text-[11px] leading-5 text-text-muted">
            Text messages are edited in the top text box above.
          </div>
        )}
      </div>
    );
  };

  const RenderAiGenerateNode = () => (
    <div className="space-y-4 pt-4 border-t border-border-main">
      <div className="rounded-xl border border-sky-100 bg-sky-50 p-3 text-[11px] leading-5 text-sky-800 flex items-start gap-2">
        <BrainCircuit size={12} className="mt-0.5 shrink-0" />
        <span>Prompt a configured AI provider and save the generated answer into a variable for downstream nodes.</span>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Provider</label>
          <select disabled={isLockedTopology} className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs outline-none disabled:cursor-not-allowed disabled:opacity-60" value={draftData.provider || "auto"} onChange={(e) => updateData("provider", e.target.value)}>
            <option value="auto">Auto</option>
            <option value="openai">OpenAI</option>
            <option value="gemini">Gemini</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Model</label>
          <input disabled={isLockedTopology} className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-mono disabled:cursor-not-allowed disabled:opacity-60" placeholder="gpt-5.4-mini" value={draftData.model || ""} onChange={(e) => updateData("model", e.target.value)} />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-text-muted">Prompt</label>
        <textarea disabled={isLockedTopology} className="w-full rounded-lg border border-border-main bg-canvas p-2.5 text-xs font-mono resize-none h-24 disabled:cursor-not-allowed disabled:opacity-60" placeholder="Summarize this lead in one sentence: {{lead_summary}}" value={draftData.prompt || draftData.text || ""} onChange={(e) => updateData("prompt", e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-text-muted">Save Output To</label>
          <input disabled={isLockedTopology} className="w-full rounded-lg border border-border-main bg-canvas p-2.5 text-xs font-mono disabled:cursor-not-allowed disabled:opacity-60" placeholder="ai_output" value={draftData.saveTo || draftData.outputVariable || ""} onChange={(e) => updateData("saveTo", e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-text-muted">Style / Tone</label>
          <input disabled={isLockedTopology} className="w-full rounded-lg border border-border-main bg-canvas p-2.5 text-xs font-mono disabled:cursor-not-allowed disabled:opacity-60" placeholder="concise, friendly, sales" value={draftData.style || ""} onChange={(e) => updateData("style", e.target.value)} />
        </div>
      </div>
    </div>
  );

  const RenderBusinessHoursNode = () => (
    <div className="space-y-4 pt-4 border-t border-border-main">
      <div className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-[11px] leading-5 text-amber-800 flex items-start gap-2">
        <Clock size={12} className="mt-0.5 shrink-0" />
        <span>Route users differently based on schedule and timezone. Connect the Open and Closed outputs.</span>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Timezone</label>
          <input disabled={isLockedTopology} className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-mono disabled:cursor-not-allowed disabled:opacity-60" placeholder="Asia/Kolkata" value={draftData.timezone || ""} onChange={(e) => updateData("timezone", e.target.value)} />
        </div>
        <div>
          <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Days (CSV)</label>
          <input disabled={isLockedTopology} className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-mono disabled:cursor-not-allowed disabled:opacity-60" placeholder="mon,tue,wed,thu,fri" value={draftData.days || ""} onChange={(e) => updateData("days", e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Open Time</label>
          <input disabled={isLockedTopology} className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-mono disabled:cursor-not-allowed disabled:opacity-60" placeholder="09:00" value={draftData.startTime || ""} onChange={(e) => updateData("startTime", e.target.value)} />
        </div>
        <div>
          <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Close Time</label>
          <input disabled={isLockedTopology} className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-mono disabled:cursor-not-allowed disabled:opacity-60" placeholder="17:00" value={draftData.endTime || ""} onChange={(e) => updateData("endTime", e.target.value)} />
        </div>
      </div>
      <div>
        <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Closed Message</label>
        <textarea disabled={isLockedTopology} className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs resize-none h-16 disabled:cursor-not-allowed disabled:opacity-60" placeholder="We're currently offline. Please leave a message." value={draftData.closedMessage || ""} onChange={(e) => updateData("closedMessage", e.target.value)} />
      </div>
    </div>
  );

  const RenderSplitTrafficNode = () => (
    <div className="space-y-4 pt-4 border-t border-border-main">
      <div className="rounded-xl border border-fuchsia-100 bg-fuchsia-50 p-3 text-[11px] leading-5 text-fuchsia-800 flex items-start gap-2">
        <Split size={12} className="mt-0.5 shrink-0" />
        <span>Split traffic between two variants for A/B testing.</span>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Variant A %</label>
          <input type="number" min="0" max="100" disabled={isLockedTopology} className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs disabled:cursor-not-allowed disabled:opacity-60" placeholder="50" value={draftData.percentA || ""} onChange={(e) => updateData("percentA", Number(e.target.value || 0))} />
        </div>
        <div>
          <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Variant B %</label>
          <input type="number" min="0" max="100" disabled={isLockedTopology} className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs disabled:cursor-not-allowed disabled:opacity-60" placeholder="50" value={draftData.percentB || ""} onChange={(e) => updateData("percentB", Number(e.target.value || 0))} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Route A Label</label>
          <input disabled={isLockedTopology} className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-mono disabled:cursor-not-allowed disabled:opacity-60" placeholder="Variant A" value={draftData.routeALabel || ""} onChange={(e) => updateData("routeALabel", e.target.value)} />
        </div>
        <div>
          <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Route B Label</label>
          <input disabled={isLockedTopology} className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-mono disabled:cursor-not-allowed disabled:opacity-60" placeholder="Variant B" value={draftData.routeBLabel || ""} onChange={(e) => updateData("routeBLabel", e.target.value)} />
        </div>
      </div>
    </div>
  );

  const RenderInputNode = () => (
    <div className="space-y-4 pt-4 border-t border-border-main">
      <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
        <label className="block text-[10px] font-black text-blue-800 uppercase tracking-widest mb-1">Variable Name</label>
        <input disabled={isLockedTopology} className="w-full border border-border-main bg-canvas rounded p-2 text-xs font-mono text-text-main outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60" placeholder="e.g. user_email" value={draftData.variable || ""} onChange={(e) => updateData('variable', e.target.value)} />
      </div>

      <div>
        <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Validation Type</label>
        <select disabled={isLockedTopology} className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-medium outline-none disabled:cursor-not-allowed disabled:opacity-60" value={draftData.validation || "text"} onChange={(e) => updateData('validation', e.target.value)}>
          <option value="text">Text / Any</option>
          <option value="email">Email</option>
          <option value="phone">Phone Number</option>
          <option value="number">Numeric</option>
          <option value="date">Date</option>
          <option value="regex">Custom Regex</option>
        </select>
      </div>

      <div className="space-y-3 rounded-xl border border-emerald-100 bg-emerald-50 p-4">
        <label className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.16em] text-emerald-800">
          <input
            type="checkbox"
            disabled={isLockedTopology}
            checked={isLeadFormLinked}
            onChange={(e) => {
              const enabled = e.target.checked;
              if (!enabled) {
                setDraftData((prev: any) => {
                  const next = {
                    ...prev,
                    linkLeadForm: false,
                    linkedFormId: "",
                    leadFormId: "",
                    formId: "",
                    linkedFieldKey: "",
                    leadField: "",
                    field: "",
                  };
                  draftDataRef.current = next;
                  return next;
                });
                return;
              }

              const firstAvailableForm = resolvedLeadForms[0] || null;
              const firstAvailableField = Array.isArray(firstAvailableForm?.fields)
                ? firstAvailableForm.fields[0]
                : null;
              const existingFormId = String(
                draftData.linkedFormId ||
                  draftData.leadFormId ||
                  draftData.formId ||
                  draftData.lead_form_id ||
                  ""
              ).trim();

              setDraftData((prev: any) => {
                const next = {
                  ...prev,
                  linkLeadForm: true,
                };
                draftDataRef.current = next;
                return next;
              });

              if (!existingFormId && firstAvailableForm) {
                applyLeadFormFieldSelection(
                  String(firstAvailableForm.id),
                  String(firstAvailableField?.fieldKey || "")
                );
              }
            }}
          />
          Link To Lead Form
        </label>

        {isLeadFormLinked ? (
          <div className="text-[11px] leading-5 text-emerald-800">
            Choose which form this answer belongs to, then choose which question/field in that form should receive the user's response.
          </div>
        ) : null}

        {isLeadFormLinked ? (
          <>
            <div>
              <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-emerald-700">
                Which Form?
              </label>
              <select
                disabled={isLockedTopology}
                className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-medium text-text-main outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
                value={selectedLeadFormId || ""}
                onChange={(e) => {
                  const nextFormId = e.target.value;
                  const nextForm =
                  resolvedLeadForms.find((form) => String(form.id) === String(nextFormId)) || null;
                  const firstField = Array.isArray(nextForm?.fields) ? nextForm.fields[0] : null;
                  applyLeadFormFieldSelection(nextFormId, String(firstField?.fieldKey || ""));
                }}
              >
                <option value="">Select lead form</option>
                {resolvedLeadForms.map((form) => (
                  <option key={form.id} value={form.id}>
                    {form.name || "Untitled form"}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-emerald-700">
                Which Question?
              </label>
              <select
                disabled={isLockedTopology || !selectedLeadForm}
                className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-medium text-text-main outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
                value={String(draftData.linkedFieldKey || draftData.leadField || draftData.field || "")}
                onChange={(e) => {
                  applyLeadFormFieldSelection(String(selectedLeadFormId || ""), e.target.value);
                }}
              >
                <option value="">Select question</option>
                {selectedLeadFormFields.map((field) => (
                  <option key={field.id || field.fieldKey} value={field.fieldKey}>
                    {field.questionLabel || field.fieldKey}
                  </option>
                ))}
              </select>
            </div>

            {resolvedLeadForms.length === 0 ? (
              <div className="text-[11px] leading-5 text-emerald-800">
                No lead forms exist yet. Create one from the Lead Forms page first.
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      {draftData.validation === 'regex' && (
        <div>
          <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Regex Pattern</label>
          <input disabled={isLockedTopology} className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-mono disabled:cursor-not-allowed disabled:opacity-60" placeholder="e.g. ^[A-Z]{3}$" value={draftData.regex || ""} onChange={(e) => updateData('regex', e.target.value)} />
        </div>
      )}

      {RenderTimeoutAndRetryLogic()}
    </div>
  );

  const RenderDelayNodeLogic = (label = "Delay Before Send (ms)") => (
    <div className="space-y-4 pt-4 border-t border-border-main">
      <div>
        <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">{label}</label>
          <input
            type="number"
            min="0"
            step="100"
            disabled={isLockedTopology}
            className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs disabled:cursor-not-allowed disabled:opacity-60"
            placeholder="0"
            value={draftData.delayMs || ""}
            onChange={(e) => updateData("delayMs", Number(e.target.value || 0))}
        />
      </div>
    </div>
  );

  const RenderDelayNode = () => (
    <div className="space-y-4 pt-4 border-t border-border-main">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Duration</label>
          <input
            type="number"
            min="0"
            disabled={isLockedTopology}
            className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs disabled:cursor-not-allowed disabled:opacity-60"
            placeholder="2"
            value={draftData.duration || ""}
            onChange={(e) => updateData("duration", Number(e.target.value || 0))}
          />
        </div>
        <div>
          <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Unit</label>
          <select
            className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs outline-none disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isLockedTopology}
            value={draftData.unit || "seconds"}
            onChange={(e) => updateData("unit", e.target.value)}
          >
            <option value="seconds">Seconds</option>
            <option value="minutes">Minutes</option>
            <option value="hours">Hours</option>
          </select>
        </div>
      </div>
    </div>
  );

  const RenderApiNode = () => (
    <div className="space-y-4 pt-4 border-t border-border-main">
      <div className="rounded-xl border border-violet-100 bg-violet-50 p-3 text-[11px] leading-5 text-violet-800">
        Send a live HTTP request to an external tool after the bot collects data. Use <span className="font-black">{"{{variable_name}}"}</span> placeholders in the URL, headers, and body.
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Method</label>
          <select disabled={isLockedTopology} className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs outline-none disabled:cursor-not-allowed disabled:opacity-60" value={draftData.method || "GET"} onChange={(e) => updateData("method", e.target.value)}>
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="PATCH">PATCH</option>
            <option value="DELETE">DELETE</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Save Response To</label>
          <input disabled={isLockedTopology} className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-mono disabled:cursor-not-allowed disabled:opacity-60" placeholder="api_response" value={draftData.saveTo || ""} onChange={(e) => updateData("saveTo", e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Save Status To</label>
          <input disabled={isLockedTopology} className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-mono disabled:cursor-not-allowed disabled:opacity-60" placeholder="api_status" value={draftData.statusSaveTo || ""} onChange={(e) => updateData("statusSaveTo", e.target.value)} />
        </div>
        <div>
          <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Timeout (ms)</label>
          <input type="number" min="0" step="100" disabled={isLockedTopology} className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs disabled:cursor-not-allowed disabled:opacity-60" placeholder="10000" value={draftData.timeoutMs || ""} onChange={(e) => updateData("timeoutMs", Number(e.target.value || 0))} />
        </div>
      </div>
      <div>
        <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">URL</label>
        <input disabled={isLockedTopology} className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-mono disabled:cursor-not-allowed disabled:opacity-60" placeholder="https://api.example.com/orders" value={draftData.url || ""} onChange={(e) => updateData("url", e.target.value)} />
      </div>
      <div>
        <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Headers (JSON)</label>
        <textarea disabled={isLockedTopology} className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-mono resize-none h-20 disabled:cursor-not-allowed disabled:opacity-60" placeholder='{"Authorization":"Bearer {{crm_token}}","Content-Type":"application/json"}' value={draftData.headers || ""} onChange={(e) => updateData("headers", e.target.value)} />
      </div>
      <div>
        <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">JSON Body</label>
        <textarea disabled={isLockedTopology} className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-mono resize-none h-24 disabled:cursor-not-allowed disabled:opacity-60" placeholder='{"orderId":"{{order_id}}"}' value={draftData.body || ""} onChange={(e) => updateData("body", e.target.value)} />
      </div>
      <div>
        <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Allowed Success Status Codes</label>
        <input disabled={isLockedTopology} className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-mono disabled:cursor-not-allowed disabled:opacity-60" placeholder="200,201,202" value={draftData.successStatuses || ""} onChange={(e) => updateData("successStatuses", e.target.value)} />
      </div>
    </div>
  );

  const RenderReminderNode = () => (
    <div className="space-y-4 pt-4 border-t border-border-main">
      <div className="rounded-lg border border-border-main bg-canvas p-3 text-[11px] leading-5 text-text-muted">
        Reminder nodes send a follow-up message immediately when reached. For inactivity reminders on user responses, configure reminder/timeout settings on input or menu nodes.
      </div>
    </div>
  );

  const RenderTemplateNode = () => (
    <div className="space-y-4 pt-4 border-t border-border-main">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Template Name</label>
          <input disabled={isLockedTopology} className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-mono disabled:cursor-not-allowed disabled:opacity-60" placeholder="e.g. welcome_msg" value={draftData.templateName || ""} onChange={(e) => updateData('templateName', e.target.value)} />
        </div>
        <div>
          <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Language</label>
          <input disabled={isLockedTopology} className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-mono disabled:cursor-not-allowed disabled:opacity-60" placeholder="en_US" value={draftData.language || ""} onChange={(e) => updateData('language', e.target.value)} />
        </div>
      </div>
      <div>
        <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Variables (CSV)</label>
        <textarea disabled={isLockedTopology} className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs resize-none h-16 disabled:cursor-not-allowed disabled:opacity-60" placeholder='e.g. {{name}}, {{company}}' value={draftData.variables || ""} onChange={(e) => updateData('variables', e.target.value)} />
      </div>
    </div>
  );

  const RenderMediaNode = () => (
    <div className="space-y-4 pt-4 border-t border-border-main">
      <div>
        <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Media Target</label>
        <div className="flex gap-2 mb-2">
          <input disabled={isLockedTopology} className="flex-1 border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-mono disabled:cursor-not-allowed disabled:opacity-60" placeholder="https://..." value={draftData.media_url || draftData.url || ""} onChange={(e) => updateData('media_url', e.target.value)} />
          <label className={`bg-blue-50 border border-blue-100 text-blue-600 px-3 rounded-lg text-xs font-bold flex items-center justify-center transition-all min-w-[70px] ${isLockedTopology ? "opacity-60 cursor-not-allowed" : "cursor-pointer hover:bg-blue-100"}`}>
            {isUploading ? "..." : "Upload"}
            <input type="file" accept="image/*,video/*,application/pdf" className="hidden" onChange={handleMediaUpload} disabled={isUploading || isLockedTopology} />
          </label>
        </div>
      </div>
      {RenderDelayNodeLogic()}
    </div>
  );

  const RenderAssignAgentNode = () => (
    <div className="space-y-4 pt-4 border-t border-border-main">
      <div>
        <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Global Handoff Keywords</label>
        <input
          className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isLockedTopology}
          placeholder="e.g. human, support, agent"
          value={draftData.keywords || ""}
          onChange={(e) => updateData("keywords", e.target.value)}
        />
      </div>
      <div className="rounded-lg border border-amber-100 bg-amber-50 p-3 text-[11px] leading-5 text-amber-800">
        If keywords are provided, this node can act as a global interrupt and transfer the user to a human agent from any active flow.
      </div>
    </div>
  );

  const RenderEndNode = () => (
    <div className="space-y-4 pt-4 border-t border-border-main">
      <div>
        <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Active Flow Escape Keywords</label>
        <input
          className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isLockedTopology}
          placeholder="e.g. cancel, stop, quit"
          value={draftData.keywords || ""}
          onChange={(e) => updateData("keywords", e.target.value)}
        />
      </div>
      <div className="rounded-lg border border-border-main bg-canvas p-3 text-[11px] leading-5 text-text-muted">
        End nodes now reset the current flow and keep the conversation active for future messages.
      </div>
    </div>
  );

  const RenderGotoNode = () => (
    <div className="space-y-4 pt-4 border-t border-border-main">
      <div className="flex bg-canvas p-1 rounded-xl gap-1">
        <button
          type="button"
          disabled={isLockedTopology}
          onClick={() => updateData('gotoType', 'node')}
          className={`flex-1 py-2 text-[10px] font-black uppercase rounded-lg transition-all disabled:cursor-not-allowed disabled:opacity-60 ${gotoType === 'node' ? 'bg-primary-fade text-primary border border-primary/20 shadow-sm' : 'text-text-muted'}`}
        >
          Internal Node
        </button>
        <button
          type="button"
          disabled={isLockedTopology}
          onClick={() => updateData('gotoType', 'flow')}
          className={`flex-1 py-2 text-[10px] font-black uppercase rounded-lg transition-all disabled:cursor-not-allowed disabled:opacity-60 ${gotoType === 'flow' ? 'bg-primary-fade text-primary border border-primary/20 shadow-sm' : 'text-text-muted'}`}
        >
          Bot Flow
        </button>
        <button
          type="button"
          disabled={isLockedTopology}
          onClick={() => updateData('gotoType', 'bot')}
          className={`flex-1 py-2 text-[10px] font-black uppercase rounded-lg transition-all disabled:cursor-not-allowed disabled:opacity-60 ${gotoType === 'bot' ? 'bg-primary-fade text-primary border border-primary/20 shadow-sm' : 'text-text-muted'}`}
        >
          Other Bot
        </button>
      </div>
      {gotoType === "node" ? (
        <div>
          <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">
            Target Node ID
          </label>
          <input disabled={isLockedTopology} className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-mono disabled:cursor-not-allowed disabled:opacity-60" placeholder="n_123" value={draftData.targetNode || ""} onChange={(e) => updateData('targetNode', e.target.value)} />
        </div>
      ) : null}
      {gotoType === "flow" ? (
        <>
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-[11px] leading-5 text-blue-800">
            Jump into another saved flow in this same bot. The target flow will start from its entry node.
          </div>
          <div>
            <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">
              Target Flow
            </label>
            <select
              className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-medium outline-none disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isLockedTopology}
              value={draftData.targetFlowId || ""}
              onChange={(e) => updateData('targetFlowId', e.target.value)}
            >
              <option value="">Select flow</option>
              {sameBotFlowOptions.map((flow) => (
                <option key={flow.id} value={flow.id}>
                  {flow.flow_name || flow.name || "Untitled flow"}{flow.is_default ? " (Default)" : ""}
                </option>
              ))}
            </select>
          </div>
        </>
      ) : null}
      {gotoType === "bot" ? (
        <>
          <div className="rounded-lg border border-violet-100 bg-violet-50 p-3 text-[11px] leading-5 text-violet-800">
            Transfer the conversation into another bot in the same workspace. The target bot will continue from the selected flow or its default flow.
          </div>
          <div>
            <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">
              Target Bot
            </label>
            <select
              className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-medium outline-none disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isLockedTopology}
              value={draftData.targetBotId || ""}
              onChange={(e) => {
                const nextBotId = e.target.value;
                setDraftData((prev: any) => {
                  const next = {
                    ...prev,
                    targetBotId: nextBotId,
                    targetFlowId:
                      nextBotId && String(nextBotId) === String(prev.targetBotId || "")
                        ? prev.targetFlowId || ""
                        : "",
                  };
                  draftDataRef.current = next;
                  return next;
                });
              }}
            >
              <option value="">Select bot</option>
              {botOptions
                .filter((bot) => String(bot.id) !== String(currentBotId || ""))
                .map((bot) => (
                  <option key={bot.id} value={bot.id}>
                    {bot.name || "Untitled bot"}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">
              Target Flow (Optional)
            </label>
            <select
              className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-medium outline-none disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isLockedTopology || !selectedTargetBotId}
              value={draftData.targetFlowId || ""}
              onChange={(e) => updateData('targetFlowId', e.target.value)}
            >
              <option value="">Use bot default flow</option>
              {targetBotFlowOptions.map((flow) => (
                <option key={flow.id} value={flow.id}>
                  {flow.flow_name || flow.name || "Untitled flow"}{flow.is_default ? " (Default)" : ""}
                </option>
              ))}
            </select>
          </div>
        </>
      ) : null}
    </div>
  );

  const RenderConditionNode = () => (
    <div className="space-y-4 pt-4 border-t border-border-main">
      <div>
        <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Variable to Check</label>
        <input disabled={isLockedTopology} className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-mono disabled:cursor-not-allowed disabled:opacity-60" placeholder="e.g. user_email" value={draftData.variable || ""} onChange={(e) => updateData('variable', e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Operator</label>
          <select disabled={isLockedTopology} className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs outline-none disabled:cursor-not-allowed disabled:opacity-60" value={draftData.operator || "equals"} onChange={(e) => updateData('operator', e.target.value)}>
            <option value="equals">Equals</option>
            <option value="contains">Contains</option>
            <option value="exists">Exists</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Value</label>
          <input disabled={isLockedTopology} className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs disabled:cursor-not-allowed disabled:opacity-60" placeholder="e.g. test@gmail.com" value={draftData.value || ""} onChange={(e) => updateData('value', e.target.value)} />
        </div>
      </div>
    </div>
  );

  const RenderSaveNode = () => (
    <div className="space-y-4 pt-4 border-t border-border-main">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Data Variable</label>
          <input disabled={isLockedTopology} className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-mono disabled:cursor-not-allowed disabled:opacity-60" placeholder="e.g. session_val" value={draftData.variable || ""} onChange={(e) => updateData('variable', e.target.value)} />
        </div>
        <div>
          <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Lead DB Field</label>
          <input disabled={isLockedTopology} className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-mono disabled:cursor-not-allowed disabled:opacity-60" placeholder="e.g. name, email" value={draftData.leadField || draftData.field || ""} onChange={(e) => updateData('leadField', e.target.value)} />
        </div>
      </div>
    </div>
  );

  const RenderKnowledgeLookupNode = () => (
    <div className="space-y-4 pt-4 border-t border-border-main">
      <div className="rounded-xl border border-sky-100 bg-sky-50 p-3 text-[11px] leading-5 text-sky-800">
        Search the workspace knowledge base, store the matched documents, and optionally save merged text for the next message node.
      </div>
      <div>
        <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-text-muted">Lookup Query</label>
        <textarea disabled={isLockedTopology} className="w-full rounded-lg border border-border-main bg-canvas p-2.5 text-xs font-mono resize-none h-20 disabled:cursor-not-allowed disabled:opacity-60" placeholder="Summarize the return policy for {{product_name}}" value={draftData.query || ""} onChange={(e) => updateData("query", e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-text-muted">Save Results To</label>
          <input disabled={isLockedTopology} className="w-full rounded-lg border border-border-main bg-canvas p-2.5 text-xs font-mono disabled:cursor-not-allowed disabled:opacity-60" placeholder="knowledge_results" value={draftData.saveTo || ""} onChange={(e) => updateData("saveTo", e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-text-muted">Save Text To</label>
          <input disabled={isLockedTopology} className="w-full rounded-lg border border-border-main bg-canvas p-2.5 text-xs font-mono disabled:cursor-not-allowed disabled:opacity-60" placeholder="knowledge_text" value={draftData.saveTextTo || ""} onChange={(e) => updateData("saveTextTo", e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-text-muted">Scope</label>
          <select disabled={isLockedTopology} className="w-full rounded-lg border border-border-main bg-canvas p-2.5 text-xs outline-none disabled:cursor-not-allowed disabled:opacity-60" value={draftData.scope || "project"} onChange={(e) => updateData("scope", e.target.value)}>
            <option value="project">Project</option>
            <option value="workspace">Workspace</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-text-muted">Result Limit</label>
          <input type="number" min="1" max="10" disabled={isLockedTopology} className="w-full rounded-lg border border-border-main bg-canvas p-2.5 text-xs disabled:cursor-not-allowed disabled:opacity-60" placeholder="3" value={draftData.limit || ""} onChange={(e) => updateData("limit", Number(e.target.value || 3))} />
        </div>
      </div>
    </div>
  );

  const renderSpecificNodeFields = () => {
    switch (node.type) {
      case 'message': return <RenderMessageNode />;
      case 'input': return <RenderInputNode />;
      case 'menu': return <RenderMenuNode />;
      case 'menu_button': return RenderMenuOptionsNode(4, "Button", false, false);
      case 'menu_list': return RenderMenuOptionsNode(10, "List Item", true, false);
      case 'msg_text': return <RenderMessageNode />;
      case 'send_template': return <RenderTemplateNode />;
      case 'msg_media': return <RenderMessageNode />;
      case 'ai_generate': return <RenderAiGenerateNode />;
      case 'business_hours': return <RenderBusinessHoursNode />;
      case 'split_traffic': return <RenderSplitTrafficNode />;
      case 'api': return <RenderApiNode />;
      case 'delay': return <RenderDelayNode />;
      case 'reminder': return <RenderReminderNode />;
      case 'assign_agent': return <RenderAssignAgentNode />;
      case 'end': return <RenderEndNode />;
      case 'goto': return <RenderGotoNode />;
      case 'condition': return <RenderConditionNode />;
      case 'knowledge_lookup': return <RenderKnowledgeLookupNode />;
      case 'save': return <RenderSaveNode />;
      default: return null;
    }
  };

  return (
    <div 
      className="w-full h-full bg-surface text-text-main flex flex-col relative overflow-hidden nodrag nopan" 
      onPointerDownCapture={(e) => e.stopPropagation()}
      onPointerUpCapture={(e) => e.stopPropagation()}
      onMouseDownCapture={(e) => e.stopPropagation()}
      onMouseUpCapture={(e) => e.stopPropagation()}
      onClickCapture={(e) => e.stopPropagation()}
      onKeyDownCapture={(e) => e.stopPropagation()}
      onKeyUpCapture={(e) => e.stopPropagation()}
    >
      <div className="flex-1 overflow-y-auto p-5 pb-6 custom-scrollbar">
        <div className="space-y-4 mb-4">
          <div>
            <label className="block text-[10px] font-black text-text-main uppercase tracking-widest mb-1">Node Header (Label)</label>
            <input 
              className="w-full border border-border-main bg-canvas rounded-xl p-3 text-sm font-bold text-text-main focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
              placeholder="e.g. Greeting"
              value={draftData.label || ""}
              onChange={(e) => updateData('label', e.target.value)}
            />
          </div>
            <div>
              <label className="block text-[10px] font-black text-text-main uppercase tracking-widest mb-1">
                {nodeType === "input" ? "Question Text / Notes" : "Message Text / Notes"}
              </label>
              <textarea 
                className="w-full border border-border-main bg-canvas rounded-xl p-3 text-sm min-h-[100px] text-text-main resize-none focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                placeholder={nodeType === "input" ? "e.g. What is your email address?" : "Content..."}
                value={draftData.text || ""}
                onChange={(e) => updateData('text', e.target.value)}
              />
            </div>
        </div>
        {renderSpecificNodeFields()}
      </div>
      <div className="w-full p-4 border-t border-border-main bg-surface shrink-0 shadow-[0_-10px_20px_-5px_rgba(0,0,0,0.05)] z-10">
        <button
          type="button"
          onClick={handleSaveAndCloseClick}
          className="w-full bg-slate-900 text-white py-3 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-black transition-all shadow-lg active:scale-95"
        >
          Save & Close
        </button>
      </div>
    </div>
  );
}

