import { findBotById } from "../models/botModel";

export interface SystemMessages {
  fallbackMessage: string;
  optOutMessage: string;
  goodbyeMessage?: string | null;
}

export interface SystemFlows {
  handoffFlowId: string | null;
  csatFlowId: string | null;
}

export interface KeywordInterruptRule {
  keywords: string[];
  flowId: string | null;
}

export interface BotGlobalSettings {
  systemMessages: SystemMessages;
  systemFlows: SystemFlows;
  keywordInterrupts: KeywordInterruptRule[];
  handoffKeywords: string[];
  globalFallbackNodeId: string | null;
}

export type SystemFlowEventKey = "error" | "handoff" | "conversation_close";

const DEFAULT_SETTINGS: BotGlobalSettings = {
  systemMessages: {
    fallbackMessage: "I didn't quite understand that. Can you rephrase?",
    optOutMessage: "You have been unsubscribed and will no longer receive messages.",
    goodbyeMessage: null,
  },
  systemFlows: {
    handoffFlowId: null,
    csatFlowId: null,
  },
  keywordInterrupts: [],
  handoffKeywords: [],
  globalFallbackNodeId: null,
};

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() || null : null;
}

function readObject(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
}

function mergePlainObjects(...sources: Record<string, any>[]): Record<string, any> {
  const result: Record<string, any> = {};

  for (const source of sources) {
    for (const [key, value] of Object.entries(source || {})) {
      if (Array.isArray(value)) {
        result[key] = value.slice();
        continue;
      }

      if (value && typeof value === "object") {
        const current = result[key];
        result[key] = mergePlainObjects(
          current && typeof current === "object" && !Array.isArray(current) ? (current as Record<string, any>) : {},
          value as Record<string, any>
        );
        continue;
      }

      if (value !== undefined) {
        result[key] = value;
      }
    }
  }

  return result;
}

function readSettingsSource(bot: any) {
  return mergePlainObjects(
    readObject(bot?.settings || {}),
    readObject(bot?.settings_json || {}),
    readObject(bot?.global_settings || {})
  );
}

function readKeywordList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => String(item || "").split(","))
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeKeywordInterrupts(value: unknown): KeywordInterruptRule[] {
  const rules = Array.isArray(value) ? value : [];

  return rules
    .map((rule) => {
      const ruleObject = readObject(rule);
      const keywords = readKeywordList(
        ruleObject.keywords ||
          ruleObject.keyword ||
          ruleObject.trigger_keywords ||
          ruleObject.triggerKeywords
      );
      const flowId = readString(
        ruleObject.flow_id ||
          ruleObject.flowId ||
          ruleObject.target_flow_id ||
          ruleObject.targetFlowId
      );

      return keywords.length > 0 || flowId ? { keywords, flowId } : null;
    })
    .filter(Boolean) as KeywordInterruptRule[];
}

function normalizeHandoffKeywords(...values: unknown[]) {
  return Array.from(
    new Set(
      values.flatMap((value) =>
        readKeywordList(value).map((keyword) => String(keyword || "").trim().toLowerCase())
      )
    )
  ).filter(Boolean);
}

export function normalizeBotGlobalSettings(settingsJson: unknown): BotGlobalSettings {
  const settings = readObject(settingsJson);
  const systemMessages = readObject(
    settings.system_messages || settings.systemMessages || settings.systemDefaultMessages
  );
  const systemFlows = readObject(settings.system_flows || settings.systemFlows);
  const legacySystemDefaultFlows = readObject(
    settings.systemDefaultFlows || settings.system_default_flows
  );
  const handoffFlow = readObject(systemFlows.handoff || systemFlows.handoffFlow || {});

  return {
    systemMessages: {
      fallbackMessage:
        readString(
          systemMessages.fallback_message ||
            systemMessages.fallbackMessage ||
            settings.fallback_message ||
            settings.fallbackMessage ||
            settings.error_message ||
            settings.errorMessage ||
            legacySystemDefaultFlows.fallback_message ||
            legacySystemDefaultFlows.fallbackMessage
        ) || DEFAULT_SETTINGS.systemMessages.fallbackMessage,
      optOutMessage:
        readString(
          systemMessages.opt_out_message ||
            systemMessages.optOutMessage ||
            settings.opt_out_message ||
            settings.optOutMessage ||
            legacySystemDefaultFlows.opt_out_message ||
            legacySystemDefaultFlows.optOutMessage
        ) || DEFAULT_SETTINGS.systemMessages.optOutMessage,
      goodbyeMessage:
        readString(
          systemMessages.goodbye_message ||
            systemMessages.goodbyeMessage ||
            settings.goodbye_message ||
            settings.goodbyeMessage ||
            legacySystemDefaultFlows.goodbye_message ||
            legacySystemDefaultFlows.goodbyeMessage
        ) || DEFAULT_SETTINGS.systemMessages.goodbyeMessage || null,
    },
    systemFlows: {
      handoffFlowId:
        readString(
          systemFlows.handoff_flow_id ||
            systemFlows.handoffFlowId ||
            settings.handoff_flow_id ||
            settings.handoffFlowId ||
            legacySystemDefaultFlows.handoff_flow_id ||
            legacySystemDefaultFlows.handoffFlowId
        ) || DEFAULT_SETTINGS.systemFlows.handoffFlowId,
      csatFlowId:
        readString(
          systemFlows.csat_flow_id ||
            systemFlows.csatFlowId ||
            settings.csat_flow_id ||
            settings.csatFlowId ||
            settings.conversationCloseFlowId ||
            settings.conversation_close_flow_id ||
            legacySystemDefaultFlows.csat_flow_id ||
            legacySystemDefaultFlows.csatFlowId ||
            legacySystemDefaultFlows.conversationCloseFlowId ||
            legacySystemDefaultFlows.conversation_close_flow_id
        ) || DEFAULT_SETTINGS.systemFlows.csatFlowId,
    },
    keywordInterrupts: normalizeKeywordInterrupts(
      settings.keyword_interrupts ||
        settings.keywordInterrupts ||
        settings.universal_rules ||
        settings.universalRules ||
        legacySystemDefaultFlows.keyword_interrupts ||
        legacySystemDefaultFlows.universal_rules ||
        legacySystemDefaultFlows.universalRules ||
        []
    ),
    handoffKeywords: normalizeHandoffKeywords(
      settings.handoff_keywords,
      settings.handoffKeywords,
      systemFlows.handoff_keywords,
      systemFlows.handoffKeywords,
      handoffFlow.keywords,
      handoffFlow.triggerKeywords,
      handoffFlow.trigger_keywords,
      settings.system_flow_rules?.handoff_keywords,
      settings.system_flow_rules?.keywords,
      settings.system_flow_rules?.trigger_keywords,
      settings.systemFlowRules?.handoff_keywords,
      settings.systemFlowRules?.keywords,
      settings.systemFlowRules?.trigger_keywords
    ),
    globalFallbackNodeId:
      readString(
        settings.global_fallback_node_id ||
          settings.globalFallbackNodeId ||
          settings.system_fallback_node_id ||
          settings.systemFallbackNodeId ||
          settings.error_node_id ||
          settings.errorNodeId ||
          settings.fallback_node_id ||
          settings.fallbackNodeId ||
          legacySystemDefaultFlows.global_fallback_node_id ||
          legacySystemDefaultFlows.globalFallbackNodeId ||
          legacySystemDefaultFlows.error_node_id ||
          legacySystemDefaultFlows.errorNodeId ||
          legacySystemDefaultFlows.fallback_node_id ||
          legacySystemDefaultFlows.fallbackNodeId
      ) || DEFAULT_SETTINGS.globalFallbackNodeId,
  };
}

export async function getBotGlobalSettings(botId: string): Promise<BotGlobalSettings> {
  const bot = await findBotById(botId);
  if (!bot) {
    return DEFAULT_SETTINGS;
  }

  return normalizeBotGlobalSettings(readSettingsSource(bot));
}

export async function getBotSystemMessages(botId: string): Promise<SystemMessages> {
  const settings = await getBotGlobalSettings(botId);
  return settings.systemMessages;
}

export async function getBotSystemFlowId(
  botId: string,
  eventKey: SystemFlowEventKey
): Promise<string | null> {
  const settings = await getBotGlobalSettings(botId);
  if (eventKey === "handoff") {
    return settings.systemFlows.handoffFlowId;
  }

  if (eventKey === "conversation_close") {
    return settings.systemFlows.csatFlowId;
  }

  return null;
}

export async function findBotUniversalRuleMatch(
  botId: string,
  text: string
): Promise<{ flowId: string | null; keywords: string[] } | null> {
  const settings = await getBotGlobalSettings(botId);
  const normalizedText = String(text || "").toLowerCase();
  if (!normalizedText) {
    return null;
  }

  for (const rule of settings.keywordInterrupts) {
    if (!rule.flowId || rule.keywords.length === 0) {
      continue;
    }

    const matched = rule.keywords.some((keyword) =>
      normalizedText.includes(String(keyword).toLowerCase())
    );
    if (matched) {
      return {
        flowId: rule.flowId,
        keywords: rule.keywords,
      };
    }
  }

  return null;
}
