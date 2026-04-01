import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { Plus, Trash2, X, Loader2, Save, Info } from "lucide-react";

import { botService } from "../../services/botService";
import { projectService, type ProjectSummary } from "../../services/projectService";
import { notify } from "../../store/uiStore";
import { useAuthStore } from "../../store/authStore";

type UniversalRuleForm = {
  keywords: string;
  flowId: string;
};

type BotBehaviorForm = {
  fallbackMessage: string;
  optOutMessage: string;
  globalFallbackNodeId: string;
  handoffFlowId: string;
  csatFlowId: string;
  handoffMode: "disabled" | "default";
  csatMode: "disabled" | "default";
  universalRules: UniversalRuleForm[];
};

function mergeSettingsSources(...sources: any[]) {
  return sources.reduce((acc, source) => {
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      return acc;
    }
    return { ...acc, ...source };
  }, {});
}

function readBotBehavior(settingsJson: any): BotBehaviorForm {
  const settings = settingsJson && typeof settingsJson === "object" ? settingsJson : {};
  const systemMessages =
    settings.system_messages && typeof settings.system_messages === "object"
      ? settings.system_messages
      : settings.systemMessages && typeof settings.systemMessages === "object"
        ? settings.systemMessages
        : settings.systemDefaultMessages && typeof settings.systemDefaultMessages === "object"
          ? settings.systemDefaultMessages
          : settings.system_default_messages && typeof settings.system_default_messages === "object"
            ? settings.system_default_messages
            : {};
  const systemFlows =
    settings.system_flows && typeof settings.system_flows === "object"
      ? settings.system_flows
      : settings.systemFlows && typeof settings.systemFlows === "object"
        ? settings.systemFlows
        : settings.systemDefaultFlows && typeof settings.systemDefaultFlows === "object"
          ? settings.systemDefaultFlows
          : settings.system_default_flows && typeof settings.system_default_flows === "object"
            ? settings.system_default_flows
            : {};
  const handoffFlowId = String(
    systemFlows.handoff_flow_id ||
      systemFlows.handoffFlowId ||
      settings.handoff_flow_id ||
      settings.handoffFlowId ||
      ""
  ).trim();
  const csatFlowId = String(
    systemFlows.csat_flow_id ||
      systemFlows.csatFlowId ||
      settings.csat_flow_id ||
      settings.csatFlowId ||
      settings.conversationCloseFlowId ||
      settings.conversation_close_flow_id ||
      ""
  ).trim();
  const handoffMode = String(
    systemFlows.handoff_mode ||
      systemFlows.handoffMode ||
      settings.handoff_mode ||
      settings.handoffMode ||
      ""
  ).trim();
  const csatMode = String(
    systemFlows.csat_mode ||
      systemFlows.csatMode ||
      settings.csat_mode ||
      settings.csatMode ||
      ""
  ).trim();
  const universalRulesSource = Array.isArray(settings.universal_rules)
    ? settings.universal_rules
    : Array.isArray(settings.keyword_interrupts)
      ? settings.keyword_interrupts
    : Array.isArray(settings.universalRules)
      ? settings.universalRules
      : Array.isArray(systemFlows.universal_rules)
        ? systemFlows.universal_rules
        : Array.isArray(systemFlows.keyword_interrupts)
          ? systemFlows.keyword_interrupts
        : Array.isArray(systemFlows.universalRules)
          ? systemFlows.universalRules
          : [];

  return {
    fallbackMessage: String(
      systemMessages.fallback_message ||
        systemMessages.fallbackMessage ||
        settings.fallback_message ||
        settings.fallbackMessage ||
        settings.error_message ||
        settings.errorMessage ||
        "I didn't quite understand that. Can you rephrase?"
    ).trim(),
    optOutMessage: String(
      systemMessages.opt_out_message ||
        systemMessages.optOutMessage ||
        settings.opt_out_message ||
        settings.optOutMessage ||
        "You have been unsubscribed and will no longer receive messages."
    ).trim(),
    globalFallbackNodeId: String(
      systemFlows.global_fallback_node_id ||
        systemFlows.globalFallbackNodeId ||
        settings.global_fallback_node_id ||
        settings.globalFallbackNodeId ||
        settings.system_fallback_node_id ||
        settings.systemFallbackNodeId ||
        settings.error_node_id ||
        settings.errorNodeId ||
        settings.fallback_node_id ||
        settings.fallbackNodeId ||
        ""
    ).trim(),
    handoffFlowId,
    csatFlowId,
    handoffMode:
      handoffMode === "default" || handoffMode === "disabled"
        ? handoffMode
        : handoffFlowId
          ? "default"
          : "disabled",
    csatMode:
      csatMode === "default" || csatMode === "disabled"
        ? csatMode
        : csatFlowId
          ? "default"
          : "disabled",
    universalRules: universalRulesSource.map((rule: any) => ({
      keywords: Array.isArray(rule?.keywords)
        ? rule.keywords.join(", ")
        : String(rule?.keywords || rule?.keyword || rule?.trigger_keywords || rule?.triggerKeywords || ""),
      flowId: String(rule?.flow_id || rule?.flowId || rule?.target_flow_id || rule?.targetFlowId || "").trim(),
    })),
  };
}

function inferSystemFlowType(flow: any) {
  const flowJson = flow?.flow_json && typeof flow.flow_json === "object" ? flow.flow_json : {};
  const currentType = String(
    flow?.system_flow_type || flowJson.system_flow_type || flowJson.systemFlowType || ""
  )
    .trim()
    .toLowerCase();
  if (currentType === "handoff" || currentType === "csat") {
    return currentType;
  }

  const currentName = String(flow?.flow_name || flow?.name || flowJson.flow_name || flowJson.name || "")
    .trim()
    .toLowerCase();
  if (currentName.includes("handoff")) {
    return "handoff";
  }
  if (currentName.includes("csat")) {
    return "csat";
  }

  return "";
}

function buildSystemFlowBlueprint(flowType: "handoff" | "csat") {
  if (flowType === "handoff") {
    return {
      system_flow_type: "handoff",
      is_global_flow: true,
      is_system_flow: true,
      nodes: [
        { id: "handoff-start", type: "start", position: { x: 120, y: 100 }, data: { label: "Start" } },
        {
          id: "handoff-ack",
          type: "msg_text",
          position: { x: 120, y: 220 },
          data: { label: "Acknowledgment", text: "No problem. Let me get a human agent to help you out." },
        },
        {
          id: "handoff-assign",
          type: "assign_agent",
          position: { x: 120, y: 360 },
          data: { label: "Assign Agent", text: "Bot paused. An agent will be with you shortly." },
        },
        {
          id: "handoff-set-expectation",
          type: "msg_text",
          position: { x: 120, y: 500 },
          data: {
            label: "Expectation Setting",
            text: "I've notified our team. Someone will review your chat and reply here shortly. Reply 'Cancel' to return to the bot.",
          },
        },
        { id: "handoff-end", type: "end", position: { x: 520, y: 500 }, data: { label: "End" } },
      ],
      edges: [
        { id: "handoff-e1", source: "handoff-start", target: "handoff-ack", sourceHandle: "next" },
        { id: "handoff-e2", source: "handoff-ack", target: "handoff-assign", sourceHandle: "next" },
        { id: "handoff-e3", source: "handoff-assign", target: "handoff-set-expectation", sourceHandle: "response" },
        { id: "handoff-e4", source: "handoff-set-expectation", target: "handoff-end", sourceHandle: "next" },
      ],
    };
  }

  return {
    system_flow_type: "csat",
    is_global_flow: true,
    is_system_flow: true,
    nodes: [
      { id: "csat-start", type: "start", position: { x: 120, y: 100 }, data: { label: "Start" } },
      {
        id: "csat-menu",
        type: "menu_button",
        position: { x: 120, y: 220 },
        data: {
          label: "CSAT Rating",
          text: "This conversation has been closed. How would you rate the support you received today?",
          item1: "🤩 Great",
          item2: "😐 Okay",
          item3: "😡 Bad",
        },
      },
      {
        id: "csat-save-good",
        type: "save",
        position: { x: 120, y: 360 },
        data: { label: "Save Great", variable: "last_csat_rating", value: "Great" },
      },
      {
        id: "csat-save-ok",
        type: "save",
        position: { x: 380, y: 360 },
        data: { label: "Save Okay", variable: "last_csat_rating", value: "Okay" },
      },
      {
        id: "csat-save-bad",
        type: "save",
        position: { x: 640, y: 360 },
        data: { label: "Save Bad", variable: "last_csat_rating", value: "Bad" },
      },
      { id: "csat-thanks", type: "msg_text", position: { x: 120, y: 500 }, data: { label: "Thanks", text: "Thank you for the feedback! Have a great day." } },
      {
        id: "csat-sorry",
        type: "msg_text",
        position: { x: 640, y: 500 },
        data: {
          label: "Apology",
          text: "We are so sorry to hear that. A manager has been notified and will review your ticket.",
        },
      },
      {
        id: "csat-risk",
        type: "save",
        position: { x: 640, y: 640 },
        data: { label: "Risk Flag", variable: "csat_risk", value: true },
      },
      { id: "csat-end", type: "end", position: { x: 360, y: 700 }, data: { label: "End" } },
    ],
    edges: [
      { id: "csat-e1", source: "csat-start", target: "csat-menu", sourceHandle: "next" },
      { id: "csat-e2", source: "csat-menu", target: "csat-save-good", sourceHandle: "item1" },
      { id: "csat-e3", source: "csat-menu", target: "csat-save-ok", sourceHandle: "item2" },
      { id: "csat-e4", source: "csat-menu", target: "csat-save-bad", sourceHandle: "item3" },
      { id: "csat-e5", source: "csat-save-good", target: "csat-thanks", sourceHandle: "next" },
      { id: "csat-e6", source: "csat-save-ok", target: "csat-thanks", sourceHandle: "next" },
      { id: "csat-e7", source: "csat-save-bad", target: "csat-sorry", sourceHandle: "next" },
      { id: "csat-e8", source: "csat-sorry", target: "csat-risk", sourceHandle: "next" },
      { id: "csat-e9", source: "csat-risk", target: "csat-end", sourceHandle: "next" },
      { id: "csat-e10", source: "csat-thanks", target: "csat-end", sourceHandle: "next" },
    ],
  };
}

interface EditBotModalProps {
  isOpen: boolean;
  onClose: () => void;
  bot: any;
  onSuccess: () => void;
}

export default function EditBotModal({
  isOpen,
  onClose,
  bot,
  onSuccess,
}: EditBotModalProps) {
  const router = useRouter();
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);
  const activeProject = useAuthStore((state) => state.activeProject);
  const [name, setName] = useState("");
  const [keywords, setKeywords] = useState("");
  const [projectId, setProjectId] = useState("");
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [flows, setFlows] = useState<any[]>([]);
  const [resolvedBot, setResolvedBot] = useState<any>(bot);
  const [behavior, setBehavior] = useState<BotBehaviorForm>({
    fallbackMessage: "",
    optOutMessage: "",
    globalFallbackNodeId: "",
    handoffFlowId: "",
    csatFlowId: "",
    handoffMode: "disabled",
    csatMode: "disabled",
    universalRules: [],
  });
  const [isSaving, setIsSaving] = useState(false);
  useEffect(() => {
    if (bot && isOpen) {
      setResolvedBot(bot);
      setName(bot.name || "");
      setKeywords(bot.trigger_keywords || "");
      setProjectId(bot.project_id ?? "");
      setBehavior(readBotBehavior(mergeSettingsSources(bot.settings, bot.settings_json, bot.global_settings)));
    }
  }, [bot, isOpen]);

  useEffect(() => {
    if (!isOpen || !bot?.id) {
      return;
    }

    botService
      .getBot(bot.id)
      .then((freshBot) => {
        if (!freshBot) return;
        setResolvedBot(freshBot);
        setBehavior(readBotBehavior(mergeSettingsSources(freshBot.settings, freshBot.settings_json, freshBot.global_settings)));
        setName(freshBot.name || bot.name || "");
        setKeywords(freshBot.trigger_keywords || bot.trigger_keywords || "");
        setProjectId(freshBot.project_id ?? bot.project_id ?? "");
      })
      .catch((err) => {
        console.error("Failed to hydrate bot details for editor", err);
      });
  }, [bot?.id, isOpen]);

  useEffect(() => {
    if (!isOpen || !activeWorkspace?.workspace_id) {
      setProjects([]);
      return;
    }

    projectService
      .list(activeWorkspace.workspace_id)
      .then((rows) => setProjects(rows))
      .catch((err) => {
        console.error("Failed to load projects for bot editor", err);
        setProjects([]);
      });
  }, [isOpen, activeWorkspace?.workspace_id]);

  useEffect(() => {
    if (!isOpen || !bot?.id) {
      setFlows([]);
      return;
    }

    botService
      .getSystemFlows(bot.id)
      .then((rows) => setFlows(Array.isArray(rows) ? rows : []))
      .catch((err) => {
        console.error("Failed to load system flows for bot editor", err);
        setFlows([]);
      });
  }, [isOpen, bot?.id]);

  const systemFlows = flows.filter((flow: any) => Boolean(inferSystemFlowType(flow)));

  const getSystemFlowByType = (flowType: "handoff" | "csat") =>
    flows.find((flow: any) => inferSystemFlowType(flow) === flowType);

  const handoffSystemFlow = getSystemFlowByType("handoff");
  const csatSystemFlow = getSystemFlowByType("csat");
  const handoffEnabled = behavior.handoffMode === "default";
  const csatEnabled = behavior.csatMode === "default";
  const handoffSystemFlowLabel = String(handoffSystemFlow?.flow_name || handoffSystemFlow?.name || "Default Human Handoff").trim();
  const csatSystemFlowLabel = String(csatSystemFlow?.flow_name || csatSystemFlow?.name || "Default CSAT Survey").trim();

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setBehavior((current) => {
      const next = { ...current };
      let changed = false;

      if (current.handoffMode === "default" && !current.handoffFlowId && handoffSystemFlow?.id) {
        next.handoffFlowId = String(handoffSystemFlow.id || "").trim();
        changed = true;
      }

      if (current.csatMode === "default" && !current.csatFlowId && csatSystemFlow?.id) {
        next.csatFlowId = String(csatSystemFlow.id || "").trim();
        changed = true;
      }

      return changed ? next : current;
    });
  }, [csatSystemFlow?.id, handoffSystemFlow?.id, isOpen]);

  const resolveEnabledSystemFlowId = (flowType: "handoff" | "csat") => {
    const behaviorId = flowType === "handoff" ? behavior.handoffFlowId : behavior.csatFlowId;
    if (behaviorId) {
      return behaviorId;
    }

    const savedBotSettings = readBotBehavior(
      mergeSettingsSources(
        resolvedBot?.settings,
        resolvedBot?.settings_json,
        resolvedBot?.global_settings,
        bot?.settings,
        bot?.settings_json,
        bot?.global_settings
      )
    );
    const savedId = flowType === "handoff" ? savedBotSettings.handoffFlowId : savedBotSettings.csatFlowId;
    if (savedId) {
      return savedId;
    }

    return String(getSystemFlowByType(flowType)?.id || "").trim();
  };

  const ensureSystemFlowExists = async (flowType: "handoff" | "csat") => {
    const existingId = resolveEnabledSystemFlowId(flowType);
    if (existingId) {
      return existingId;
    }

    const freshBot = await botService.getBot(String(bot.id));
    if (freshBot) {
      setResolvedBot(freshBot);
      setBehavior(readBotBehavior(mergeSettingsSources(freshBot.settings, freshBot.settings_json, freshBot.global_settings)));
    }

    const refreshedSummaries = await botService.getSystemFlows(String(bot.id));
    const resolvedId = refreshedSummaries.find((flow: any) => inferSystemFlowType(flow) === flowType)?.id ||
      "";

    const createdId = String(resolvedId || "").trim();
    if (createdId) {
      setBehavior((current) =>
        flowType === "handoff"
          ? { ...current, handoffFlowId: createdId, handoffMode: "default" }
          : { ...current, csatFlowId: createdId, csatMode: "default" }
      );
    }

    return createdId;
  };

  const openSystemFlowInBuilder = async (flowType: "handoff" | "csat") => {
    if (!bot?.id) return;

    router.push(
      `/flows?botId=${encodeURIComponent(String(bot.id))}&systemFlowType=${encodeURIComponent(flowType)}`
    );
  };
  const enabledKeywordTargets = [
    handoffEnabled && resolveEnabledSystemFlowId("handoff")
      ? {
          id: resolveEnabledSystemFlowId("handoff"),
          flow_name: "Default Human Handoff",
          system_flow_type: "handoff",
        }
      : null,
    csatEnabled && resolveEnabledSystemFlowId("csat")
      ? {
          id: resolveEnabledSystemFlowId("csat"),
          flow_name: "Default CSAT Survey",
          system_flow_type: "csat",
        }
      : null,
  ].filter(Boolean) as any[];

  if (!isOpen || !bot) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setIsSaving(true);

    try {
      const currentBot = resolvedBot || bot;
      const nextWorkspaceId = activeWorkspace?.workspace_id || currentBot?.workspace_id || "";
      const nextProjectId = projectId || "";
      const initialWorkspaceId = String(currentBot?.workspace_id || "");
      const initialProjectId = String(currentBot?.project_id || "");
      const resolvedHandoffFlowId =
        behavior.handoffMode === "default" ? behavior.handoffFlowId || (await ensureSystemFlowExists("handoff")) : "";
      const resolvedCsatFlowId =
        behavior.csatMode === "default" ? behavior.csatFlowId || (await ensureSystemFlowExists("csat")) : "";
      const universalRules = behavior.universalRules
        .map((rule) => ({
          keywords: String(rule.keywords || "")
            .split(",")
            .map((keyword) => keyword.trim())
            .filter(Boolean),
          flow_id: String(rule.flowId || "").trim() || null,
        }))
        .filter((rule) => rule.flow_id && rule.keywords.length > 0);

      const nextSettingsJson = {
        ...mergeSettingsSources(
          bot?.settings,
          bot?.settings_json,
          bot?.global_settings,
          resolvedBot?.settings,
          resolvedBot?.settings_json,
          resolvedBot?.global_settings
        ),
        system_messages: {
          fallback_message: behavior.fallbackMessage || null,
          opt_out_message: behavior.optOutMessage || null,
        },
        global_fallback_node_id: behavior.globalFallbackNodeId || null,
        globalFallbackNodeId: behavior.globalFallbackNodeId || null,
        error_node_id: behavior.globalFallbackNodeId || null,
        system_flows: {
          handoff_flow_id: behavior.handoffMode === "default" ? resolvedHandoffFlowId || null : null,
          csat_flow_id: behavior.csatMode === "default" ? resolvedCsatFlowId || null : null,
          handoff_mode: behavior.handoffMode,
          csat_mode: behavior.csatMode,
        },
        keyword_interrupts: universalRules,
        universal_rules: universalRules,
        fallback_message: behavior.fallbackMessage || null,
        opt_out_message: behavior.optOutMessage || null,
      };

      const updatePayload: Record<string, unknown> = {
        name,
        trigger_keywords: keywords,
        globalSettings: nextSettingsJson,
        settingsJson: nextSettingsJson,
      };

      if (nextWorkspaceId && nextWorkspaceId !== initialWorkspaceId) {
        updatePayload.workspaceId = nextWorkspaceId;
      }

      if (nextProjectId !== initialProjectId) {
        updatePayload.projectId = nextProjectId || null;
      }

      await botService.updateBot(bot.id, updatePayload as any);

      onSuccess();
      onClose();
    } catch (err) {
      console.error("Update failed", err);
      notify("Failed to update bot settings.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 flex h-[94vh] max-h-[94vh] w-full max-w-2xl flex-col overflow-hidden rounded-[2rem] border border-border-main bg-surface shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between border-b border-border-main bg-surface p-6">
          <div>
            <h2 className="font-black uppercase tracking-tighter text-text-main">
              Edit Instance
            </h2>
            <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
              ID: {bot.id}
            </p>
          </div>

          <button
            onClick={onClose}
            className="rounded-full p-2 transition-colors hover:bg-primary-fade"
          >
            <X size={20} className="text-text-muted" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-5 overflow-y-auto p-8">
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">
              Instance Name
            </label>

            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-2xl border border-border-main bg-canvas px-5 py-3 text-sm font-bold text-text-main outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">
              Trigger Keywords
            </label>

            <input
              type="text"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              className="w-full rounded-2xl border border-border-main bg-canvas px-5 py-3 text-sm font-bold text-text-main outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">
              Project
            </label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full rounded-2xl border border-border-main bg-canvas px-5 py-3 text-sm font-bold text-text-main outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary"
            >
              <option value="">No project</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-4 rounded-2xl border border-border-main bg-canvas p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-text-muted">
                  Global Rules & Behavior
                </div>
                <p className="mt-1 text-xs text-text-muted">
                  Define the bot's permanent system messages and the flows used for handoff, CSAT, and keyword interrupts.
                </p>
              </div>
              <div className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-amber-700">
                System Split
              </div>
            </div>

            <div className="space-y-3 rounded-2xl border border-border-main bg-surface p-4">
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-text-muted">
                  Permanent System Messages
                </div>
                <p className="mt-1 text-xs text-text-muted">
                  These are direct text replies. They do not open a flow builder.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">
                  Unrecognized Input (Fallback)
                </label>
                <textarea
                  value={behavior.fallbackMessage}
                  onChange={(e) => setBehavior((current) => ({ ...current, fallbackMessage: e.target.value }))}
                  rows={3}
                  placeholder="What should the bot say if it doesn't understand the user?"
                  className="w-full rounded-2xl border border-border-main bg-canvas px-4 py-3 text-sm font-semibold text-text-main outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">
                  Opt-Out (STOP)
                </label>
                <textarea
                  value={behavior.optOutMessage}
                  onChange={(e) => setBehavior((current) => ({ ...current, optOutMessage: e.target.value }))}
                  rows={3}
                  placeholder="What should the bot say when a user replies STOP?"
                  className="w-full rounded-2xl border border-border-main bg-canvas px-4 py-3 text-sm font-semibold text-text-main outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">
                  Global Error Fallback Node ID
                </label>
                <input
                  type="text"
                  value={behavior.globalFallbackNodeId}
                  onChange={(e) =>
                    setBehavior((current) => ({
                      ...current,
                      globalFallbackNodeId: e.target.value,
                    }))
                  }
                  placeholder="primary-error-message"
                  className="w-full rounded-2xl border border-border-main bg-canvas px-4 py-3 text-sm font-semibold text-text-main outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary"
                />
                <p className="text-[11px] leading-5 text-text-muted">
                  When an input or menu exhausts retries, the runtime jumps to this node ID if it exists.
                </p>
              </div>
            </div>

            <div className="space-y-3 rounded-2xl border border-border-main bg-surface p-4">
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-text-muted">
                  System Flows
                </div>
                <p className="mt-1 text-xs text-text-muted">
                  These flows are launched by the engine when the corresponding event happens.
                </p>
              </div>

              <div className="space-y-3">
                <div className="rounded-2xl border border-border-main bg-canvas p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">
                        Human Handoff
                      </label>
                      <p className="mt-1 text-[11px] text-text-muted">
                        Triggered via keyword interrupts.
                      </p>
                    </div>
                    {handoffEnabled ? (
                      <button
                        type="button"
                        onClick={() => openSystemFlowInBuilder("handoff")}
                        className="text-[10px] font-black uppercase tracking-[0.18em] text-primary transition hover:opacity-80"
                      >
                        Edit Flow Text
                      </button>
                    ) : null}
                  </div>
                  <div className="mt-4 grid gap-2">
                    <label className="flex items-center gap-3 rounded-xl border border-border-main bg-surface px-4 py-3 text-xs font-semibold text-text-main">
                      <input
                        type="radio"
                        name="handoff-flow-mode"
                        checked={!handoffEnabled}
                        onChange={() => setBehavior((current) => ({ ...current, handoffMode: "disabled", handoffFlowId: "" }))}
                      />
                      Disabled
                    </label>
                    <label className="flex items-center gap-3 rounded-xl border border-border-main bg-surface px-4 py-3 text-xs font-semibold text-text-main">
                      <input
                        type="radio"
                        name="handoff-flow-mode"
                        checked={handoffEnabled}
                        onChange={() =>
                          setBehavior((current) => ({
                            ...current,
                            handoffMode: "default",
                          }))
                        }
                      />
                      Use Default Handoff Flow
                    </label>
                  </div>
                  <div className="mt-3 rounded-xl border border-dashed border-border-main bg-surface px-4 py-3 text-[11px] text-text-muted">
                    {handoffEnabled ? (
                      <>
                        Active default flow: <span className="font-bold text-text-main">{handoffSystemFlowLabel}</span>
                      </>
                    ) : (
                      <>
                        Default flow available: <span className="font-bold text-text-main">{handoffSystemFlowLabel}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-border-main bg-canvas p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">
                        CSAT Survey
                      </label>
                      <p className="mt-1 text-[11px] text-text-muted">
                        Triggered when an agent closes a chat.
                      </p>
                    </div>
                    {csatEnabled ? (
                      <button
                        type="button"
                        onClick={() => openSystemFlowInBuilder("csat")}
                        className="text-[10px] font-black uppercase tracking-[0.18em] text-primary transition hover:opacity-80"
                      >
                        Edit Flow Text
                      </button>
                    ) : null}
                  </div>
                  <div className="mt-4 grid gap-2">
                    <label className="flex items-center gap-3 rounded-xl border border-border-main bg-surface px-4 py-3 text-xs font-semibold text-text-main">
                      <input
                        type="radio"
                        name="csat-flow-mode"
                        checked={!csatEnabled}
                        onChange={() => setBehavior((current) => ({ ...current, csatMode: "disabled", csatFlowId: "" }))}
                      />
                      Disabled
                    </label>
                    <label className="flex items-center gap-3 rounded-xl border border-border-main bg-surface px-4 py-3 text-xs font-semibold text-text-main">
                      <input
                        type="radio"
                        name="csat-flow-mode"
                        checked={csatEnabled}
                        onChange={() =>
                          setBehavior((current) => ({
                            ...current,
                            csatMode: "default",
                          }))
                        }
                      />
                      Use Default CSAT Flow
                    </label>
                  </div>
                  <div className="mt-3 rounded-xl border border-dashed border-border-main bg-surface px-4 py-3 text-[11px] text-text-muted">
                    {csatEnabled ? (
                      <>
                        Active default flow: <span className="font-bold text-text-main">{csatSystemFlowLabel}</span>
                      </>
                    ) : (
                      <>
                        Default flow available: <span className="font-bold text-text-main">{csatSystemFlowLabel}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3 rounded-2xl border border-border-main bg-surface p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-text-muted">
                    Keyword Interrupts
                  </div>
                  <p className="mt-1 text-xs text-text-muted">
                    Match keywords against inbound text and jump into the enabled system flow while preserving the current conversation position.
                  </p>
                  <p className="mt-1 text-[11px] text-text-muted">
                    Each bot owns its own default handoff and CSAT flow copy, so you can customize the wording and buttons per bot without changing another bot.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setBehavior((current) => ({
                      ...current,
                      universalRules: [...current.universalRules, { keywords: "", flowId: "" }],
                    }))
                  }
                  className="inline-flex items-center gap-2 rounded-full border border-border-main bg-canvas px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-text-main transition hover:border-primary/30 hover:bg-primary-fade hover:text-primary"
                >
                  <Plus size={14} />
                  Add Rule
                </button>
              </div>

              <div className="space-y-3">
                {behavior.universalRules.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border-main bg-canvas px-4 py-4 text-xs text-text-muted">
                    No keyword interrupts yet. Add a rule for support, help, agent, or any custom keyword set.
                  </div>
                ) : null}

                {behavior.universalRules.map((rule, index) => (
                  <div
                    key={`${index}-${rule.flowId}`}
                    className="grid gap-3 rounded-2xl border border-border-main bg-canvas p-3 md:grid-cols-[1.2fr_1fr_auto]"
                  >
                    <input
                      type="text"
                      value={rule.keywords}
                      onChange={(e) =>
                        setBehavior((current) => ({
                          ...current,
                          universalRules: current.universalRules.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, keywords: e.target.value } : item
                          ),
                        }))
                      }
                      placeholder="support, help, agent"
                      className="w-full rounded-2xl border border-border-main bg-surface px-4 py-3 text-sm font-semibold text-text-main outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary"
                    />
                    <select
                      value={rule.flowId}
                      onChange={(e) =>
                        setBehavior((current) => ({
                          ...current,
                          universalRules: current.universalRules.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, flowId: e.target.value } : item
                          ),
                        }))
                      }
                      className="w-full rounded-2xl border border-border-main bg-surface px-4 py-3 text-sm font-semibold text-text-main outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary"
                    >
                      <option value="">Select target flow</option>
                      {enabledKeywordTargets.length === 0 ? (
                        <option value="" disabled>
                          Enable a system flow first
                        </option>
                      ) : null}
                      {enabledKeywordTargets.map((flow: any) => (
                        <option key={flow.id} value={flow.id}>
                          {flow.flow_name || flow.name || "Untitled flow"}
                          {flow.system_flow_type ? ` (${flow.system_flow_type.replace(/_/g, " ")})` : ""}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() =>
                        setBehavior((current) => ({
                          ...current,
                          universalRules: current.universalRules.filter((_, itemIndex) => itemIndex !== index),
                        }))
                      }
                      className="inline-flex h-[48px] items-center justify-center rounded-2xl border border-border-main bg-surface px-4 text-text-muted transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                      title="Remove rule"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
          </div>

          <div className="mx-8 mb-4 flex gap-3 rounded-2xl border border-primary/20 bg-primary-fade p-4">
            <Info className="shrink-0 text-primary" size={18} />

            <p className="text-[10px] font-medium text-text-main">
              Platform credentials now belong to campaign channels. Editing a bot
              changes reusable logic metadata and its project attachment.
            </p>
          </div>
          <div className="shrink-0 border-t border-border-main bg-surface px-8 py-4">
            <button
              type="submit"
              disabled={isSaving}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-xs font-black uppercase tracking-widest text-white transition-opacity hover:opacity-90"
            >
              {isSaving ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Save size={16} />
              )}

              {isSaving ? "Applying Changes..." : "Save Bot Configuration"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

