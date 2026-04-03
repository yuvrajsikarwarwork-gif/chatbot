export type FlowLike = {
  id: string;
  is_default?: boolean;
  flow_json: any;
  updated_at?: string;
  created_at?: string;
};

export type TriggerMatchSource = "campaign" | "bot" | "universal";

export type TriggerMatch = {
  flow: FlowLike;
  node: any;
  source: TriggerMatchSource;
};

export interface ResolveUnifiedTriggerMatchDeps {
  campaignId: string | null;
  incomingText: string;
  text: string;
  botId: string;
  projectId?: string | null;
  availableFlows: FlowLike[];
  findCampaignHandoffTriggerFlowMatch: (
    campaignId: string,
    text: string
  ) => Promise<{ flow: FlowLike; node: any } | null>;
  findBotStoredTriggerFlowMatch: (
    botId: string,
    flows: FlowLike[],
    text: string,
    projectId?: string | null
  ) => Promise<{ flow: FlowLike; node: any } | null>;
  findBotUniversalRuleMatch: (
    botId: string,
    text: string
  ) => Promise<{ flowId?: string | null } | null>;
}

export const resolveUnifiedTriggerMatch = async (deps: ResolveUnifiedTriggerMatchDeps) => {
  const campaignMatchedTriggerFlow = deps.campaignId
    ? await deps.findCampaignHandoffTriggerFlowMatch(deps.campaignId, deps.incomingText)
    : null;

  const botKeywordMatchedTriggerFlow = !campaignMatchedTriggerFlow
    ? await deps.findBotStoredTriggerFlowMatch(
        deps.botId,
        deps.availableFlows,
        deps.text,
        deps.projectId || null
      )
    : null;

  const universalMatch =
    !campaignMatchedTriggerFlow && !botKeywordMatchedTriggerFlow
      ? await deps.findBotUniversalRuleMatch(deps.botId, deps.text)
      : null;

  const universalMatchedFlow =
    universalMatch?.flowId
      ? deps.availableFlows.find((flow) => String(flow.id) === String(universalMatch.flowId)) || null
      : null;

  const matchedTriggerFlow =
    campaignMatchedTriggerFlow ||
    botKeywordMatchedTriggerFlow ||
    (universalMatch && universalMatchedFlow
      ? {
          flow: universalMatchedFlow,
          node: null,
          source: "universal" as const,
        }
      : null);

  return {
    campaignMatchedTriggerFlow,
    matchedTriggerFlow,
  };
};
