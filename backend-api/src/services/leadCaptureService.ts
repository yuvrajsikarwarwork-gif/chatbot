import { query } from "../config/db";
import { normalizePlatform } from "../utils/platform";

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

export async function upsertLeadCapture(options: {
  conversationId: string;
  botId: string;
  platform: string;
  variables: Record<string, any>;
  nodeData: Record<string, any>;
  contactId?: string | null;
  sourcePayload?: Record<string, unknown>;
}) {
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
    [options.conversationId]
  );

  const context = contextRes.rows[0];
  if (!context) {
    return null;
  }

  const platform = normalizePlatform(
    context.platform || context.context_json?.platform || options.platform
  );

  const userId = context.context_json?.userId || null;

  const name = pickValue(
    options.variables,
    options.nodeData.nameVariable,
    "name",
    "full_name",
    "user_name"
  ) || context.contact_name || null;

  const phone = pickValue(
    options.variables,
    options.nodeData.phoneVariable,
    "phone",
    "mobile",
    "wa_number"
  ) || context.platform_user_id || null;

  const email = pickValue(
    options.variables,
    options.nodeData.emailVariable,
    "email"
  );

  const status = String(options.nodeData.statusValue || "captured");
  const source = String(options.nodeData.sourceLabel || "lead_form");
  const variables = options.variables || {};
  const sourcePayload = {
    nodeType: "lead_form",
    nodeId: options.nodeData.nodeId || null,
    ...options.sourcePayload,
  };

  const existingLeadRes = await query(
    `SELECT id
     FROM leads
     WHERE contact_id = $1
       AND bot_id = $2
       AND COALESCE(campaign_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE($3, '00000000-0000-0000-0000-000000000000'::uuid)
       AND COALESCE(channel_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE($4, '00000000-0000-0000-0000-000000000000'::uuid)
       AND COALESCE(entry_point_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE($5, '00000000-0000-0000-0000-000000000000'::uuid)
     LIMIT 1`,
    [
      context.contact_id,
      options.botId,
      context.campaign_id,
      context.channel_id,
      context.entry_point_id,
    ]
  );

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
         updated_at = NOW()
       WHERE id = $15
       RETURNING *`,
      [
        context.workspace_id || null,
        context.context_json?.projectId || context.project_id || null,
        context.flow_id,
        context.list_id,
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
        existingLeadRes.rows[0].id,
      ]
    );

    return updateRes.rows[0];
  }

  const insertRes = await query(
    `INSERT INTO leads
       (user_id, workspace_id, project_id, bot_id, contact_id, campaign_id, channel_id, entry_point_id, flow_id, platform, list_id, name, phone, email, status, source, source_payload, variables, wa_name, wa_number)
     VALUES
       ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb, $18::jsonb, $19, $20)
     RETURNING *`,
    [
      userId,
      context.workspace_id || null,
      context.context_json?.projectId || context.project_id || null,
      options.botId,
      context.contact_id,
      context.campaign_id,
      context.channel_id,
      context.entry_point_id,
      context.flow_id,
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
}) {
  const variables = options.variables || {};
  const nameVariable =
    detectVariableKey(variables, ["name", "full_name", "user_name"]) || undefined;
  const emailVariable =
    detectVariableKey(variables, ["lead_email", "email", "work_email"]) || undefined;
  const phoneVariable =
    detectVariableKey(variables, ["phone", "mobile", "wa_number"]) || undefined;

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
    },
    sourcePayload: {
      autoCaptured: true,
      ...options.sourcePayload,
    },
  });
}
