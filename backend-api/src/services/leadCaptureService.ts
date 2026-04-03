import { query } from "../config/db";
import { normalizePlatform } from "../utils/platform";
import { env } from "../config/env";

export class LeadCaptureContextError extends Error {
  missingFields: string[];

  constructor(missingFields: string[]) {
    super(
      `Lead capture requires full attribution context. Missing: ${missingFields.join(
        ", "
      )}`
    );
    this.name = "LeadCaptureContextError";
    this.missingFields = missingFields;
  }
}

function detectVariableKey(
  variables: Record<string, any>,
  keys: string[]
) {
  return keys.find((key) => {
    const value = variables?.[key];
    return value !== undefined && value !== null && String(value).trim() !== "";
  }) || null;
}

function pickValue(variables: Record<string, any>, ...keys: (string | undefined)[]) {
  for (const key of keys) {
    if (!key) {
      continue;
    }

    const value = variables[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }

  return null;
}

async function getLeadCaptureConversationContext(conversationId: string) {
  const contextRes = await query(
    `SELECT
       c.id,
       c.bot_id,
       c.workspace_id,
       c.project_id,
       c.contact_id,
       c.campaign_id,
       c.channel_id,
       c.entry_point_id,
       c.flow_id,
       c.list_id,
       c.platform,
       c.context_json,
       ct.name AS contact_name,
       ct.platform_user_id
     FROM conversations c
     LEFT JOIN contacts ct ON ct.id = c.contact_id
     WHERE c.id = $1`,
    [conversationId]
  );

  return contextRes.rows[0] || null;
}

function isStandardLeadFieldKey(fieldKey?: string | null) {
  const normalized = String(fieldKey || "").trim().toLowerCase();
  return ["full_name", "name", "email", "phone", "company_name", "company"].includes(normalized);
}

function buildSystemLeadVariables(context: any, platform: string, conversationId: string) {
  const entryMetadata =
    context?.context_json?.entryMetadata &&
    typeof context.context_json.entryMetadata === "object"
      ? context.context_json.entryMetadata
      : {};

  return {
    utm_source: entryMetadata?.utm_source || entryMetadata?.utmSource || null,
    utm_medium: entryMetadata?.utm_medium || entryMetadata?.utmMedium || null,
    entry_point_id: context?.entry_point_id || null,
    channel: context?.channel_id || null,
    campaign_id: context?.campaign_id || null,
    chat_id: conversationId,
    chat_url: env.PUBLIC_APP_BASE_URL
      ? `${String(env.PUBLIC_APP_BASE_URL).replace(/\/$/, "")}/conversations?conversationId=${conversationId}`
      : null,
    entry_channel: platform,
  };
}

export async function upsertLeadCapture(options: {
  conversationId: string;
  botId: string;
  platform: string;
  variables: Record<string, any>;
  nodeData: Record<string, any>;
  contactId?: string | null;
  sourcePayload?: Record<string, unknown>;
  workspaceId?: string | null;
  projectId?: string | null;
}) {
  const context = await getLeadCaptureConversationContext(options.conversationId);
  const workspaceId = context?.workspace_id || options.workspaceId || options.nodeData?.workspaceId;
  const projectId = context?.project_id || options.projectId || options.nodeData?.projectId;

  if (!workspaceId) {
    return null;
  }

  const platform = normalizePlatform(
    context?.platform || context?.context_json?.platform || options.platform
  );
  const linkedFieldKey = String(options.sourcePayload?.linkedFieldKey || "").trim() || null;

  const userId = context?.context_json?.userId || null;

  const name = pickValue(
    options.variables,
    options.nodeData.nameVariable,
    "name",
    "full_name",
    "user_name",
    "userName",
    "customer_name"
  ) || context?.contact_name || null;

  const phone = pickValue(
    options.variables,
    options.nodeData.phoneVariable,
    "phone",
    "mobile",
    "wa_number",
    "contact_number",
    "user_phone"
  ) || context?.platform_user_id || null;

  const email = pickValue(
    options.variables,
    options.nodeData.emailVariable,
    "lead_email",
    "email",
    "work_email",
    "user_email",
    "customer_email"
  );
  const companyName = pickValue(
    options.variables,
    options.nodeData.companyVariable,
    linkedFieldKey === "company_name" || linkedFieldKey === "company" ? linkedFieldKey : undefined,
    "company_name",
    "company",
    "companyName"
  );

  const status = String(options.nodeData.statusValue || "captured");
  const source = String(options.nodeData.sourceLabel || "linked_form_capture");
  const leadFormId =
    String(options.nodeData.linkedFormId || options.nodeData.leadFormId || "").trim() || null;
  const variables = options.variables || {};
  const sourcePayload = {
    nodeType: "linked_input_capture",
    nodeId: options.nodeData.nodeId || null,
    ...options.sourcePayload,
  };

  const existingLeadRes = await query(
    `SELECT id, custom_variables
     FROM leads
     WHERE (
         (
           source_payload->>'conversationId' = $1
           AND COALESCE(lead_form_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE($7, '00000000-0000-0000-0000-000000000000'::uuid)
         )
         OR (
           contact_id = $2
           AND bot_id = $3
           AND COALESCE(campaign_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE($4, '00000000-0000-0000-0000-000000000000'::uuid)
           AND COALESCE(channel_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE($5, '00000000-0000-0000-0000-000000000000'::uuid)
           AND COALESCE(entry_point_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE($6, '00000000-0000-0000-0000-000000000000'::uuid)
           AND COALESCE(lead_form_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE($7, '00000000-0000-0000-0000-000000000000'::uuid)
         )
       )
     ORDER BY updated_at DESC, created_at DESC
     LIMIT 1`,
    [
      options.conversationId,
      context?.contact_id || options.contactId || null,
      options.botId,
      context?.campaign_id,
      context?.channel_id,
      context?.entry_point_id,
      leadFormId,
    ]
  );

  const existingCustomVariables =
    existingLeadRes.rows[0]?.custom_variables &&
    typeof existingLeadRes.rows[0].custom_variables === "object"
      ? existingLeadRes.rows[0].custom_variables
      : {};
  const nextCustomVariables = {
    ...existingCustomVariables,
    ...buildSystemLeadVariables(context, platform, options.conversationId),
  } as Record<string, unknown>;

  if (
    linkedFieldKey &&
    !isStandardLeadFieldKey(linkedFieldKey) &&
    variables?.[linkedFieldKey] !== undefined &&
    variables?.[linkedFieldKey] !== null &&
    String(variables[linkedFieldKey]).trim() !== ""
  ) {
    nextCustomVariables[linkedFieldKey] = variables[linkedFieldKey];
  }

  if (existingLeadRes.rows[0]?.id) {
    const updateRes = await query(
      `UPDATE leads
       SET
        workspace_id = COALESCE($1, workspace_id),
        project_id = COALESCE($2, project_id),
        flow_id = COALESCE($3, flow_id),
         list_id = COALESCE($4, list_id),
         platform = COALESCE($5, platform),
         name = COALESCE($6, name),
         phone = COALESCE($7, phone),
         email = COALESCE($8, email),
         status = COALESCE($9, status),
         source = COALESCE($10, source),
         source_payload = $11::jsonb,
         variables = $12::jsonb,
         wa_name = COALESCE($13, wa_name),
         wa_number = COALESCE($14, wa_number),
         lead_form_id = COALESCE($15, lead_form_id),
         company_name = COALESCE($16, company_name),
         custom_variables = $17::jsonb,
         updated_at = NOW()
       WHERE id = $18
       RETURNING *`,
      [
    workspaceId,
    context?.context_json?.projectId || projectId || context?.project_id || null,
    context?.flow_id,
    context?.list_id,
        platform,
        name,
        phone,
        email,
        status,
        source,
        JSON.stringify(sourcePayload),
        JSON.stringify(variables),
        name,
        phone,
        leadFormId,
        companyName,
        JSON.stringify(nextCustomVariables),
        existingLeadRes.rows[0].id,
      ]
    );

    return updateRes.rows[0];
  }

  const insertRes = await query(
    `INSERT INTO leads
       (user_id, workspace_id, project_id, bot_id, contact_id, campaign_id, channel_id, entry_point_id, flow_id, platform, list_id, name, phone, email, status, source, source_payload, variables, wa_name, wa_number, lead_form_id, company_name, custom_variables)
     VALUES
       ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb, $18::jsonb, $19, $20, $21, $22, $23::jsonb)
     RETURNING *`,
    [
      userId,
      workspaceId,
      context?.context_json?.projectId || projectId || context?.project_id || null,
      options.botId,
      context?.contact_id || options.contactId || null,
      context?.campaign_id,
      context?.channel_id,
      context?.entry_point_id,
      context?.flow_id,
      platform,
      context.list_id,
      name,
      phone,
      email,
      status,
      source,
      JSON.stringify(sourcePayload),
      JSON.stringify(variables),
      name,
      phone,
      leadFormId,
      companyName,
      JSON.stringify({
        ...buildSystemLeadVariables(context, platform, options.conversationId),
        ...(linkedFieldKey &&
        !isStandardLeadFieldKey(linkedFieldKey) &&
        variables?.[linkedFieldKey] !== undefined &&
        String(variables[linkedFieldKey]).trim() !== ""
          ? { [linkedFieldKey]: variables[linkedFieldKey] }
          : {}),
      }),
    ]
  );

  return insertRes.rows[0];
}

export async function maybeAutoCaptureLead(options: {
  conversationId: string;
  botId: string;
  platform: string;
  variables: Record<string, any>;
  sourcePayload?: Record<string, unknown>;
  workspaceId?: string | null;
  projectId?: string | null;
}) {
  const variables = options.variables || {};
  const nameVariable =
    detectVariableKey(variables, ["name", "full_name", "user_name", "userName", "customer_name"]) || undefined;
  const emailVariable =
    detectVariableKey(variables, ["lead_email", "email", "work_email", "user_email", "customer_email"]) || undefined;
  const phoneVariable =
    detectVariableKey(variables, ["phone", "mobile", "wa_number", "contact_number", "user_phone"]) || undefined;

  const hasLeadSignal = Boolean(nameVariable || emailVariable || phoneVariable);
  if (!hasLeadSignal) {
    return null;
  }

  return upsertLeadCapture({
    conversationId: options.conversationId,
    botId: options.botId,
    platform: options.platform,
    variables,
    nodeData: {
      sourceLabel: "flow_auto_capture",
      statusValue: "captured",
      nameVariable,
      emailVariable,
      phoneVariable,
      workspaceId: options.workspaceId || null,
      projectId: options.projectId || null,
    },
    sourcePayload: {
      autoCaptured: true,
      ...options.sourcePayload,
    },
  });
}

export async function upsertLeadCaptureFromConversationVariables(options: {
  conversationId: string;
  botId: string;
  platform: string;
  variables: Record<string, any>;
  leadFormId?: string;
  linkedFieldKey?: string;
  sourceLabel?: string;
  sourcePayload?: Record<string, unknown>;
  statusValue?: string;
  workspaceId?: string | null;
  projectId?: string | null;
}) {
  const variables = options.variables || {};
  const nameVariable =
    detectVariableKey(variables, ["name", "full_name", "user_name", "userName", "customer_name"]) || undefined;
  const emailVariable =
    detectVariableKey(variables, ["lead_email", "email", "work_email", "user_email", "customer_email"]) || undefined;
  const phoneVariable =
    detectVariableKey(variables, ["phone", "mobile", "wa_number", "contact_number", "user_phone"]) || undefined;
  const leadFormId = String(options.leadFormId || "").trim() || undefined;
  const linkedFieldKey = String(options.linkedFieldKey || "").trim() || undefined;
  const hasLinkedFieldSignal =
    Boolean(leadFormId && linkedFieldKey && variables?.[linkedFieldKey] !== undefined && String(variables[linkedFieldKey]).trim() !== "");

  if (!nameVariable && !emailVariable && !phoneVariable && !hasLinkedFieldSignal) {
    return null;
  }

  return upsertLeadCapture({
    conversationId: options.conversationId,
    botId: options.botId,
    platform: options.platform,
    variables,
    nodeData: {
      sourceLabel: options.sourceLabel || "engine_input_capture",
      statusValue: options.statusValue || "captured",
      leadFormId,
      nameVariable,
      emailVariable,
      phoneVariable,
      workspaceId: options.workspaceId || null,
      projectId: options.projectId || null,
    },
    sourcePayload: {
      triggeredBy: "engine_input_hook",
      conversationId: options.conversationId,
      linkedFieldKey: linkedFieldKey || null,
      ...options.sourcePayload,
    },
  });
}
