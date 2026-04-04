import { query } from "../config/db";
import { findFlowById } from "../models/flowModel";
import { triggerFlowExternally } from "./flowEngine";
import { upsertContactWithIdentity } from "./contactIdentityService";

export type CampaignAutomationRuleType = "date" | "webhook" | "cron";

export type CampaignAutomationBranch = {
  id: string;
  label?: string | null;
  matchValue?: string | null;
  flowId?: string | null;
  enabled?: boolean;
};

export type CampaignAutomationActionType = "start_flow" | "update_lead_status" | "add_note" | "tag_lead";

export type CampaignAutomationAction = {
  id: string;
  type: CampaignAutomationActionType;
  flowId?: string | null;
  leadStatus?: string | null;
  note?: string | null;
  tag?: string | null;
  enabled?: boolean;
};

export type CampaignAutomationRule = {
  id: string;
  name: string;
  enabled: boolean;
  type: CampaignAutomationRuleType;
  flowId?: string | null;
  dateFieldKey?: string | null;
  branchFieldKey?: string | null;
  cronEveryMinutes?: number | null;
  webhookSecret?: string | null;
  webhookSecretHeader?: string | null;
  webhookPath?: string | null;
  matchValue?: string | null;
  notes?: string | null;
  lastRunAt?: string | null;
  lastRunCount?: number | null;
  filters?: Record<string, unknown>;
  branches?: CampaignAutomationBranch[];
  actions?: CampaignAutomationAction[];
};

export type CampaignAutomationVersion = {
  id: string;
  label: string;
  notes?: string | null;
  status: "draft" | "pending" | "approved" | "rejected";
  sourceRuleId?: string | null;
  sourceRuleName?: string | null;
  createdAt: string;
  updatedAt: string;
  snapshot: {
    automation_rules: CampaignAutomationRule[];
    workflow_canvas: Record<string, unknown>;
    automation_state: Record<string, unknown>;
  };
};

function parseMetadata(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function parseRules(metadata: Record<string, unknown>) {
  const rawRules = Array.isArray(metadata.automation_rules) ? metadata.automation_rules : [];
  return rawRules
    .map((item: any, index: number) => {
      const type = String(item?.type || "date").trim().toLowerCase();
      const normalizedType: CampaignAutomationRuleType =
        type === "webhook" || type === "cron" ? type : "date";

      return {
        id: String(item?.id || `rule-${index + 1}`).trim(),
        name: String(item?.name || `Rule ${index + 1}`).trim(),
        enabled: item?.enabled !== false,
        type: normalizedType,
        flowId: String(item?.flowId || item?.flow_id || "").trim() || null,
        dateFieldKey: String(item?.dateFieldKey || item?.date_field_key || "").trim() || null,
        branchFieldKey: String(item?.branchFieldKey || item?.branch_field_key || "").trim() || null,
        cronEveryMinutes: Number.isFinite(Number(item?.cronEveryMinutes || item?.cron_every_minutes))
          ? Number(item?.cronEveryMinutes || item?.cron_every_minutes)
          : null,
        webhookSecret: String(item?.webhookSecret || item?.secret || "").trim() || null,
        webhookSecretHeader: String(item?.webhookSecretHeader || "x-automation-secret").trim() || "x-automation-secret",
        webhookPath: String(item?.webhookPath || "").trim() || null,
        matchValue: String(item?.matchValue || item?.match_value || "").trim() || null,
        notes: String(item?.notes || "").trim() || null,
        lastRunAt: String(item?.lastRunAt || item?.last_run_at || "").trim() || null,
        lastRunCount: Number.isFinite(Number(item?.lastRunCount || item?.last_run_count))
          ? Number(item?.lastRunCount || item?.last_run_count)
          : null,
        filters: parseMetadata(item?.filters),
        branches: parseAutomationArray<CampaignAutomationBranch>(item?.branches).map((branch: any, branchIndex: number) => ({
          id: String(branch?.id || `branch-${index + 1}-${branchIndex + 1}`).trim(),
          label: String(branch?.label || `Branch ${branchIndex + 1}`).trim(),
          matchValue: String(branch?.matchValue || branch?.match_value || "").trim() || null,
          flowId: String(branch?.flowId || branch?.flow_id || "").trim() || null,
          enabled: branch?.enabled !== false,
        })),
        actions: parseAutomationArray<CampaignAutomationAction>(item?.actions).map((action: any, actionIndex: number) => ({
          id: String(action?.id || `action-${index + 1}-${actionIndex + 1}`).trim(),
          type: String(action?.type || "start_flow").trim() as CampaignAutomationActionType,
          flowId: String(action?.flowId || action?.flow_id || "").trim() || null,
          leadStatus: String(action?.leadStatus || action?.lead_status || "").trim() || null,
          note: String(action?.note || "").trim() || null,
          tag: String(action?.tag || "").trim() || null,
          enabled: action?.enabled !== false,
        })),
      } as CampaignAutomationRule;
    })
    .filter((rule) => Boolean(rule.id));
}

function normalizeAutomationVersions(metadata: Record<string, unknown>) {
  const raw = Array.isArray(metadata.automation_versions) ? metadata.automation_versions : [];
  return raw
    .map((item: any, index: number) => ({
      id: String(item?.id || `version-${index + 1}`).trim(),
      label: String(item?.label || `Version ${index + 1}`).trim(),
      notes: String(item?.notes || "").trim() || null,
      status: String(item?.status || "draft").trim().toLowerCase(),
      sourceRuleId: String(item?.sourceRuleId || item?.source_rule_id || "").trim() || null,
      sourceRuleName: String(item?.sourceRuleName || item?.source_rule_name || "").trim() || null,
      createdAt: String(item?.createdAt || item?.created_at || new Date().toISOString()).trim(),
      updatedAt: String(item?.updatedAt || item?.updated_at || item?.createdAt || new Date().toISOString()).trim(),
      snapshot:
        item?.snapshot && typeof item.snapshot === "object"
          ? {
              automation_rules: parseAutomationArray<CampaignAutomationRule>(item.snapshot.automation_rules).map(
                (rule: any) => ({
                  ...rule,
                  branches: parseAutomationArray<CampaignAutomationBranch>(rule?.branches),
                  actions: parseAutomationArray<CampaignAutomationAction>(rule?.actions),
                })
              ),
              workflow_canvas:
                item.snapshot.workflow_canvas && typeof item.snapshot.workflow_canvas === "object"
                  ? (item.snapshot.workflow_canvas as Record<string, unknown>)
                  : {},
              automation_state:
                item.snapshot.automation_state && typeof item.snapshot.automation_state === "object"
                  ? (item.snapshot.automation_state as Record<string, unknown>)
                  : {},
            }
          : {
              automation_rules: [],
              workflow_canvas: {},
              automation_state: {},
            },
    }))
    .filter((item) => Boolean(item.id));
}

function cloneRuleWithFreshIds(rule: CampaignAutomationRule) {
  const cloneId = `rule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const branches = parseAutomationArray<CampaignAutomationBranch>(rule.branches).map((branch, index) => ({
    ...branch,
    id: `branch-${Date.now()}-${index + 1}-${Math.random().toString(36).slice(2, 6)}`,
  }));
  const actions = parseAutomationArray<CampaignAutomationAction>(rule.actions).map((action, index) => ({
    ...action,
    id: `action-${Date.now()}-${index + 1}-${Math.random().toString(36).slice(2, 6)}`,
  }));

  return {
    ...rule,
    id: cloneId,
    name: `${rule.name} Copy`,
    enabled: false,
    branches: branches.length ? branches : [{ id: `branch-${Date.now()}-1`, label: "Branch", matchValue: "", flowId: "", enabled: true }],
    actions: actions.length ? actions : [{ id: `action-${Date.now()}-1`, type: "start_flow", flowId: "", leadStatus: "qualified", note: "", tag: "", enabled: true }],
  } as CampaignAutomationRule;
}

function compareAutomationSnapshots(
  current: ReturnType<typeof buildAutomationVersionSnapshot>,
  previous?: ReturnType<typeof buildAutomationVersionSnapshot> | null
) {
  if (!previous) {
    return {
      rulesAdded: current.automation_rules.length,
      rulesRemoved: 0,
      rulesChanged: 0,
      branchesChanged: 0,
      actionsChanged: 0,
      note: "Initial automation snapshot.",
    };
  }

  const currentById = new Map(current.automation_rules.map((rule) => [rule.id, rule]));
  const previousById = new Map(previous.automation_rules.map((rule) => [rule.id, rule]));
  let rulesAdded = 0;
  let rulesRemoved = 0;
  let rulesChanged = 0;
  let branchesChanged = 0;
  let actionsChanged = 0;

  for (const [id, currentRule] of currentById) {
    const previousRule = previousById.get(id);
    if (!previousRule) {
      rulesAdded += 1;
      continue;
    }

    const currentBranches = JSON.stringify(currentRule.branches || []);
    const previousBranches = JSON.stringify(previousRule.branches || []);
    const currentActions = JSON.stringify(currentRule.actions || []);
    const previousActions = JSON.stringify(previousRule.actions || []);
    const currentRuleCore = JSON.stringify({
      ...currentRule,
      branches: undefined,
      actions: undefined,
    });
    const previousRuleCore = JSON.stringify({
      ...previousRule,
      branches: undefined,
      actions: undefined,
    });

    if (currentRuleCore !== previousRuleCore) {
      rulesChanged += 1;
    }
    if (currentBranches !== previousBranches) {
      branchesChanged += 1;
    }
    if (currentActions !== previousActions) {
      actionsChanged += 1;
    }
  }

  for (const [id] of previousById) {
    if (!currentById.has(id)) {
      rulesRemoved += 1;
    }
  }

  return {
    rulesAdded,
    rulesRemoved,
    rulesChanged,
    branchesChanged,
    actionsChanged,
    note:
      rulesAdded || rulesRemoved || rulesChanged || branchesChanged || actionsChanged
        ? "Automation snapshot differs from the previous saved version."
        : "No structural changes detected.",
  };
}

function formatDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function toTrimmedString(value: unknown) {
  return String(value || "").trim();
}

function parseAutomationArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function readLeadField(lead: any, fieldKey?: string | null) {
  const key = String(fieldKey || "").trim();
  if (!key) {
    return "";
  }

  const lowerKey = key.toLowerCase();
  const sources = [
    lead?.custom_variables,
    lead?.variables,
    lead,
  ];

  for (const source of sources) {
    if (!source || typeof source !== "object") {
      continue;
    }

    const direct = (source as Record<string, unknown>)[key];
    if (direct !== undefined && direct !== null && String(direct).trim() !== "") {
      return String(direct).trim();
    }

    const lowered = (source as Record<string, unknown>)[lowerKey];
    if (lowered !== undefined && lowered !== null && String(lowered).trim() !== "") {
      return String(lowered).trim();
    }
  }

  return "";
}

function matchesRuleFilters(rule: CampaignAutomationRule, lead: any) {
  const filters = rule.filters && typeof rule.filters === "object" ? rule.filters : {};
  const platformFilter = toTrimmedString((filters as Record<string, unknown>).platform).toLowerCase();
  const statusFilter = toTrimmedString((filters as Record<string, unknown>).status).toLowerCase();
  const sourceTypeFilter = toTrimmedString((filters as Record<string, unknown>).sourceType).toLowerCase();
  const listIdFilter = toTrimmedString((filters as Record<string, unknown>).listId || (filters as Record<string, unknown>).list_id).toLowerCase();
  const listKeyFilter = toTrimmedString((filters as Record<string, unknown>).listKey || (filters as Record<string, unknown>).list_key).toLowerCase();
  const listNameFilter = toTrimmedString((filters as Record<string, unknown>).listName || (filters as Record<string, unknown>).list_name).toLowerCase();
  const matchValueFilter = toTrimmedString((filters as Record<string, unknown>).matchValue || (filters as Record<string, unknown>).match_value);

  if (platformFilter && toTrimmedString(lead?.platform).toLowerCase() !== platformFilter) {
    return false;
  }
  if (statusFilter && toTrimmedString(lead?.status).toLowerCase() !== statusFilter) {
    return false;
  }
  if (sourceTypeFilter && toTrimmedString(lead?.source_type).toLowerCase() !== sourceTypeFilter) {
    return false;
  }
  if (listIdFilter && toTrimmedString(lead?.list_id).toLowerCase() !== listIdFilter) {
    return false;
  }
  if (listKeyFilter && toTrimmedString(lead?.list_key).toLowerCase() !== listKeyFilter) {
    return false;
  }
  if (listNameFilter && toTrimmedString(lead?.list_name).toLowerCase() !== listNameFilter) {
    return false;
  }
  if (matchValueFilter) {
    const branchValue = readLeadField(lead, String(rule.branchFieldKey || rule.dateFieldKey || rule.matchValue || ""));
    if (branchValue && branchValue.toLowerCase() !== matchValueFilter.toLowerCase()) {
      return false;
    }
  }

  return true;
}

function pickBranchFlowId(rule: CampaignAutomationRule, lead: any, campaign: any) {
  const branchFieldKey = String(rule.branchFieldKey || rule.matchValue || rule.dateFieldKey || "").trim();
  const branchValue = readLeadField(lead, branchFieldKey);
  const branches = parseAutomationArray<CampaignAutomationBranch>(rule.branches);

  if (branchValue && branches.length > 0) {
    const matched = branches.find((branch) => {
      if (branch?.enabled === false) {
        return false;
      }
      const matchValue = String(branch?.matchValue || "").trim();
      return Boolean(matchValue) && matchValue.toLowerCase() === branchValue.toLowerCase();
    });
    if (matched?.flowId) {
      return String(matched.flowId).trim();
    }
  }

  return String(rule.flowId || campaign.default_flow_id || "").trim();
}

function extractCronIntervalMinutes(rule: CampaignAutomationRule) {
  const filters = (rule.filters && typeof rule.filters === "object" ? rule.filters : {}) as Record<string, unknown>;
  const interval = Number(rule.cronEveryMinutes || filters.cronEveryMinutes || filters.cron_interval_minutes || 60);
  if (!Number.isFinite(interval) || interval <= 0) {
    return 60;
  }
  return Math.max(10, Math.floor(interval));
}

async function resolveRuleFlow(rule: CampaignAutomationRule, campaign: any, lead?: any) {
  const flowId = pickBranchFlowId(rule, lead || {}, campaign);
  if (!flowId) {
    return null;
  }

  const flow = await findFlowById(flowId);
  if (!flow || String(flow.is_active || true) !== "true") {
    return null;
  }

  if (!flow.bot_id) {
    return null;
  }

  return flow;
}

async function triggerLeadAutomationFlow(input: {
  flow: any;
  campaign: any;
  lead: any;
  rule: CampaignAutomationRule;
  io?: any;
  extraVariables?: Record<string, unknown>;
}) {
  const contactId = String(input.lead.contact_id || "").trim();
  let contact = null;

  if (contactId) {
    const contactRes = await query(
      `SELECT id, platform_user_id, name, phone, email
       FROM contacts
       WHERE id = $1
       LIMIT 1`,
      [contactId]
    );
    contact = contactRes.rows[0] || null;
  }

  if (!contact) {
    const resolvedPlatformUserId =
      String(input.lead.phone || input.lead.email || input.lead.platform_user_id || "").trim();
    if (!resolvedPlatformUserId) {
      return { skipped: true };
    }

    contact = await upsertContactWithIdentity({
      botId: input.flow.bot_id,
      workspaceId: input.campaign.workspace_id || null,
      platform: String(input.lead.platform || input.campaign.platform || "whatsapp"),
      platformUserId: resolvedPlatformUserId,
      name: input.lead.name || input.lead.company_name || null,
      phone: input.lead.phone || null,
      email: input.lead.email || null,
    });
  }

  const variables = {
    ...(input.lead.custom_variables && typeof input.lead.custom_variables === "object"
      ? input.lead.custom_variables
      : {}),
    ...(input.lead.variables && typeof input.lead.variables === "object" ? input.lead.variables : {}),
    ...(input.extraVariables || {}),
    automation_rule_id: input.rule.id,
    automation_rule_name: input.rule.name,
    automation_campaign_id: input.campaign.id,
    automation_campaign_name: input.campaign.name,
    automation_trigger_type: input.rule.type,
    automation_triggered_at: new Date().toISOString(),
  };

  const result = await triggerFlowExternally({
    botId: input.flow.bot_id,
    flowId: input.flow.id,
    contactId: contact.id,
    platform: String(input.lead.platform || input.campaign.platform || "whatsapp"),
    phone: input.lead.phone || contact.phone || null,
    email: input.lead.email || contact.email || null,
    contactName: input.lead.name || contact.name || null,
    variables,
    context: {
      workspaceId: input.campaign.workspace_id || null,
      projectId: input.campaign.project_id || null,
      campaignId: input.campaign.id,
      listId: input.lead.list_id || null,
      entryPointId: input.lead.entry_point_id || null,
      channelId: input.lead.channel_id || null,
      entryKey: String(input.rule.id || "").trim(),
    },
    io: input.io,
    authType: "machine",
    authSourceName: "Automation",
  });

  return result;
}

async function runAutomationActions(input: {
  campaign: any;
  lead: any;
  rule: CampaignAutomationRule;
  io?: any;
  flow?: any | null;
  extraVariables?: Record<string, unknown>;
}) {
  const actions = parseAutomationArray<CampaignAutomationAction>(input.rule.actions).filter(
    (action) => action?.enabled !== false
  );

  const flowToTrigger =
    input.flow ||
    (await resolveRuleFlow(input.rule, input.campaign, input.lead).catch(() => null));

  const startFlowActions = actions.filter((action) => action.type === "start_flow");
  const actionStartFlowIds = startFlowActions
    .map((action) => String(action.flowId || "").trim())
    .filter(Boolean);

  if (flowToTrigger && actionStartFlowIds.length === 0) {
    await triggerLeadAutomationFlow({
      flow: flowToTrigger,
      campaign: input.campaign,
      lead: input.lead,
      rule: input.rule,
      io: input.io,
      ...(input.extraVariables ? { extraVariables: input.extraVariables } : {}),
    });
  }

  for (const action of actions) {
    try {
      if (action.type === "start_flow") {
        const explicitFlowId = String(action.flowId || "").trim();
        if (!explicitFlowId) {
          continue;
        }

        const actionFlow = await findFlowById(explicitFlowId);
        if (!actionFlow || String(actionFlow.is_active || true) !== "true" || !actionFlow.bot_id) {
          continue;
        }

        await triggerLeadAutomationFlow({
          flow: actionFlow,
          campaign: input.campaign,
          lead: input.lead,
          rule: input.rule,
          io: input.io,
          extraVariables: {
            ...(input.extraVariables || {}),
            automation_action_id: action.id,
            automation_action_type: action.type,
          },
        });
        continue;
      }

      if (action.type === "update_lead_status") {
        const nextStatus = String(action.leadStatus || "").trim().toLowerCase();
        if (!nextStatus) {
          continue;
        }

        await query(
          `UPDATE leads
           SET status = $2,
               updated_at = NOW()
           WHERE id = $1
             AND deleted_at IS NULL`,
          [input.lead.id, nextStatus]
        );
        continue;
      }

      if (action.type === "add_note") {
        const note = String(action.note || "").trim();
        if (!note) {
          continue;
        }

        await query(
          `UPDATE leads
           SET notes = CASE
             WHEN COALESCE(notes, '') = '' THEN $2
             ELSE notes || E'\n' || $2
           END,
               updated_at = NOW()
           WHERE id = $1
             AND deleted_at IS NULL`,
          [input.lead.id, note]
        );
        continue;
      }

      if (action.type === "tag_lead") {
        const tag = String(action.tag || "").trim();
        if (!tag) {
          continue;
        }

        await query(
          `UPDATE leads
           SET custom_variables = jsonb_set(
             COALESCE(custom_variables, '{}'::jsonb),
             '{automation_tags}',
             CASE
               WHEN COALESCE(custom_variables->'automation_tags', '[]'::jsonb) ? $2
                 THEN COALESCE(custom_variables->'automation_tags', '[]'::jsonb)
               ELSE COALESCE(custom_variables->'automation_tags', '[]'::jsonb) || to_jsonb(ARRAY[$2]::text[])
             END,
             true
           ),
               updated_at = NOW()
           WHERE id = $1
             AND deleted_at IS NULL`,
          [input.lead.id, tag]
        );
      }
    } catch (err) {
      console.error("Campaign automation action failed", {
        campaignId: input.campaign?.id,
        leadId: input.lead?.id,
        actionId: action.id,
        error: err,
      });
    }
  }

  return {
    startedFlows: flowToTrigger ? 1 : 0,
    explicitFlowActionCount: actionStartFlowIds.length,
    actionCount: actions.length,
  };
}

function normalizeAutomationHistory(metadata: Record<string, unknown>) {
  const raw = Array.isArray(metadata.automation_history) ? metadata.automation_history : [];
  return raw
    .map((item: any, index: number) => ({
      id: String(item?.id || `history-${index + 1}`).trim(),
      ruleId: String(item?.ruleId || item?.rule_id || "").trim(),
      ruleName: String(item?.ruleName || item?.rule_name || "").trim(),
      leadId: String(item?.leadId || item?.lead_id || "").trim(),
      leadName: String(item?.leadName || item?.lead_name || "").trim(),
      triggerType: String(item?.triggerType || item?.trigger_type || "").trim(),
      status: String(item?.status || "completed").trim().toLowerCase(),
      summary: String(item?.summary || "").trim(),
      error: String(item?.error || "").trim(),
      createdAt: String(item?.createdAt || item?.created_at || new Date().toISOString()).trim(),
      updatedAt: String(item?.updatedAt || item?.updated_at || item?.createdAt || new Date().toISOString()).trim(),
      retryCount: Number.isFinite(Number(item?.retryCount || item?.retry_count)) ? Number(item?.retryCount || item?.retry_count) : 0,
      payload: item?.payload && typeof item.payload === "object" ? item.payload : {},
    }))
    .filter((item) => Boolean(item.ruleId));
}

async function writeCampaignAutomationMetadata(campaignId: string, metadata: Record<string, unknown>) {
  await query(
    `UPDATE campaigns
     SET metadata = $2::jsonb,
         updated_at = NOW()
     WHERE id = $1`,
    [campaignId, JSON.stringify(metadata)]
  );
}

function buildAutomationVersionSnapshot(metadata: Record<string, unknown>) {
  const automation_rules = parseRules(metadata);
  const workflow_canvas =
    metadata.workflow_canvas && typeof metadata.workflow_canvas === "object"
      ? (metadata.workflow_canvas as Record<string, unknown>)
      : {};
  const automation_state =
    metadata.automation_state && typeof metadata.automation_state === "object"
      ? (metadata.automation_state as Record<string, unknown>)
      : {};

  return {
    automation_rules,
    workflow_canvas,
    automation_state,
  };
}

async function appendAutomationHistoryEntry(input: {
  campaignId: string;
  metadata: Record<string, unknown>;
  entry: Record<string, unknown>;
}) {
  const history = normalizeAutomationHistory(input.metadata);
  const nextEntry = {
    id: String(input.entry.id || `history-${Date.now()}`).trim(),
    ruleId: String(input.entry.ruleId || "").trim(),
    ruleName: String(input.entry.ruleName || "").trim(),
    leadId: String(input.entry.leadId || "").trim(),
    leadName: String(input.entry.leadName || "").trim(),
    triggerType: String(input.entry.triggerType || "").trim(),
    status: String(input.entry.status || "completed").trim().toLowerCase(),
    summary: String(input.entry.summary || "").trim(),
    error: String(input.entry.error || "").trim(),
    retryCount: Number.isFinite(Number(input.entry.retryCount || 0)) ? Number(input.entry.retryCount || 0) : 0,
    payload: input.entry.payload && typeof input.entry.payload === "object" ? input.entry.payload : {},
    createdAt: String(input.entry.createdAt || new Date().toISOString()).trim(),
    updatedAt: String(input.entry.updatedAt || input.entry.createdAt || new Date().toISOString()).trim(),
  };

  const nextHistory = [nextEntry, ...history].slice(0, 100);
  const nextMetadata = {
    ...input.metadata,
    automation_history: nextHistory,
  };

  await writeCampaignAutomationMetadata(input.campaignId, nextMetadata);
  return nextHistory;
}

async function appendAutomationVersionEntry(input: {
  campaignId: string;
  metadata: Record<string, unknown>;
  entry: Record<string, unknown>;
}) {
  const versions = normalizeAutomationVersions(input.metadata);
  const nextEntry = {
    id: String(input.entry.id || `version-${Date.now()}`).trim(),
    label: String(input.entry.label || `Version ${versions.length + 1}`).trim(),
    notes: String(input.entry.notes || "").trim() || null,
    status: String(input.entry.status || "draft").trim().toLowerCase(),
    sourceRuleId: String(input.entry.sourceRuleId || "").trim() || null,
    sourceRuleName: String(input.entry.sourceRuleName || "").trim() || null,
    createdAt: String(input.entry.createdAt || new Date().toISOString()).trim(),
    updatedAt: String(input.entry.updatedAt || input.entry.createdAt || new Date().toISOString()).trim(),
    snapshot:
      input.entry.snapshot && typeof input.entry.snapshot === "object"
        ? input.entry.snapshot
        : buildAutomationVersionSnapshot(input.metadata),
  };

  const nextVersions = [nextEntry, ...versions].slice(0, 50);
  const nextMetadata = {
    ...input.metadata,
    automation_versions: nextVersions,
  };

  await writeCampaignAutomationMetadata(input.campaignId, nextMetadata);
  return nextVersions;
}

export async function processCampaignAutomationRulesService(io?: any) {
  const campaignsRes = await query(
    `SELECT id, name, slug, workspace_id, project_id, default_flow_id, metadata
     FROM campaigns
     WHERE deleted_at IS NULL
       AND metadata IS NOT NULL
       AND metadata ? 'automation_rules'`
  );

  const today = formatDateKey();
  let processedRules = 0;
  let processedLeads = 0;

  for (const campaign of campaignsRes.rows) {
    const metadata = parseMetadata(campaign.metadata);
    const rules = parseRules(metadata);
    if (rules.length === 0) {
      continue;
    }

    const automationState =
      metadata.automation_state && typeof metadata.automation_state === "object"
        ? (metadata.automation_state as Record<string, unknown>)
        : {};
    let campaignChanged = false;
    const leadRowsRes = await query(
      `SELECT l.*, ct.name AS contact_name, ct.phone AS contact_phone, ct.email AS contact_email, ct.platform_user_id
       FROM leads l
       LEFT JOIN contacts ct ON ct.id = l.contact_id
       WHERE l.campaign_id = $1
         AND l.deleted_at IS NULL`,
      [campaign.id]
    );
    const campaignLeads = leadRowsRes.rows || [];

    for (const rule of rules) {
      if (!rule.enabled) {
        continue;
      }

      const state = automationState[rule.id] && typeof automationState[rule.id] === "object"
        ? (automationState[rule.id] as Record<string, unknown>)
        : {};
      const matchesCronWindow =
        rule.type !== "cron" ||
        !state.lastRunAt ||
        (() => {
          const lastRunAt = new Date(String(state.lastRunAt || ""));
          const elapsedMinutes = (Date.now() - lastRunAt.getTime()) / (1000 * 60);
          return elapsedMinutes >= extractCronIntervalMinutes(rule);
        })();
      if (!matchesCronWindow) {
        continue;
      }

      let targetLeads = campaignLeads.filter((lead: any) => matchesRuleFilters(rule, lead));
      if (rule.type === "date") {
        const fieldKey = String(rule.dateFieldKey || "next_service_date").trim();
        targetLeads = targetLeads.filter((lead: any) => {
          const value = readLeadField(lead, fieldKey);
          const normalized = value.slice(0, 10);
          return normalized === today || (normalized && normalized <= today);
        });
      }

      if (targetLeads.length === 0) {
        automationState[rule.id] = {
          ...state,
          lastRunDate: today,
          lastRunCount: 0,
          lastRunAt: new Date().toISOString(),
        };
        await appendAutomationHistoryEntry({
          campaignId: campaign.id,
          metadata,
          entry: {
            ruleId: rule.id,
            ruleName: rule.name,
            triggerType: rule.type,
            status: "skipped",
            summary: "No matching leads found for this automation window.",
            payload: {
              leadCount: 0,
              triggerType: rule.type,
            },
          },
        });
        campaignChanged = true;
        continue;
      }

      let ruleRunCount = 0;
      for (const lead of targetLeads) {
        try {
          const flow = await resolveRuleFlow(rule, campaign, lead);
          const extraVariables: Record<string, unknown> = {
            automation_rule_id: rule.id,
            automation_rule_name: rule.name,
            automation_campaign_id: campaign.id,
            automation_campaign_name: campaign.name,
            automation_trigger_type: rule.type,
            automation_triggered_at: new Date().toISOString(),
          };
          if (rule.type === "date") {
            extraVariables.automation_due_field = String(rule.dateFieldKey || "next_service_date");
            extraVariables.automation_due_value = readLeadField(lead, rule.dateFieldKey || "next_service_date");
          }
          if (rule.type === "cron") {
            extraVariables.automation_cron_interval_minutes = extractCronIntervalMinutes(rule);
          }
          await runAutomationActions({
            campaign,
            lead,
            rule,
            io,
            flow,
            extraVariables,
          });
          ruleRunCount += 1;
          processedLeads += 1;
          await appendAutomationHistoryEntry({
            campaignId: campaign.id,
            metadata,
            entry: {
              ruleId: rule.id,
              ruleName: rule.name,
              leadId: lead.id,
              leadName: lead.name || lead.contact_name || lead.company_name || "",
              triggerType: rule.type,
              status: "completed",
              summary: `Automation executed for ${lead.name || lead.contact_name || lead.company_name || lead.id}.`,
              payload: {
                leadId: lead.id,
                flowId: flow?.id || null,
                triggerType: rule.type,
              },
            },
          });
        } catch (err) {
          console.error("Campaign automation lead execution failed", err);
          await appendAutomationHistoryEntry({
            campaignId: campaign.id,
            metadata,
            entry: {
              ruleId: rule.id,
              ruleName: rule.name,
              leadId: lead.id,
              leadName: lead.name || lead.contact_name || lead.company_name || "",
              triggerType: rule.type,
              status: "failed",
              summary: "Automation execution failed.",
              error: String((err as any)?.message || err || "Unknown error"),
              payload: {
                leadId: lead.id,
                triggerType: rule.type,
              },
            },
          });
        }
      }

      automationState[rule.id] = {
        ...state,
        lastRunDate: today,
        lastRunCount: ruleRunCount,
        lastRunAt: new Date().toISOString(),
      };
      processedRules += 1;
      campaignChanged = true;
    }

    if (campaignChanged) {
      const nextMetadata = {
        ...metadata,
        automation_state: automationState,
      };
      await query(
        `UPDATE campaigns
         SET metadata = $2::jsonb,
             updated_at = NOW()
         WHERE id = $1`,
        [campaign.id, JSON.stringify(nextMetadata)]
      );
    }
  }

  return { processedRules, processedLeads };
}

export async function executeCampaignWebhookAutomationService(input: {
  campaignId: string;
  ruleId: string;
  secret?: string | null;
  contactId?: string | null;
  leadId?: string | null;
  platformUserId?: string | null;
  phone?: string | null;
  email?: string | null;
  contactName?: string | null;
  variables?: Record<string, unknown>;
  io?: any;
}) {
  const campaignRes = await query(
    `SELECT id, name, slug, workspace_id, project_id, default_flow_id, metadata
     FROM campaigns
     WHERE id = $1
       AND deleted_at IS NULL
     LIMIT 1`,
    [input.campaignId]
  );

  const campaign = campaignRes.rows[0];
  if (!campaign) {
    throw { status: 404, message: "Campaign not found" };
  }

  const metadata = parseMetadata(campaign.metadata);
  const rules = parseRules(metadata);
  const rule = rules.find((item) => item.id === input.ruleId);
  if (!rule) {
    throw { status: 404, message: "Automation rule not found" };
  }
  if (!rule.enabled) {
    throw { status: 400, message: "Automation rule is disabled" };
  }
  if (rule.type !== "webhook") {
    throw { status: 400, message: "Automation rule is not webhook-triggered" };
  }
  if (rule.webhookSecret && String(input.secret || "").trim() !== rule.webhookSecret) {
    throw { status: 401, message: "Invalid automation secret" };
  }

  let lead = null;
  if (input.leadId) {
    const leadRes = await query(
      `SELECT l.*, ct.phone AS contact_phone, ct.email AS contact_email, ct.name AS contact_name
       FROM leads l
       LEFT JOIN contacts ct ON ct.id = l.contact_id
       WHERE l.id = $1
         AND l.deleted_at IS NULL
       LIMIT 1`,
      [input.leadId]
    );
    lead = leadRes.rows[0] || null;
  }

  if (!lead) {
    const leadContact = input.contactId
      ? await query(`SELECT id FROM contacts WHERE id = $1 LIMIT 1`, [input.contactId])
      : null;
    if (leadContact?.rows?.[0]?.id) {
      lead = {
        id: `contact:${leadContact.rows[0].id}`,
        contact_id: leadContact.rows[0].id,
        platform: "whatsapp",
        custom_variables: {},
        variables: {},
      };
    }
  }

  const flow = await resolveRuleFlow(rule, campaign, lead);
  if (!flow && parseAutomationArray<CampaignAutomationAction>(rule.actions).length === 0) {
    throw { status: 409, message: "Automation rule needs an active flow" };
  }

  if (!lead) {
    const resolvedPlatformUserId =
      String(input.platformUserId || input.phone || input.email || "").trim();
    if (!resolvedPlatformUserId) {
      throw { status: 400, message: "Provide a leadId, contactId, or contact identity to run the webhook automation" };
    }

    const contact = await upsertContactWithIdentity({
      botId: flow.bot_id,
      workspaceId: campaign.workspace_id || null,
      platform: "whatsapp",
      platformUserId: resolvedPlatformUserId,
      name: input.contactName || null,
      phone: input.phone || resolvedPlatformUserId,
      email: input.email || null,
    });

    lead = {
      id: `contact:${contact.id}`,
      contact_id: contact.id,
      platform: "whatsapp",
      phone: contact.phone || input.phone || null,
      email: contact.email || input.email || null,
      name: contact.name || input.contactName || null,
      custom_variables: {},
      variables: {},
    };
  }

  const result = await runAutomationActions({
    flow,
    campaign,
    lead,
    rule,
    io: input.io,
    extraVariables: {
      ...(input.variables || {}),
      automation_webhook_payload: input.variables || {},
    },
  });

  return {
    success: true,
    campaignId: campaign.id,
    ruleId: rule.id,
    flowId: flow.id,
    result,
  };
}

export async function getCampaignAutomationRuntimeService(campaignId: string) {
  const campaignRes = await query(
    `SELECT id, name, slug, workspace_id, project_id, default_flow_id, metadata
     FROM campaigns
     WHERE id = $1
       AND deleted_at IS NULL
     LIMIT 1`,
    [campaignId]
  );

  const campaign = campaignRes.rows[0];
  if (!campaign) {
    throw { status: 404, message: "Campaign not found" };
  }

  const metadata = parseMetadata(campaign.metadata);
  const rules = parseRules(metadata);
  const history = normalizeAutomationHistory(metadata);
  const versions = normalizeAutomationVersions(metadata);
  const versionSummaries = versions.map((version, index) => ({
    ...version,
    diffSummary: compareAutomationSnapshots(
      version.snapshot,
      versions[index + 1]?.snapshot || null
    ),
  }));
  const historyByRule = history.reduce<Record<string, any[]>>((acc, entry) => {
    const key = String(entry.ruleId || "").trim();
    if (!key) {
      return acc;
    }
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(entry);
    return acc;
  }, {});

  return {
    campaign: {
      id: campaign.id,
      name: campaign.name,
      slug: campaign.slug,
      workspaceId: campaign.workspace_id || null,
      projectId: campaign.project_id || null,
      defaultFlowId: campaign.default_flow_id || null,
    },
    rules: rules.map((rule) => ({
      ...rule,
      history: historyByRule[rule.id] || [],
      paused: rule.enabled === false,
      failedRuns: (historyByRule[rule.id] || []).filter((entry) => String(entry.status || "") === "failed").length,
      deadLetters: (historyByRule[rule.id] || []).filter((entry) => String(entry.status || "") === "failed" || String(entry.status || "") === "retry").length,
    })),
    history,
    versions: versionSummaries,
    segmentLibrary: Array.from(
      new Map(
        history
          .filter((entry) => String(entry.payload?.segmentId || "").trim() || String(entry.payload?.listId || "").trim())
          .map((entry) => {
            const id = String(entry.payload?.segmentId || entry.payload?.listId || "").trim();
            return [
              id,
              {
                id,
                name: String(entry.payload?.segmentName || entry.payload?.listName || "Saved segment").trim(),
              },
            ] as const;
          })
      ).values()
    ),
  };
}

export async function saveCampaignAutomationVersionService(input: {
  campaignId: string;
  label?: string | null;
  notes?: string | null;
  status?: "draft" | "pending" | "approved" | "rejected";
  sourceRuleId?: string | null;
  sourceRuleName?: string | null;
}) {
  const campaignRes = await query(
    `SELECT id, metadata
     FROM campaigns
     WHERE id = $1
       AND deleted_at IS NULL
     LIMIT 1`,
    [input.campaignId]
  );
  const campaign = campaignRes.rows[0];
  if (!campaign) {
    throw { status: 404, message: "Campaign not found" };
  }

  const metadata = parseMetadata(campaign.metadata);
  const versions = await appendAutomationVersionEntry({
    campaignId: campaign.id,
    metadata,
    entry: {
      label: input.label || `Version ${normalizeAutomationVersions(metadata).length + 1}`,
      notes: input.notes || "",
      status: input.status || "draft",
      sourceRuleId: input.sourceRuleId || null,
      sourceRuleName: input.sourceRuleName || null,
      snapshot: buildAutomationVersionSnapshot(metadata),
    },
  });

  return {
    success: true,
    versions,
  };
}

export async function setCampaignAutomationRuleEnabledService(input: {
  campaignId: string;
  ruleId: string;
  enabled: boolean;
}) {
  const campaignRes = await query(
    `SELECT id, metadata
     FROM campaigns
     WHERE id = $1
       AND deleted_at IS NULL
     LIMIT 1`,
    [input.campaignId]
  );
  const campaign = campaignRes.rows[0];
  if (!campaign) {
    throw { status: 404, message: "Campaign not found" };
  }

  const metadata = parseMetadata(campaign.metadata);
  const rules = parseRules(metadata);
  const nextRules = rules.map((rule) =>
    rule.id === input.ruleId ? { ...rule, enabled: input.enabled } : rule
  );

  await writeCampaignAutomationMetadata(input.campaignId, {
    ...metadata,
    automation_rules: nextRules,
  });

  return {
    success: true,
    ruleId: input.ruleId,
    enabled: input.enabled,
  };
}

export async function cloneCampaignAutomationRuleService(input: {
  campaignId: string;
  ruleId: string;
}) {
  const campaignRes = await query(
    `SELECT id, metadata
     FROM campaigns
     WHERE id = $1
       AND deleted_at IS NULL
     LIMIT 1`,
    [input.campaignId]
  );
  const campaign = campaignRes.rows[0];
  if (!campaign) {
    throw { status: 404, message: "Campaign not found" };
  }

  const metadata = parseMetadata(campaign.metadata);
  const rules = parseRules(metadata);
  const rule = rules.find((item) => item.id === input.ruleId);
  if (!rule) {
    throw { status: 404, message: "Automation rule not found" };
  }

  const clonedRule = cloneRuleWithFreshIds(rule);
  const nextRules = [clonedRule, ...rules];
  const nextMetadata = {
    ...metadata,
    automation_rules: nextRules,
  };

  await writeCampaignAutomationMetadata(input.campaignId, nextMetadata);
  await appendAutomationVersionEntry({
    campaignId: input.campaignId,
    metadata: nextMetadata,
    entry: {
      label: `${clonedRule.name} snapshot`,
      notes: `Cloned from ${rule.name}`,
      status: "draft",
      sourceRuleId: clonedRule.id,
      sourceRuleName: clonedRule.name,
      snapshot: buildAutomationVersionSnapshot(nextMetadata),
    },
  });

  return {
    success: true,
    rule: clonedRule,
  };
}

export async function setCampaignAutomationVersionStatusService(input: {
  campaignId: string;
  versionId: string;
  status: "draft" | "pending" | "approved" | "rejected";
}) {
  const campaignRes = await query(
    `SELECT id, metadata
     FROM campaigns
     WHERE id = $1
       AND deleted_at IS NULL
     LIMIT 1`,
    [input.campaignId]
  );
  const campaign = campaignRes.rows[0];
  if (!campaign) {
    throw { status: 404, message: "Campaign not found" };
  }

  const metadata = parseMetadata(campaign.metadata);
  const versions = normalizeAutomationVersions(metadata).map((version) =>
    version.id === input.versionId
      ? { ...version, status: input.status, updatedAt: new Date().toISOString() }
      : version
  );

  await writeCampaignAutomationMetadata(input.campaignId, {
    ...metadata,
    automation_versions: versions,
  });

  return {
    success: true,
    versionId: input.versionId,
    status: input.status,
  };
}

export async function replayCampaignAutomationRuleService(input: {
  campaignId: string;
  ruleId: string;
  leadId?: string | null;
  io?: any;
}) {
  const campaignRes = await query(
    `SELECT id, name, slug, workspace_id, project_id, default_flow_id, metadata
     FROM campaigns
     WHERE id = $1
       AND deleted_at IS NULL
     LIMIT 1`,
    [input.campaignId]
  );
  const campaign = campaignRes.rows[0];
  if (!campaign) {
    throw { status: 404, message: "Campaign not found" };
  }

  const metadata = parseMetadata(campaign.metadata);
  const rules = parseRules(metadata);
  const rule = rules.find((item) => item.id === input.ruleId);
  if (!rule) {
    throw { status: 404, message: "Automation rule not found" };
  }

  const leadRes = input.leadId
    ? await query(
        `SELECT l.*, ct.name AS contact_name, ct.phone AS contact_phone, ct.email AS contact_email, ct.platform_user_id
         FROM leads l
         LEFT JOIN contacts ct ON ct.id = l.contact_id
         WHERE l.id = $1
           AND l.deleted_at IS NULL
         LIMIT 1`,
        [input.leadId]
      )
    : null;
  const lead = leadRes?.rows?.[0] || null;
  if (!lead) {
    throw { status: 400, message: "A leadId is required to replay an automation" };
  }

  const flow = await resolveRuleFlow(rule, campaign, lead);
  await runAutomationActions({
    campaign,
    lead,
    rule,
    io: input.io,
    flow,
    extraVariables: {
      automation_rule_id: rule.id,
      automation_rule_name: rule.name,
      automation_campaign_id: campaign.id,
      automation_campaign_name: campaign.name,
      automation_trigger_type: rule.type,
      automation_replayed: true,
      automation_replayed_at: new Date().toISOString(),
    },
  });

  await appendAutomationHistoryEntry({
    campaignId: campaign.id,
    metadata,
    entry: {
      ruleId: rule.id,
      ruleName: rule.name,
      leadId: lead.id,
      leadName: lead.name || lead.contact_name || lead.company_name || "",
      triggerType: rule.type,
      status: "completed",
      summary: "Automation replay executed.",
      payload: {
        leadId: lead.id,
        replay: true,
        flowId: flow?.id || null,
      },
    },
  });

  return {
    success: true,
    campaignId: campaign.id,
    ruleId: rule.id,
    leadId: lead.id,
  };
}
