import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, MouseEvent } from "react";
import type { Node } from "reactflow";
import { BrainCircuit, Bot, Clock, Headset, LayoutTemplate, Link, List, MessageSquare, Play, RotateCcw, Split, Timer, Plus, Trash2 } from "lucide-react";

import apiClient from "../../services/apiClient";
import { botService } from "../../services/botService";
import { leadFormService } from "../../services/leadFormService";
import { flowService } from "../../services/flowService";
import { notifyApiError } from "../../services/apiError";
import { notify } from "../../store/uiStore";
import ExtractionPreview from "./ExtractionPreview";

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
  onSaveAndClose?: (data: any) => boolean | Promise<boolean>;
  onClose: () => void;
  isReadOnly?: boolean;
  permissionsReady?: boolean;
  canEditWorkflow?: boolean;
  isSaving?: boolean;
  currentBotId?: string;
  currentWorkspaceId?: string;
  currentProjectId?: string;
  currentFlowId?: string | null;
  isSystemFlow?: boolean;
  flowOptions?: Array<{ id: string; flow_name?: string; name?: string; is_default?: boolean }>;
  botOptions?: Array<{ id: string; name?: string }>;
  flowOptionsByBot?: Record<string, Array<{ id: string; flow_name?: string; name?: string; is_default?: boolean }>>;
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

function canonicalType(type: any) {
  return String(type || "").trim().toLowerCase();
}

function inferValidationForLeadField(fieldType?: string, fieldKey?: string) {
  const normalizedType = String(fieldType || "").trim().toLowerCase();
  const normalizedKey = String(fieldKey || "").trim().toLowerCase();
  if (normalizedType === "email" || normalizedKey === "email") return "email";
  if (normalizedType === "phone" || normalizedKey === "phone") return "phone";
  if (normalizedType === "number") return "number";
  if (normalizedType === "date") return "date";
  return "text";
}

function parseJsonObject(value: any) {
  if (!value) {
    return {};
  }

  if (typeof value === "object" && !Array.isArray(value)) {
    return value;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  return {};
}

function stringifyJsonObject(value: any) {
  return JSON.stringify(parseJsonObject(value), null, 2);
}

function normalizeIntentHandle(value: any) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeIntentList(intents: any[]) {
  const seen = new Set<string>();
  return (Array.isArray(intents) ? intents : [])
    .map((intent, index) => {
      const handle = normalizeIntentHandle(intent?.handle || intent?.value || `intent_${index + 1}`);
      if (!handle || seen.has(handle)) {
        return null;
      }
      seen.add(handle);
      return {
        handle,
        label: String(intent?.label || intent?.name || handle).trim(),
        description: String(intent?.description || intent?.prompt || "").trim(),
      };
    })
    .filter(Boolean);
}

function normalizeExtractionFieldList(fields: any[]): Array<{ key: string; type: string; description: string }> {
  const seen = new Set<string>();
  return (Array.isArray(fields) ? fields : [])
    .map((field, index) => {
      const key = String(field?.key || field?.name || `field_${index + 1}`).trim();
      if (!key) {
        return null;
      }
      const normalizedKey = key.toLowerCase();
      if (seen.has(normalizedKey)) {
        return null;
      }
      seen.add(normalizedKey);
      return {
        key,
        type: String(field?.type || "string").trim().toLowerCase() || "string",
        description: String(field?.description || field?.prompt || "").trim(),
      };
    })
    .filter(Boolean) as Array<{ key: string; type: string; description: string }>;
}

function getNodeEditorMeta(type: string) {
  const normalizedType = canonicalType(type);
  const fallbackLabel = normalizedType
    ? normalizedType.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ")
    : "Node";

  switch (normalizedType) {
    case "message":
      return { title: "Message", description: "Send text or media to the user." };
    case "send_template":
      return { title: "Send Template", description: "Send a pre-approved WhatsApp template." };
    case "input":
      return { title: "Input", description: "Ask for a response and validate the answer." };
    case "menu":
      return { title: "Menu", description: "Let the user choose from a set of options." };
    case "condition":
      return { title: "Condition", description: "Route users based on a rule or variable." };
    case "split_traffic":
      return { title: "Split Traffic", description: "Randomly split traffic for A/B testing." };
    case "business_hours":
      return { title: "Business Hours", description: "Route based on the current schedule." };
    case "goto":
      return { title: "Go To", description: "Jump to another node, flow, or bot." };
    case "delay":
      return { title: "Delay", description: "Pause before the next step runs." };
    case "api":
      return { title: "API Request", description: "Call an external API and store the response." };
    case "ai_generate":
      return { title: "AI Generate", description: "Use an LLM to create a response or output." };
    case "ai_intent":
      return { title: "AI Intent", description: "Classify a user message into a routing branch." };
    case "ai_extract":
      return { title: "AI Extract", description: "Extract structured variables from user text." };
    case "knowledge_lookup":
      return { title: "Knowledge Lookup", description: "Search workspace knowledge for relevant answers." };
    case "save":
      return { title: "Save Data", description: "Write captured values back to the lead or workflow." };
    case "assign_agent":
      return { title: "Assign Agent", description: "Hand the conversation off to a human agent." };
    case "start":
      return { title: "Start", description: "Permanent entry point for the flow." };
    case "end":
      return { title: "End", description: "Close the flow and finish the session." };
    case "trigger":
      return { title: "Trigger Entry", description: "Start the flow from a keyword or external event." };
    case "resume_bot":
      return { title: "Resume Bot", description: "Wake the bot back up after a pause or handoff." };
    default:
      return { title: fallbackLabel, description: "Configure this node's behavior." };
  }
}

export default function NodeEditor({
  node,
  onSaveAndClose,
  onClose,
  isReadOnly = false,
  permissionsReady = true,
  canEditWorkflow = true,
  currentBotId,
  currentWorkspaceId,
  currentProjectId,
  currentFlowId,
  isSystemFlow = false,
  flowOptions = [],
  botOptions = [],
  flowOptionsByBot = {},
  leadForms = [],
}: NodeEditorProps) {
  const [draftData, setDraftData] = useState<any>(node?.data || {});
  const draftDataRef = useRef<any>(node?.data || {});
  const [isUploading, setIsUploading] = useState(false);
  const [resolvedLeadForms, setResolvedLeadForms] = useState<LeadFormOption[]>(leadForms as LeadFormOption[]);
  const [hasFetchedLeadForms, setHasFetchedLeadForms] = useState(false);
  const [isLoadingLeadForms, setIsLoadingLeadForms] = useState(false);
  const [leadFormsError, setLeadFormsError] = useState("");
  const [testInput, setTestInput] = useState("");
  const [isTestingExtraction, setIsTestingExtraction] = useState(false);
  const [extractionPreview, setExtractionPreview] = useState<any>(null);
  const [suggestingFieldKey, setSuggestingFieldKey] = useState("");

  const nodeType = canonicalType(node?.type);
  const isReadOnlyMode = Boolean(isReadOnly);
  const isLockedTopology = Boolean(isSystemFlow || isReadOnlyMode || !permissionsReady || !canEditWorkflow);
  const saveDisabledReason = !permissionsReady
    ? "Loading workspace permissions..."
    : isReadOnlyMode
      ? "Workspace is read-only."
      : !canEditWorkflow
        ? "You do not have permission to edit this workflow."
        : "";

  const resolveLeadFormCandidateKey = (rawData: any) =>
    String(rawData?.linkedFieldKey || rawData?.leadField || rawData?.field || rawData?.variable || "").trim();

  const resolveLeadFormIdFromFieldKey = (fieldKey: string) => {
    const normalizedFieldKey = String(fieldKey || "").trim();
    if (!normalizedFieldKey) return "";
    const matchingForm = resolvedLeadForms.find((form) =>
      Array.isArray(form.fields)
        ? form.fields.some((field) => String(field.fieldKey || "").trim() === normalizedFieldKey)
        : false
    );
    if (matchingForm?.id) return String(matchingForm.id).trim();
    if (resolvedLeadForms.length === 1 && resolvedLeadForms[0]?.id) return String(resolvedLeadForms[0].id).trim();
    return "";
  };

  const normalizeDraftData = (rawData: any) => {
    const next = { ...(rawData || {}) };
    if (nodeType === "input") {
      const leadFormId = String(next.linkedFormId || next.leadFormId || next.formId || next.lead_form_id || "").trim();
      const fieldKey = resolveLeadFormCandidateKey(next);
      const inferredLeadFormId = leadFormId || resolveLeadFormIdFromFieldKey(fieldKey);
      if (inferredLeadFormId) {
        next.linkedFormId = inferredLeadFormId;
        next.leadFormId = inferredLeadFormId;
        next.formId = inferredLeadFormId;
        next.lead_form_id = inferredLeadFormId;
      }
      if (fieldKey) {
        next.linkedFieldKey = fieldKey;
        next.leadField = fieldKey;
        next.field = fieldKey;
        if (!String(next.variable || "").trim()) {
          next.variable = fieldKey;
        }
      }
      if (!String(next.validation || "").trim()) {
        next.validation = "text";
      }
      next.maxRetries = Number.isFinite(Number(next.maxRetries)) ? Number(next.maxRetries) : 3;
      next.timeout = Number.isFinite(Number(next.timeout)) ? Number(next.timeout) : 900;
      next.reminderDelay = Number.isFinite(Number(next.reminderDelay)) ? Number(next.reminderDelay) : 300;
      next.onInvalidMessage = String(next.onInvalidMessage || next.invalidMessage || "").trim();
      next.reminderText = String(next.reminderText || "").trim();
      next.timeoutFallback = String(next.timeoutFallback || "").trim();
      next.linkLeadForm = Boolean(next.linkLeadForm || next.linkedFormId || next.leadFormId || next.formId || next.lead_form_id);
    }
    if (nodeType === "api") {
      next.method = String(next.method || "GET").trim().toUpperCase() || "GET";
      next.url = String(next.url || next.endpoint || next.apiUrl || "").trim();
      next.saveTo = String(next.saveTo || next.save_to || "api_response").trim() || "api_response";
      next.responsePath = String(next.responsePath || next.response_path || "").trim();
      next.headers = stringifyJsonObject(next.headers);
      next.body = typeof next.body === "string" ? next.body : stringifyJsonObject(next.body);
    }
    if (nodeType === "ai_generate") {
      next.provider = String(next.provider || "auto").trim().toLowerCase() || "auto";
      next.model = String(next.model || "").trim();
      next.prompt = String(next.prompt || next.text || "").trim();
      next.systemPrompt = String(next.systemPrompt || next.instructions || "").trim();
      next.style = String(next.style || next.tone || "").trim();
      next.saveTo = String(next.saveTo || next.outputVariable || "ai_output").trim() || "ai_output";
    }
    if (nodeType === "ai_intent") {
      next.provider = String(next.provider || "auto").trim().toLowerCase() || "auto";
      next.model = String(next.model || "").trim();
      next.prompt = String(next.prompt || next.systemPrompt || next.instructions || "").trim();
      next.text = String(next.text || "Thinking...").trim();
      next.saveTo = String(next.saveTo || next.outputVariable || "detected_intent").trim() || "detected_intent";
      next.fallback = normalizeIntentHandle(next.fallback || next.fallbackHandle || "fallback") || "fallback";
      next.intents = normalizeIntentList(next.intents);
    }
    if (nodeType === "ai_extract") {
      next.provider = String(next.provider || "auto").trim().toLowerCase() || "auto";
      next.model = String(next.model || "").trim();
      next.prompt = String(next.prompt || next.systemPrompt || next.instructions || "").trim();
      next.text = String(next.text || "Updating...").trim();
      next.minConfidence = Number.isFinite(Number(next.minConfidence)) ? Number(next.minConfidence) : 0.7;
      next.onIncomplete = String(next.onIncomplete || "incomplete").trim().toLowerCase() || "incomplete";
      next.saveConfidenceTo = String(next.saveConfidenceTo || next.confidenceVariable || "").trim();
      next.requiredFields = normalizeExtractionFieldList(next.requiredFields);
      next.optionalFields = normalizeExtractionFieldList(next.optionalFields);
      next.fields = normalizeExtractionFieldList(next.fields);
      if (!next.fields.length) {
        next.fields = normalizeExtractionFieldList([...next.requiredFields, ...next.optionalFields]);
      }
      if (!next.requiredFields.length && next.fields.length) {
        next.requiredFields = [...next.fields];
      }
    }
    if (nodeType === "knowledge_lookup") {
      next.query = String(next.query || next.prompt || next.search || "").trim();
      next.scope = String(next.scope || "project").trim().toLowerCase() || "project";
      next.limit = Number.isFinite(Number(next.limit)) ? Number(next.limit) : 3;
      next.saveTo = String(next.saveTo || "knowledge_results").trim() || "knowledge_results";
      next.saveTextTo = String(next.saveTextTo || "").trim();
    }
    if (nodeType === "save") {
      next.variable = String(next.variable || next.field || next.leadField || next.targetVariable || "").trim();
      next.value = next.value ?? "";
      next.leadStatus = String(next.leadStatus || next.status || "").trim().toLowerCase();
    }
    if (nodeType === "send_template") {
      next.templateName = String(next.templateName || next.template_name || next.templateId || next.metaTemplateId || "").trim();
      next.language = String(next.language || next.languageCode || "en_US").trim() || "en_US";
      next.templateVariableValues = stringifyJsonObject(next.templateVariableValues || next.templateVariables || {});
    }
    return next;
  };

  const updateData = (key: string, value: any) => {
    setDraftData((prev: any) => {
      const next = { ...prev, [key]: value };
      draftDataRef.current = next;
      return next;
    });
  };

  const selectedLeadFormId = String(
    draftData.linkedFormId || draftData.leadFormId || draftData.formId || draftData.lead_form_id || ""
  ).trim();
  const candidateLeadFieldKey = resolveLeadFormCandidateKey(draftData);
  const inferredSelectedLeadFormId = selectedLeadFormId || resolveLeadFormIdFromFieldKey(candidateLeadFieldKey);
  const selectedLeadForm = resolvedLeadForms.find((form) => String(form.id) === inferredSelectedLeadFormId) || null;
  const selectedLeadFormFields = Array.isArray(selectedLeadForm?.fields)
    ? [...selectedLeadForm.fields].sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0))
    : [];
  const showLeadFormSelectors =
    Boolean(inferredSelectedLeadFormId) || isLoadingLeadForms || Boolean(leadFormsError) || resolvedLeadForms.length > 0;
  const sameBotFlowOptions = flowOptions.filter((flow) => String(flow.id) !== String(currentFlowId || ""));
  const selectedTargetBotId = String(draftData.targetBotId || "").trim();
  const targetBotFlowOptions = selectedTargetBotId ? flowOptionsByBot[selectedTargetBotId] || [] : [];
  const gotoType = String(draftData.gotoType || "node").trim().toLowerCase();
  const inputLinkLeadForm = Boolean(
    draftData.linkLeadForm ||
      draftData.linkedFormId ||
      draftData.leadFormId ||
      draftData.formId ||
      draftData.lead_form_id ||
      draftData.linkedFieldKey ||
      draftData.leadField ||
      draftData.field
  );

  useEffect(() => {
    const nextDraft = normalizeDraftData(node?.data || {});
    setDraftData(nextDraft);
    draftDataRef.current = nextDraft;
  }, [node?.id, JSON.stringify(node?.data || {})]);

  useEffect(() => {
    draftDataRef.current = draftData;
  }, [draftData]);

  useEffect(() => {
    setResolvedLeadForms(Array.isArray(leadForms) ? (leadForms as LeadFormOption[]) : []);
    if (Array.isArray(leadForms) && leadForms.length > 0) {
      setHasFetchedLeadForms(true);
      setLeadFormsError("");
      setIsLoadingLeadForms(false);
    }
  }, [leadForms]);

  useEffect(() => {
    setResolvedLeadForms(Array.isArray(leadForms) ? (leadForms as LeadFormOption[]) : []);
    setHasFetchedLeadForms(false);
    setLeadFormsError("");
    setIsLoadingLeadForms(false);
  }, [currentBotId, currentWorkspaceId, currentProjectId]);

  useEffect(() => {
    if ((!currentBotId && !currentWorkspaceId) || hasFetchedLeadForms) return;
    let cancelled = false;

    const unwrapLeadFormPayload = (payload: unknown): LeadFormOption[] => {
      if (Array.isArray(payload)) return payload as LeadFormOption[];
      if (payload && typeof payload === "object") {
        const objectPayload = payload as Record<string, unknown>;
        if (Array.isArray(objectPayload.data)) return objectPayload.data as LeadFormOption[];
        if (Array.isArray(objectPayload.items)) return objectPayload.items as LeadFormOption[];
      }
      return [];
    };

    const loadLeadForms = async () => {
      try {
        setIsLoadingLeadForms(true);
        setLeadFormsError("");
        let workspaceId = String(currentWorkspaceId || "").trim();
        let projectId = String(currentProjectId || "").trim();

        if (!workspaceId && currentBotId) {
          const bot = await botService.getBot(currentBotId);
          workspaceId = String(bot?.workspace_id || workspaceId || "").trim();
          projectId = String(currentProjectId || bot?.project_id || "").trim();
        }

        if (!workspaceId || cancelled) {
          if (!cancelled) {
            setHasFetchedLeadForms(true);
            setIsLoadingLeadForms(false);
          }
          return;
        }

        const rows = await leadFormService.list(workspaceId, projectId || undefined);
        if (!cancelled) {
          setResolvedLeadForms(unwrapLeadFormPayload(rows));
          setHasFetchedLeadForms(true);
          setIsLoadingLeadForms(false);
        }
      } catch (error) {
        console.error("Failed to hydrate lead forms in node editor:", error);
        if (!cancelled) {
          const contextMessage = `Failed to load lead forms for workspace ${currentWorkspaceId || "unknown"}${currentProjectId ? ` / project ${currentProjectId}` : ""}.`;
          const apiError = notifyApiError(error, contextMessage, "Lead Forms Unavailable");
          setLeadFormsError(apiError.message);
          setIsLoadingLeadForms(false);
          setHasFetchedLeadForms(true);
        }
      }
    };

    loadLeadForms();
    return () => {
      cancelled = true;
    };
  }, [currentBotId, currentWorkspaceId, currentProjectId, hasFetchedLeadForms]);

  useEffect(() => {
    if (nodeType !== "ai_extract") {
      setTestInput("");
      setExtractionPreview(null);
      setSuggestingFieldKey("");
      setIsTestingExtraction(false);
    }
  }, [nodeType, node?.id]);

  const handleMediaUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      let fileToUpload = file;
      if (file.type.startsWith("image/")) {
        fileToUpload = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = (event) => {
            const img = new Image();
            img.src = event.target?.result as string;
            img.onload = () => {
              const canvas = document.createElement("canvas");
              const MAX_WIDTH = 1024;
              let width = img.width;
              let height = img.height;
              if (width > MAX_WIDTH) {
                height = Math.round((height * MAX_WIDTH) / width);
                width = MAX_WIDTH;
              }
              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext("2d");
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
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (response.data?.url) updateData("media_url", response.data.url);
    } catch (error) {
      console.error("Upload failed", error);
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  const validateDraft = (type: string, draft: any) => {
    switch (String(type || "").trim().toLowerCase()) {
      case "message":
        return String(draft.text || "").trim() ? "" : "Message needs text.";
      case "input":
        return String(draft.variable || "").trim() ? "" : "Input needs a variable name.";
      case "menu": {
        const hasOption = Array.from({ length: 10 }, (_, index) => index + 1).some((num) => Boolean(String(draft[`item${num}`] || "").trim()));
        return hasOption ? "" : "Menu needs at least one option.";
      }
      case "send_template":
        return String(draft.templateId || draft.metaTemplateId || draft.templateName || "").trim() ? "" : "Choose a Meta template.";
      case "api":
        return String(draft.url || "").trim() ? "" : "API needs URL.";
      case "ai_intent": {
        const rawIntents = Array.isArray(draft.intents) ? draft.intents : [];
        const handles = rawIntents
          .map((intent: any, index: number) => normalizeIntentHandle(intent?.handle || intent?.value || `intent_${index + 1}`))
          .filter(Boolean);
        if (!String(draft.prompt || "").trim()) {
          return "AI intent needs a classifier prompt.";
        }
        if (!String(draft.fallback || "").trim()) {
          return "AI intent needs a fallback handle.";
        }
        if (handles.length === 0) {
          return "AI intent needs at least one intent branch.";
        }
        if (new Set(handles).size !== handles.length) {
          return "AI intent handles must be unique.";
        }
        return "";
      }
      case "ai_extract": {
        const requiredFields = Array.isArray(draft.requiredFields) && draft.requiredFields.length
          ? draft.requiredFields
          : Array.isArray(draft.fields)
            ? draft.fields
            : [];
        const optionalFields = Array.isArray(draft.optionalFields) ? draft.optionalFields : [];
        const allFields = [...requiredFields, ...optionalFields];
        const keys = allFields
          .map((field: any, index: number) =>
            String(field?.key || field?.name || `field_${index + 1}`).trim()
          )
          .filter(Boolean);
        if (!String(draft.prompt || "").trim()) {
          return "AI extract needs a prompt.";
        }
        if (allFields.length === 0) {
          return "AI extract needs at least one field.";
        }
        if (new Set(keys.map((key) => key.toLowerCase())).size !== keys.length) {
          return "AI extract field keys must be unique.";
        }
        if (!String(draft.onIncomplete || "").trim()) {
          return "AI extract needs an incomplete handle.";
        }
        return "";
      }
      default:
        return "";
    }
  };

  const handleSaveAndCloseClick = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const latestDraft = normalizeDraftData({ ...draftDataRef.current, ...draftData });
    const validationMessage = validateDraft(nodeType, latestDraft);
    if (validationMessage) {
      notify(validationMessage, "error");
      return;
    }

    draftDataRef.current = latestDraft;
    setDraftData(latestDraft);

    try {
      const maybeResult = onSaveAndClose?.(latestDraft);
      onClose();
      void Promise.resolve(maybeResult).catch((error) => {
        notifyApiError(error, "Could not save node changes.", "Node Save Failed");
      });
    } catch (error) {
      notifyApiError(error, "Could not save node changes.", "Node Save Failed");
    }
  };

  const renderSpecificNodeFields = () => {
    switch (nodeType) {
      case "start":
      case "end":
        return null;
      case "message":
        return (
          <div className="space-y-4 pt-4 border-t border-border-main">
            <div>
              <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Message Type</label>
              <select disabled={isLockedTopology} className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-medium outline-none disabled:cursor-not-allowed disabled:opacity-60" value={String(draftData.messageType || draftData.contentType || "text").trim().toLowerCase()} onChange={(e) => updateData("messageType", e.target.value)}>
                <option value="text">Text</option>
                <option value="image">Image</option>
                <option value="video">Video</option>
                <option value="audio">Audio</option>
                <option value="document">File / Document</option>
              </select>
            </div>
            {String(draftData.messageType || draftData.contentType || "text").trim().toLowerCase() !== "text" ? (
              <div>
                <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Media URL</label>
                <div className="flex gap-2 mb-2">
                  <input disabled={isLockedTopology} className="flex-1 border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-mono disabled:cursor-not-allowed disabled:opacity-60" placeholder="https://..." value={draftData.media_url || draftData.url || ""} onChange={(e) => updateData("media_url", e.target.value)} />
                  <label className={`bg-blue-50 border border-blue-100 text-blue-600 px-3 rounded-lg text-xs font-bold flex items-center justify-center transition-all min-w-[70px] ${isLockedTopology ? "opacity-60 cursor-not-allowed" : "cursor-pointer hover:bg-blue-100"}`}>
                    {isUploading ? "..." : "Upload"}
                    <input type="file" accept="image/*,video/*,audio/*,application/pdf" className="hidden" onChange={handleMediaUpload} disabled={isUploading || isLockedTopology} />
                  </label>
                </div>
              </div>
            ) : null}
          </div>
        );
      case "input":
        return (
          <div className="space-y-4 pt-4 border-t border-border-main">
            <div>
              <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Validation Type</label>
              <select disabled={isLockedTopology} className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-medium outline-none disabled:cursor-not-allowed disabled:opacity-60" value={draftData.validation || "text"} onChange={(e) => updateData("validation", e.target.value)}>
                <option value="text">Text / Any</option>
                <option value="email">Email</option>
                <option value="phone">Phone Number</option>
                <option value="number">Numeric</option>
                <option value="date">Date</option>
                <option value="regex">Custom Regex</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Variable Name</label>
              <input disabled={isLockedTopology} className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-mono disabled:cursor-not-allowed disabled:opacity-60" placeholder="e.g. user_email" value={draftData.variable || ""} onChange={(e) => updateData("variable", e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-text-muted">
              <input
                type="checkbox"
                disabled={isLockedTopology}
                checked={Boolean(inputLinkLeadForm)}
                onChange={(e) => updateData("linkLeadForm", e.target.checked)}
              />
              Link to lead form
            </label>
            {inputLinkLeadForm ? (
              <div className="space-y-3 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
                {showLeadFormSelectors ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-text-muted mb-1">Lead Form</label>
                      <select
                        disabled={isLockedTopology}
                        className="w-full rounded-lg border border-border-main bg-canvas p-2.5 text-xs outline-none disabled:cursor-not-allowed disabled:opacity-60"
                        value={selectedLeadFormId}
                        onChange={(e) => updateData("linkedFormId", e.target.value)}
                      >
                        <option value="">Select form</option>
                        {resolvedLeadForms.map((form) => (
                          <option key={form.id} value={form.id}>
                            {form.name || form.id}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-text-muted mb-1">Field</label>
                      <select
                        disabled={isLockedTopology || selectedLeadFormFields.length === 0}
                        className="w-full rounded-lg border border-border-main bg-canvas p-2.5 text-xs outline-none disabled:cursor-not-allowed disabled:opacity-60"
                        value={candidateLeadFieldKey}
                        onChange={(e) => {
                          const nextFieldKey = e.target.value;
                          const nextField = selectedLeadFormFields.find((field) => String(field.fieldKey || "").trim() === nextFieldKey);
                          updateData("linkedFieldKey", nextFieldKey);
                          updateData("leadField", nextFieldKey);
                          updateData("field", nextFieldKey);
                          if (!String(draftData.variable || "").trim()) {
                            updateData("variable", nextFieldKey);
                          }
                          const inferredValidation = inferValidationForLeadField(nextField?.fieldType, nextFieldKey);
                          if (!String(draftData.validation || "").trim() || draftData.validation === "text") {
                            updateData("validation", inferredValidation);
                          }
                        }}
                      >
                        <option value="">Select field</option>
                        {selectedLeadFormFields.map((field) => (
                          <option key={field.fieldKey} value={field.fieldKey}>
                            {field.questionLabel || field.fieldKey}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ) : (
                  <p className="text-[10px] font-semibold text-emerald-700">Enable the toggle to link this input to a lead form field.</p>
                )}
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Retry Limit</label>
                <input disabled={isLockedTopology} type="number" min="1" className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-mono disabled:cursor-not-allowed disabled:opacity-60" value={draftData.maxRetries ?? 3} onChange={(e) => updateData("maxRetries", Number(e.target.value || 0))} />
              </div>
              <div>
                <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Invalid Message</label>
                <input disabled={isLockedTopology} className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs disabled:cursor-not-allowed disabled:opacity-60" placeholder="Please try again." value={draftData.onInvalidMessage || ""} onChange={(e) => updateData("onInvalidMessage", e.target.value)} />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Reminder Time (sec)</label>
              <input disabled={isLockedTopology} type="number" min="0" className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-mono disabled:cursor-not-allowed disabled:opacity-60" value={draftData.reminderDelay ?? 300} onChange={(e) => updateData("reminderDelay", Number(e.target.value || 0))} />
            </div>
            <div>
              <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Reminder Message</label>
              <textarea disabled={isLockedTopology} className="w-full rounded-lg border border-border-main bg-canvas p-2.5 text-xs resize-none h-20 disabled:cursor-not-allowed disabled:opacity-60" placeholder="Just checking in. Reply when you're ready." value={draftData.reminderText || ""} onChange={(e) => updateData("reminderText", e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Timeout Timer (sec)</label>
                <input disabled={isLockedTopology} type="number" min="0" className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-mono disabled:cursor-not-allowed disabled:opacity-60" value={draftData.timeout ?? 900} onChange={(e) => updateData("timeout", Number(e.target.value || 0))} />
              </div>
              <div>
                <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Timeout Fallback</label>
                <textarea disabled={isLockedTopology} className="w-full rounded-lg border border-border-main bg-canvas p-2.5 text-xs resize-none h-[74px] disabled:cursor-not-allowed disabled:opacity-60" placeholder="Let's continue later." value={draftData.timeoutFallback || ""} onChange={(e) => updateData("timeoutFallback", e.target.value)} />
              </div>
            </div>
          </div>
        );
      case "menu":
        return (
          <div className="space-y-4 pt-4 border-t border-border-main">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Button Text</label>
                <input className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-medium" placeholder="View Options" value={draftData.buttonText || ""} onChange={(e) => updateData("buttonText", e.target.value)} disabled={isLockedTopology} />
              </div>
              <div>
                <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Section Title</label>
                <input className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-medium" placeholder="Options" value={draftData.sectionTitle || ""} onChange={(e) => updateData("sectionTitle", e.target.value)} disabled={isLockedTopology} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Reminder Time (sec)</label>
                <input disabled={isLockedTopology} type="number" min="0" className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-mono disabled:cursor-not-allowed disabled:opacity-60" value={draftData.reminderDelay ?? 300} onChange={(e) => updateData("reminderDelay", Number(e.target.value || 0))} />
              </div>
              <div>
                <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Timeout Timer (sec)</label>
                <input disabled={isLockedTopology} type="number" min="0" className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-mono disabled:cursor-not-allowed disabled:opacity-60" value={draftData.timeout ?? 900} onChange={(e) => updateData("timeout", Number(e.target.value || 0))} />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Reminder Message</label>
              <textarea disabled={isLockedTopology} className="w-full rounded-lg border border-border-main bg-canvas p-2.5 text-xs resize-none h-20 disabled:cursor-not-allowed disabled:opacity-60" placeholder="Just checking in. Reply when you're ready." value={draftData.reminderText || ""} onChange={(e) => updateData("reminderText", e.target.value)} />
            </div>
            <div>
              <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Timeout Fallback</label>
              <textarea disabled={isLockedTopology} className="w-full rounded-lg border border-border-main bg-canvas p-2.5 text-xs resize-none h-[74px] disabled:cursor-not-allowed disabled:opacity-60" placeholder="Let's continue later." value={draftData.timeoutFallback || ""} onChange={(e) => updateData("timeoutFallback", e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest">Options (Max 10)</label>
              {Array.from({ length: 10 }).map((_, index) => {
                const num = index + 1;
                return (
                  <input
                    key={num}
                    className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-medium text-text-main focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                    placeholder={`Option ${num}`}
                    value={draftData[`item${num}`] || ""}
                    onChange={(e) => updateData(`item${num}`, e.target.value)}
                    disabled={isLockedTopology}
                  />
                );
              })}
            </div>
          </div>
        );
      case "condition":
        return (
          <div className="space-y-4 pt-4 border-t border-border-main">
            <div>
              <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Variable to Check</label>
              <input disabled={isLockedTopology} className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-mono disabled:cursor-not-allowed disabled:opacity-60" placeholder="e.g. user_email" value={draftData.variable || ""} onChange={(e) => updateData("variable", e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Operator</label>
                <select disabled={isLockedTopology} className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs outline-none disabled:cursor-not-allowed disabled:opacity-60" value={draftData.operator || "equals"} onChange={(e) => updateData("operator", e.target.value)}>
                  <option value="equals">Equals</option>
                  <option value="contains">Contains</option>
                  <option value="not_equals">Not Equals</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Value</label>
                <input disabled={isLockedTopology} className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs disabled:cursor-not-allowed disabled:opacity-60" placeholder="e.g. test@gmail.com" value={draftData.value || ""} onChange={(e) => updateData("value", e.target.value)} />
              </div>
            </div>
          </div>
        );
      case "split_traffic":
        return (
          <div className="space-y-4 pt-4 border-t border-border-main">
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
          </div>
        );
      case "business_hours":
        return (
          <div className="space-y-4 pt-4 border-t border-border-main">
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
          </div>
        );
      case "goto":
        return (
          <div className="space-y-4 pt-4 border-t border-border-main">
            <div className="flex bg-canvas p-1 rounded-xl gap-1">
              {[
                { key: "node", label: "Internal Node" },
                { key: "flow", label: "Bot Flow" },
                { key: "bot", label: "Other Bot" },
              ].map((item) => (
                <button key={item.key} type="button" disabled={isLockedTopology} onClick={() => updateData("gotoType", item.key)} className={`flex-1 py-2 text-[10px] font-black uppercase rounded-lg transition-all disabled:cursor-not-allowed disabled:opacity-60 ${gotoType === item.key ? "bg-primary-fade text-primary border border-primary/20 shadow-sm" : "text-text-muted"}`}>
                  {item.label}
                </button>
              ))}
            </div>
            {gotoType === "node" ? <input disabled={isLockedTopology} className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-mono disabled:cursor-not-allowed disabled:opacity-60" placeholder="n_123" value={draftData.targetNode || ""} onChange={(e) => updateData("targetNode", e.target.value)} /> : null}
            {gotoType === "flow" ? (
              <select className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-medium outline-none disabled:cursor-not-allowed disabled:opacity-60" disabled={isLockedTopology} value={draftData.targetFlowId || ""} onChange={(e) => updateData("targetFlowId", e.target.value)}>
                <option value="">Select flow</option>
                {sameBotFlowOptions.map((flow) => (
                  <option key={flow.id} value={flow.id}>{flow.flow_name || flow.name || "Untitled flow"}{flow.is_default ? " (Default)" : ""}</option>
                ))}
              </select>
            ) : null}
            {gotoType === "bot" ? (
              <div className="grid grid-cols-2 gap-4">
                <select className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-medium outline-none disabled:cursor-not-allowed disabled:opacity-60" disabled={isLockedTopology} value={draftData.targetBotId || ""} onChange={(e) => updateData("targetBotId", e.target.value)}>
                  <option value="">Select bot</option>
                  {botOptions.filter((bot) => String(bot.id) !== String(currentBotId || "")).map((bot) => (
                    <option key={bot.id} value={bot.id}>{bot.name || "Untitled bot"}</option>
                  ))}
                </select>
                <select className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-medium outline-none disabled:cursor-not-allowed disabled:opacity-60" disabled={isLockedTopology || !selectedTargetBotId} value={draftData.targetFlowId || ""} onChange={(e) => updateData("targetFlowId", e.target.value)}>
                  <option value="">Use bot default flow</option>
                  {targetBotFlowOptions.map((flow) => (
                    <option key={flow.id} value={flow.id}>{flow.flow_name || flow.name || "Untitled flow"}{flow.is_default ? " (Default)" : ""}</option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
        );
      case "api":
        return (
          <div className="space-y-4 pt-4 border-t border-border-main">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Method</label>
                <select disabled={isLockedTopology} className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs outline-none disabled:cursor-not-allowed disabled:opacity-60" value={draftData.method || "GET"} onChange={(e) => updateData("method", e.target.value)}>
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Timeout (ms)</label>
                <input type="number" min="0" step="100" disabled={isLockedTopology} className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs disabled:cursor-not-allowed disabled:opacity-60" placeholder="10000" value={draftData.timeoutMs || ""} onChange={(e) => updateData("timeoutMs", Number(e.target.value || 0))} />
              </div>
            </div>
            <input disabled={isLockedTopology} className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-mono disabled:cursor-not-allowed disabled:opacity-60" placeholder="https://api.example.com/orders" value={draftData.url || ""} onChange={(e) => updateData("url", e.target.value)} />
            <div>
              <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Save Response To</label>
              <input disabled={isLockedTopology} className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-mono disabled:cursor-not-allowed disabled:opacity-60" placeholder="api_response" value={draftData.saveTo || ""} onChange={(e) => updateData("saveTo", e.target.value)} />
            </div>
            <div>
              <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Response Path</label>
              <input disabled={isLockedTopology} className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-mono disabled:cursor-not-allowed disabled:opacity-60" placeholder="data.user.name" value={draftData.responsePath || ""} onChange={(e) => updateData("responsePath", e.target.value)} />
            </div>
            <div>
              <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Headers JSON</label>
              <textarea disabled={isLockedTopology} className="w-full rounded-lg border border-border-main bg-canvas p-2.5 text-xs font-mono resize-none h-24 disabled:cursor-not-allowed disabled:opacity-60" placeholder='{"Authorization":"Bearer ..."}' value={draftData.headers || ""} onChange={(e) => updateData("headers", e.target.value)} />
            </div>
            <div>
              <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Body JSON</label>
              <textarea disabled={isLockedTopology} className="w-full rounded-lg border border-border-main bg-canvas p-2.5 text-xs font-mono resize-none h-28 disabled:cursor-not-allowed disabled:opacity-60" placeholder='{"id":"{{order_id}}"}' value={draftData.body || ""} onChange={(e) => updateData("body", e.target.value)} />
            </div>
          </div>
        );
      case "ai_generate":
        return (
          <div className="space-y-4 pt-4 border-t border-border-main">
            <div className="rounded-xl border border-sky-100 bg-sky-50 p-3 text-[11px] leading-5 text-sky-800 flex items-start gap-2">
              <BrainCircuit size={12} className="mt-0.5 shrink-0" />
              <span>Prompt a configured AI provider and save the generated answer into a variable for downstream nodes.</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <select disabled={isLockedTopology} className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs outline-none disabled:cursor-not-allowed disabled:opacity-60" value={draftData.provider || "auto"} onChange={(e) => updateData("provider", e.target.value)}>
                <option value="auto">Auto</option>
                <option value="openai">OpenAI</option>
                <option value="gemini">Gemini</option>
              </select>
              <input disabled={isLockedTopology} className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-mono disabled:cursor-not-allowed disabled:opacity-60" placeholder="gpt-5.4-mini" value={draftData.model || ""} onChange={(e) => updateData("model", e.target.value)} />
            </div>
            <div>
              <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Save To</label>
              <input disabled={isLockedTopology} className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-mono disabled:cursor-not-allowed disabled:opacity-60" placeholder="ai_output" value={draftData.saveTo || ""} onChange={(e) => updateData("saveTo", e.target.value)} />
            </div>
            <div>
              <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">System Prompt</label>
              <textarea disabled={isLockedTopology} className="w-full rounded-lg border border-border-main bg-canvas p-2.5 text-xs font-mono resize-none h-20 disabled:cursor-not-allowed disabled:opacity-60" placeholder="You are a helpful assistant." value={draftData.systemPrompt || ""} onChange={(e) => updateData("systemPrompt", e.target.value)} />
            </div>
            <div>
              <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Style / Tone</label>
              <input disabled={isLockedTopology} className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-mono disabled:cursor-not-allowed disabled:opacity-60" placeholder="Friendly, concise" value={draftData.style || ""} onChange={(e) => updateData("style", e.target.value)} />
            </div>
            <textarea disabled={isLockedTopology} className="w-full rounded-lg border border-border-main bg-canvas p-2.5 text-xs font-mono resize-none h-24 disabled:cursor-not-allowed disabled:opacity-60" placeholder="Summarize this lead in one sentence..." value={draftData.prompt || draftData.text || ""} onChange={(e) => updateData("prompt", e.target.value)} />
          </div>
        );
      case "ai_intent": {
        const intents = normalizeIntentList(Array.isArray(draftData.intents) ? draftData.intents : []);
        const updateIntent = (index: number, updates: Record<string, any>) => {
          const nextIntents = intents.map((intent, currentIndex) =>
            currentIndex === index ? { ...intent, ...updates } : intent
          );
          updateData("intents", normalizeIntentList(nextIntents));
        };
        const addIntent = () => {
          const nextIndex = intents.length + 1;
          updateData("intents", [
            ...normalizeIntentList(intents),
            {
              handle: `intent_${nextIndex}`,
              label: `Intent ${nextIndex}`,
              description: "",
            },
          ]);
        };
        const removeIntent = (index: number) => {
          updateData(
            "intents",
            normalizeIntentList(intents.filter((_, currentIndex) => currentIndex !== index))
          );
        };

        return (
          <div className="space-y-4 pt-4 border-t border-border-main">
            <div className="rounded-xl border border-violet-100 bg-violet-50 p-3 text-[11px] leading-5 text-violet-800 flex items-start gap-2">
              <BrainCircuit size={12} className="mt-0.5 shrink-0" />
              <span>Use AI to classify a message into one routing handle. Each handle must match an edge source handle.</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <select
                disabled={isLockedTopology}
                className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs outline-none disabled:cursor-not-allowed disabled:opacity-60"
                value={draftData.provider || "auto"}
                onChange={(e) => updateData("provider", e.target.value)}
              >
                <option value="auto">Auto</option>
                <option value="openai">OpenAI</option>
                <option value="gemini">Gemini</option>
              </select>
              <input
                disabled={isLockedTopology}
                className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-mono disabled:cursor-not-allowed disabled:opacity-60"
                placeholder="gpt-5.4-mini"
                value={draftData.model || ""}
                onChange={(e) => updateData("model", e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Save To</label>
                <input
                  disabled={isLockedTopology}
                  className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-mono disabled:cursor-not-allowed disabled:opacity-60"
                  placeholder="detected_intent"
                  value={draftData.saveTo || ""}
                  onChange={(e) => updateData("saveTo", e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Fallback Handle</label>
                <input
                  disabled={isLockedTopology}
                  className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-mono disabled:cursor-not-allowed disabled:opacity-60"
                  placeholder="fallback"
                  value={draftData.fallback || ""}
                  onChange={(e) => updateData("fallback", normalizeIntentHandle(e.target.value))}
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Classifier Prompt</label>
              <textarea
                disabled={isLockedTopology}
                className="w-full rounded-lg border border-border-main bg-canvas p-2.5 text-xs font-mono resize-none h-24 disabled:cursor-not-allowed disabled:opacity-60"
                placeholder="Determine whether the user wants sales, support, billing, or a fallback."
                value={draftData.prompt || ""}
                onChange={(e) => updateData("prompt", e.target.value)}
              />
            </div>

            <div>
              <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Thinking Text</label>
              <input
                disabled={isLockedTopology}
                className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-mono disabled:cursor-not-allowed disabled:opacity-60"
                placeholder="Thinking..."
                value={draftData.text || ""}
                onChange={(e) => updateData("text", e.target.value)}
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest">Intent Branches</label>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-violet-700 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={addIntent}
                  disabled={isLockedTopology}
                >
                  <Plus size={10} />
                  Add Intent
                </button>
              </div>

              <div className="space-y-2">
                {intents.map((intent, index) => {
                  const safeIntent: any = intent || {};
                  return (
                  <div key={`${safeIntent.handle || index}`} className="rounded-xl border border-border-main bg-surface p-3 space-y-2">
                    <div className="grid grid-cols-[1fr_1.3fr_auto] gap-2 items-start">
                      <div>
                        <label className="block text-[9px] font-black uppercase tracking-widest text-text-muted mb-1">Handle</label>
                        <input
                          disabled={isLockedTopology}
                          className="w-full border border-border-main bg-canvas rounded-lg p-2 text-xs font-mono disabled:cursor-not-allowed disabled:opacity-60"
                          placeholder="sales"
                          value={safeIntent.handle || ""}
                          onChange={(e) => updateIntent(index, { handle: normalizeIntentHandle(e.target.value) })}
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] font-black uppercase tracking-widest text-text-muted mb-1">Label</label>
                        <input
                          disabled={isLockedTopology}
                          className="w-full border border-border-main bg-canvas rounded-lg p-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-60"
                          placeholder="Sales Inquiry"
                          value={safeIntent.label || ""}
                          onChange={(e) => updateIntent(index, { label: e.target.value })}
                        />
                      </div>
                      <button
                        type="button"
                        disabled={isLockedTopology}
                        onClick={() => removeIntent(index)}
                        className="mt-5 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border-main bg-canvas text-text-muted transition hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-60"
                        title="Remove intent"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                    <div>
                      <label className="block text-[9px] font-black uppercase tracking-widest text-text-muted mb-1">Description</label>
                      <input
                        disabled={isLockedTopology}
                        className="w-full border border-border-main bg-canvas rounded-lg p-2 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                        placeholder="User asking about pricing or demos"
                        value={safeIntent.description || ""}
                        onChange={(e) => updateIntent(index, { description: e.target.value })}
                      />
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      }
      case "ai_extract": {
        const requiredFields = normalizeExtractionFieldList(
          Array.isArray(draftData.requiredFields) && draftData.requiredFields.length
            ? draftData.requiredFields
            : Array.isArray(draftData.fields)
              ? draftData.fields
              : []
        );
        const optionalFields = normalizeExtractionFieldList(Array.isArray(draftData.optionalFields) ? draftData.optionalFields : []);

        const updateFieldList = (key: "requiredFields" | "optionalFields", nextFields: any[]) => {
          updateData(key, normalizeExtractionFieldList(nextFields));
        };

        const updateField = (key: "requiredFields" | "optionalFields", index: number, updates: Record<string, any>) => {
          const source = key === "requiredFields" ? requiredFields : optionalFields;
          const nextFields = source.map((field, currentIndex) =>
            currentIndex === index ? { ...field, ...updates } : field
          );
          updateFieldList(key, nextFields);
        };

        const moveField = (key: "requiredFields" | "optionalFields", index: number, direction: -1 | 1) => {
          const source = key === "requiredFields" ? requiredFields : optionalFields;
          const nextIndex = index + direction;
          if (nextIndex < 0 || nextIndex >= source.length) {
            return;
          }
          const nextFields = [...source];
          const [moved] = nextFields.splice(index, 1);
          nextFields.splice(nextIndex, 0, moved);
          updateFieldList(key, nextFields);
        };

        const removeField = (key: "requiredFields" | "optionalFields", index: number) => {
          const source = key === "requiredFields" ? requiredFields : optionalFields;
          updateFieldList(key, source.filter((_, currentIndex) => currentIndex !== index));
        };

        const addField = (key: "requiredFields" | "optionalFields") => {
          const source = key === "requiredFields" ? requiredFields : optionalFields;
          updateFieldList(key, [
            ...source,
            {
              key: `${key === "requiredFields" ? "required" : "optional"}_field_${source.length + 1}`,
              type: "string",
              description: "",
            },
          ]);
        };

        const renderFieldList = (
          title: string,
          fields: Array<{ key: string; type: string; description: string }>,
          key: "requiredFields" | "optionalFields"
        ) => (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-[10px] font-black uppercase tracking-widest text-text-muted">{title}</label>
              <span className="rounded-full bg-surface px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.16em] text-text-muted border border-border-main">
                {fields.length}
              </span>
            </div>
            <div className="space-y-2">
              {fields.map((field, index) => (
                <div key={`${key}-${field.key || index}`} className="group relative rounded-xl border border-border-main bg-canvas p-3">
                  <div className="grid grid-cols-[1.15fr_0.85fr] gap-2">
                    <div>
                      <label className="mb-1 block text-[9px] font-black uppercase tracking-widest text-text-muted">Key</label>
                      <input
                        disabled={isLockedTopology}
                        className="w-full rounded-lg border border-border-main bg-surface p-2 text-[11px] font-mono outline-none disabled:cursor-not-allowed disabled:opacity-60"
                        placeholder="email"
                        value={field.key || ""}
                        onChange={(e) => updateField(key, index, { key: normalizeIntentHandle(e.target.value) || e.target.value.trim() })}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[9px] font-black uppercase tracking-widest text-text-muted">Type</label>
                      <select
                        disabled={isLockedTopology}
                        className="w-full rounded-lg border border-border-main bg-surface p-2 text-[11px] outline-none disabled:cursor-not-allowed disabled:opacity-60"
                        value={field.type || "string"}
                        onChange={(e) => updateField(key, index, { type: e.target.value })}
                      >
                        <option value="string">String</option>
                        <option value="number">Number</option>
                        <option value="boolean">Boolean</option>
                        <option value="email">Email</option>
                        <option value="phone">Phone</option>
                        <option value="date">Date</option>
                      </select>
                    </div>
                  </div>
                  <div className="mt-2">
                    <div className="mb-1 flex items-center justify-between">
                      <label className="block text-[9px] font-black uppercase tracking-widest text-text-muted">Instructions</label>
                      <button
                        type="button"
                        disabled={isLockedTopology || !String(field.key || "").trim() || suggestingFieldKey === `${key}-${index}`}
                        onClick={async () => {
                          const fieldKey = String(field.key || "").trim();
                          if (!fieldKey) {
                            notify("Enter a field key first.", "error");
                            return;
                          }
                          setSuggestingFieldKey(`${key}-${index}`);
                          try {
                            const suggestion = await flowService.getFieldSuggestion(fieldKey, field.type || "string");
                            if (suggestion) {
                              updateField(key, index, { description: suggestion });
                            }
                          } catch (error) {
                            notifyApiError(error, "Could not generate a field suggestion.", "Suggestion Failed");
                          } finally {
                            setSuggestingFieldKey("");
                          }
                        }}
                        className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.16em] text-violet-700 transition-colors hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {suggestingFieldKey === `${key}-${index}` ? "..." : "Suggest"}
                      </button>
                    </div>
                    <textarea
                      disabled={isLockedTopology}
                      className="h-16 w-full resize-none rounded-lg border border-border-main bg-surface p-2 text-[11px] outline-none disabled:cursor-not-allowed disabled:opacity-60"
                      placeholder="Tell the AI exactly what to extract."
                      value={field.description || ""}
                      onChange={(e) => updateField(key, index, { description: e.target.value })}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    {index > 0 ? (
                      <button
                        type="button"
                        disabled={isLockedTopology}
                        onClick={() => moveField(key, index, -1)}
                        className="rounded-md border border-border-main bg-surface px-2 py-1 text-[9px] font-black uppercase tracking-widest text-text-muted disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Up
                      </button>
                    ) : null}
                    {index < fields.length - 1 ? (
                      <button
                        type="button"
                        disabled={isLockedTopology}
                        onClick={() => moveField(key, index, 1)}
                        className="rounded-md border border-border-main bg-surface px-2 py-1 text-[9px] font-black uppercase tracking-widest text-text-muted disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Down
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={isLockedTopology}
                      onClick={() => removeField(key, index)}
                      className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              disabled={isLockedTopology}
              onClick={() => addField(key)}
              className="w-full rounded-lg border border-dashed border-cyan-200 bg-cyan-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-cyan-700 hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              + Add {title.replace(/s$/i, "")}
            </button>
          </div>
        );

        const runTest = async () => {
          const message = String(testInput || "").trim();
          if (!message) {
            notify("Enter a test message first.", "error");
            return;
          }
          setIsTestingExtraction(true);
          try {
            const result = await flowService.previewExtraction(
              {
                ...draftData,
                requiredFields,
                optionalFields,
              },
              message
            );
            setExtractionPreview(result?.data || result || null);
          } catch (error) {
            notifyApiError(error, "Could not run the extraction preview.", "Preview Failed");
          } finally {
            setIsTestingExtraction(false);
          }
        };

        return (
          <div className="space-y-4 pt-4 border-t border-border-main">
            <div className="rounded-xl border border-cyan-100 bg-cyan-50 p-3 text-[11px] leading-5 text-cyan-800 flex items-start gap-2">
              <BrainCircuit size={12} className="mt-0.5 shrink-0" />
              <span>Extract structured variables from user text. Required fields must be present for the success branch.</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <select
                disabled={isLockedTopology}
                className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs outline-none disabled:cursor-not-allowed disabled:opacity-60"
                value={draftData.provider || "auto"}
                onChange={(e) => updateData("provider", e.target.value)}
              >
                <option value="auto">Auto</option>
                <option value="openai">OpenAI</option>
                <option value="gemini">Gemini</option>
              </select>
              <input
                disabled={isLockedTopology}
                className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-mono disabled:cursor-not-allowed disabled:opacity-60"
                placeholder="gpt-5.4-mini"
                value={draftData.model || ""}
                onChange={(e) => updateData("model", e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-text-muted">Save Confidence To</label>
                <input
                  disabled={isLockedTopology}
                  className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-mono disabled:cursor-not-allowed disabled:opacity-60"
                  placeholder="extraction_confidence"
                  value={draftData.saveConfidenceTo || ""}
                  onChange={(e) => updateData("saveConfidenceTo", e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-text-muted">Incomplete Handle</label>
                <input
                  disabled={isLockedTopology}
                  className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-mono disabled:cursor-not-allowed disabled:opacity-60"
                  placeholder="incomplete"
                  value={draftData.onIncomplete || ""}
                  onChange={(e) => updateData("onIncomplete", normalizeIntentHandle(e.target.value) || e.target.value.trim())}
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-text-muted">System Prompt</label>
              <textarea
                disabled={isLockedTopology}
                className="h-24 w-full resize-none rounded-lg border border-border-main bg-canvas p-2.5 text-xs font-mono outline-none disabled:cursor-not-allowed disabled:opacity-60"
                placeholder="Explain the extraction rules..."
                value={draftData.prompt || ""}
                onChange={(e) => updateData("prompt", e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-text-muted">Min Confidence</label>
                <input
                  disabled={isLockedTopology}
                  type="number"
                  min="0"
                  max="1"
                  step="0.05"
                  className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-mono disabled:cursor-not-allowed disabled:opacity-60"
                  value={draftData.minConfidence ?? 0.7}
                  onChange={(e) => updateData("minConfidence", Number(e.target.value || 0))}
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-text-muted">Display Text</label>
                <input
                  disabled={isLockedTopology}
                  className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-60"
                  placeholder="Updating..."
                  value={draftData.text || ""}
                  onChange={(e) => updateData("text", e.target.value)}
                />
              </div>
            </div>

            {renderFieldList("Required Fields", requiredFields, "requiredFields")}
            {renderFieldList("Optional Fields", optionalFields, "optionalFields")}

            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between">
                <label className="block text-[10px] font-black uppercase tracking-widest text-text-muted">Manual Sandbox</label>
                <span className="text-[9px] text-text-muted">No data is saved</span>
              </div>
              <textarea
                className="min-h-[88px] w-full resize-none rounded-lg border border-border-main bg-canvas p-2.5 text-xs outline-none"
                placeholder="Type a test message here..."
                value={testInput}
                onChange={(e) => setTestInput(e.target.value)}
              />
              <button
                type="button"
                disabled={isLockedTopology || isTestingExtraction || !String(testInput || "").trim()}
                onClick={runTest}
                className="w-full rounded-lg bg-cyan-600 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white transition-colors hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isTestingExtraction ? "Analyzing..." : "Run Extraction Test"}
              </button>
              <ExtractionPreview lastResult={extractionPreview} />
            </div>
          </div>
        );
      }
      case "send_template":
        return (
          <div className="space-y-4 pt-4 border-t border-border-main">
            <div>
              <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Template Name</label>
              <input disabled={isLockedTopology} className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-mono disabled:cursor-not-allowed disabled:opacity-60" placeholder="hello_world" value={draftData.templateName || draftData.templateId || draftData.metaTemplateId || ""} onChange={(e) => updateData("templateName", e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <input disabled={isLockedTopology} className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-mono disabled:cursor-not-allowed disabled:opacity-60" placeholder="en_US" value={draftData.language || ""} onChange={(e) => updateData("language", e.target.value)} />
              <input disabled={isLockedTopology} className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-mono disabled:cursor-not-allowed disabled:opacity-60" placeholder="meta-template-id" value={draftData.metaTemplateId || draftData.templateId || ""} onChange={(e) => updateData("metaTemplateId", e.target.value)} />
            </div>
            <div>
              <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Template Variable Mapping JSON</label>
              <textarea disabled={isLockedTopology} className="w-full rounded-lg border border-border-main bg-canvas p-2.5 text-xs font-mono resize-none h-28 disabled:cursor-not-allowed disabled:opacity-60" placeholder='{"1":"lead_name","2":"lead_email"}' value={draftData.templateVariableValues || ""} onChange={(e) => updateData("templateVariableValues", e.target.value)} />
            </div>
          </div>
        );
      case "delay":
        return (
          <div className="space-y-4 pt-4 border-t border-border-main">
            <div className="grid grid-cols-2 gap-4">
              <input type="number" min="0" disabled={isLockedTopology} className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs disabled:cursor-not-allowed disabled:opacity-60" placeholder="5" value={draftData.duration || draftData.delayMs || ""} onChange={(e) => updateData("duration", Number(e.target.value || 0))} />
              <select disabled={isLockedTopology} className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs outline-none disabled:cursor-not-allowed disabled:opacity-60" value={draftData.unit || "seconds"} onChange={(e) => updateData("unit", e.target.value)}>
                <option value="seconds">Seconds</option>
                <option value="minutes">Minutes</option>
                <option value="hours">Hours</option>
              </select>
            </div>
          </div>
        );
      case "assign_agent":
        return (
          <div className="space-y-4 pt-4 border-t border-border-main">
            <input className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-60" disabled={isLockedTopology} placeholder="e.g. human, support, agent" value={draftData.keywords || ""} onChange={(e) => updateData("keywords", e.target.value)} />
          </div>
        );
      case "knowledge_lookup":
        return (
          <div className="space-y-4 pt-4 border-t border-border-main">
            <div className="rounded-xl border border-sky-100 bg-sky-50 p-3 text-[11px] leading-5 text-sky-800">
              Search the workspace knowledge base, store the matched documents, and optionally save merged text for the next message node.
            </div>
            <div className="grid grid-cols-2 gap-4">
              <select disabled={isLockedTopology} className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs outline-none disabled:cursor-not-allowed disabled:opacity-60" value={draftData.scope || "project"} onChange={(e) => updateData("scope", e.target.value)}>
                <option value="project">Project</option>
                <option value="workspace">Workspace</option>
              </select>
              <input type="number" min="1" max="10" disabled={isLockedTopology} className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-mono disabled:cursor-not-allowed disabled:opacity-60" placeholder="3" value={draftData.limit || ""} onChange={(e) => updateData("limit", Number(e.target.value || 0))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <input disabled={isLockedTopology} className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-mono disabled:cursor-not-allowed disabled:opacity-60" placeholder="knowledge_results" value={draftData.saveTo || ""} onChange={(e) => updateData("saveTo", e.target.value)} />
              <input disabled={isLockedTopology} className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-mono disabled:cursor-not-allowed disabled:opacity-60" placeholder="knowledge_text" value={draftData.saveTextTo || ""} onChange={(e) => updateData("saveTextTo", e.target.value)} />
            </div>
            <textarea disabled={isLockedTopology} className="w-full rounded-lg border border-border-main bg-canvas p-2.5 text-xs font-mono resize-none h-20 disabled:cursor-not-allowed disabled:opacity-60" placeholder="Summarize the return policy..." value={draftData.query || ""} onChange={(e) => updateData("query", e.target.value)} />
          </div>
        );
      case "save":
        return (
          <div className="space-y-4 pt-4 border-t border-border-main">
            <div className="grid grid-cols-2 gap-4">
              <input disabled={isLockedTopology} className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-mono disabled:cursor-not-allowed disabled:opacity-60" placeholder="session_status" value={draftData.variable || ""} onChange={(e) => updateData("variable", e.target.value)} />
              <input disabled={isLockedTopology} className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs disabled:cursor-not-allowed disabled:opacity-60" placeholder="qualified" value={draftData.value || ""} onChange={(e) => updateData("value", e.target.value)} />
            </div>
            <div>
              <label className="block text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Lead Status</label>
              <input disabled={isLockedTopology} className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs disabled:cursor-not-allowed disabled:opacity-60" placeholder="qualified" value={draftData.leadStatus || ""} onChange={(e) => updateData("leadStatus", e.target.value)} />
            </div>
          </div>
        );
      case "trigger":
        return (
          <div className="space-y-4 pt-4 border-t border-border-main">
            <div className="grid grid-cols-2 gap-4">
              <select disabled={isLockedTopology} className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs outline-none disabled:cursor-not-allowed disabled:opacity-60" value={draftData.triggerType || "keyword"} onChange={(e) => updateData("triggerType", e.target.value)}>
                <option value="keyword">Keyword</option>
                <option value="external">External</option>
                <option value="manual">Manual</option>
              </select>
              <input disabled={isLockedTopology} className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs font-mono disabled:cursor-not-allowed disabled:opacity-60" placeholder="welcome_trigger" value={draftData.entryKey || ""} onChange={(e) => updateData("entryKey", e.target.value)} />
            </div>
          </div>
        );
      case "resume_bot":
        return (
          <div className="space-y-4 pt-4 border-t border-border-main">
            <textarea disabled={isLockedTopology} className="w-full border border-border-main bg-canvas rounded-lg p-2.5 text-xs text-text-main resize-none h-20 outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60" placeholder="Welcome back. Let's continue from here." value={draftData.resumeText || draftData.text || ""} onChange={(e) => updateData("resumeText", e.target.value)} />
          </div>
        );
      default:
        return null;
    }
  };

  if (!node) return null;
  const nodeEditorMeta = getNodeEditorMeta(nodeType);

  return (
    <div
      className="w-full h-full bg-surface text-text-main flex flex-col relative overflow-hidden nodrag nopan"
      onPointerDownCapture={(e) => e.stopPropagation()}
      onPointerUpCapture={(e) => e.stopPropagation()}
    >
      <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4">
        <div className="space-y-4">
          <div className="rounded-xl border border-border-main bg-canvas/70 p-3 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-text-muted">Node Type</p>
                <h3 className="mt-1 text-sm font-black text-text-main">{nodeEditorMeta.title}</h3>
              </div>
              <span className="rounded-full border border-border-main bg-surface px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">
                {nodeType || "node"}
              </span>
            </div>
            <p className="mt-2 text-[11px] leading-5 text-text-muted">{nodeEditorMeta.description}</p>
          </div>

          <div>
            <label className="block text-[10px] font-black text-text-main uppercase tracking-widest mb-1">Node Header (Label)</label>
            <input
              className="w-full border border-border-main bg-canvas rounded-xl p-3 text-sm font-bold text-text-main focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
              placeholder={`e.g. ${String(draftData.label || nodeType.replace("_", " "))}`}
              value={draftData.label || ""}
              onChange={(e) => updateData("label", e.target.value)}
              disabled={isLockedTopology}
            />
          </div>

          <div>
            <label className="block text-[10px] font-black text-text-main uppercase tracking-widest mb-1">
              {nodeType === "start" || nodeType === "end" ? "Notes" : "Message Text / Notes"}
            </label>
            <textarea
              className="w-full border border-border-main bg-canvas rounded-xl p-3 text-sm min-h-[100px] text-text-main resize-none focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
              placeholder={
                nodeType === "start"
                  ? "Describe the entry point..."
                  : nodeType === "end"
                    ? "Describe this terminal node..."
                    : nodeType === "input"
                      ? "e.g. What is your email address?"
                      : "Content..."
              }
              value={draftData.text || ""}
              onChange={(e) => updateData("text", e.target.value)}
              disabled={isLockedTopology}
            />
          </div>

          {renderSpecificNodeFields()}
        </div>
      </div>

      <div className="w-full p-4 border-t border-border-main bg-surface shrink-0 shadow-[0_-10px_20px_-5px_rgba(0,0,0,0.05)] z-10">
        <div className="flex flex-col items-center gap-1">
          {!isReadOnlyMode ? (
            <button
              type="button"
              onClick={handleSaveAndCloseClick}
              disabled={Boolean(!permissionsReady || !canEditWorkflow)}
              title={saveDisabledReason || "Save this node and close the editor."}
              className={`w-full max-w-[220px] px-3.5 py-2 text-[10px] font-black rounded-xl flex items-center justify-center gap-1.5 text-center transition-all duration-300 border uppercase tracking-[0.14em] ${
                !permissionsReady || !canEditWorkflow
                  ? "bg-slate-200 border-slate-200 text-slate-500 cursor-not-allowed"
                  : "bg-slate-900 border-slate-900 text-white hover:bg-primary/90 hover:border-primary/60 hover:shadow-sm hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
              }`}
            >
              Save & Close
            </button>
          ) : null}
          <span className="max-w-[220px] text-center text-[9px] font-semibold leading-3 text-text-muted">
            {saveDisabledReason || "Saves this node and closes the editor."}
          </span>
        </div>
      </div>
    </div>
  );
}
