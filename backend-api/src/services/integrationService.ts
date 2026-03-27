import crypto from "crypto";

import { env } from "../config/env";
import { query } from "../config/db";
import { findBotById } from "../models/botModel";
import { decryptSecret, encryptSecret } from "../utils/encryption";
import { normalizePlatform } from "../utils/platform";
import {
  assertBotWorkspacePermission,
  WORKSPACE_PERMISSIONS,
} from "./workspaceAccessService";
import { logAuditSafe } from "./auditLogService";

type SupportedPlatform =
  | "whatsapp"
  | "telegram"
  | "instagram"
  | "facebook"
  | "website";

interface ConnectionInput {
  accessToken?: string;
  phoneNumberId?: string;
  botToken?: string;
  pageId?: string;
  instagramAccountId?: string;
  appSecret?: string;
}

interface CompatibilityPlatformAccount {
  id: string;
  workspace_id: string | null;
  project_id: string | null;
  platform_type: string;
  name: string;
  phone_number: string | null;
  account_id: string | null;
  token: string | null;
  business_id: string | null;
  status: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  bot_id: string;
}

const PLATFORM_REQUIREMENTS: Record<
  SupportedPlatform,
  { requiredFields: (keyof ConnectionInput)[]; label: string }
> = {
  whatsapp: {
    requiredFields: ["accessToken", "phoneNumberId"],
    label: "WhatsApp",
  },
  telegram: {
    requiredFields: ["botToken"],
    label: "Telegram",
  },
  instagram: {
    requiredFields: ["accessToken", "instagramAccountId"],
    label: "Instagram",
  },
  facebook: {
    requiredFields: ["accessToken", "pageId"],
    label: "Facebook Messenger",
  },
  website: {
    requiredFields: [],
    label: "Website Widget",
  },
};

async function ensureBotAccess(botId: string, userId: string) {
  await assertBotWorkspacePermission(
    userId,
    botId,
    WORKSPACE_PERMISSIONS.managePlatformAccounts
  );
}

function isSupportedPlatform(platform: string): platform is SupportedPlatform {
  return platform in PLATFORM_REQUIREMENTS;
}

function normalizeChannel(platform: string) {
  return normalizePlatform(platform);
}

function buildPublicApiBaseUrl() {
  return (env.PUBLIC_API_BASE_URL || `http://localhost:${env.PORT || 4000}`).replace(
    /\/$/,
    ""
  );
}

function buildWebhookUrl(platform: SupportedPlatform, botId: string) {
  return `${buildPublicApiBaseUrl()}/api/webhook/${platform}/${botId}`;
}

function generateVerifyToken() {
  return crypto.randomBytes(24).toString("hex");
}

function validateConnectionInput(
  platform: SupportedPlatform,
  input: ConnectionInput
) {
  const missing = PLATFORM_REQUIREMENTS[platform].requiredFields.filter(
    (field) => !input[field]
  );

  if (missing.length > 0) {
    throw {
      status: 400,
      message: `${PLATFORM_REQUIREMENTS[platform].label} requires: ${missing.join(", ")}`,
    };
  }
}

function getMetadata(record: CompatibilityPlatformAccount | null | undefined) {
  return record?.metadata && typeof record.metadata === "object" ? record.metadata : {};
}

function sanitizeIntegration(record: CompatibilityPlatformAccount) {
  const metadata = getMetadata(record);
  const currentWebhookUrl =
    typeof metadata.webhookUrl === "string" ? metadata.webhookUrl : buildWebhookUrl(record.platform_type as SupportedPlatform, record.bot_id);

  return {
    id: record.id,
    botId: record.bot_id,
    platform: record.platform_type,
    isActive: String(record.status || "active") === "active",
    createdAt: record.created_at,
    connectionDetails: {
      webhookUrl: currentWebhookUrl,
      verifyTokenPreview:
        typeof metadata.verifyTokenPreview === "string" ? metadata.verifyTokenPreview : null,
    },
    fields: {
      phoneNumberId:
        typeof metadata.phoneNumberId === "string"
          ? metadata.phoneNumberId
          : record.platform_type === "whatsapp"
            ? record.account_id
            : null,
      pageId:
        typeof metadata.pageId === "string"
          ? metadata.pageId
          : record.platform_type === "facebook"
            ? record.account_id
            : null,
      instagramAccountId:
        typeof metadata.instagramAccountId === "string"
          ? metadata.instagramAccountId
          : record.platform_type === "instagram"
            ? record.account_id
            : null,
      hasAccessToken: Boolean(record.token),
    },
  };
}

function buildCompatibilityMetadata(input: {
  botId: string;
  platform: SupportedPlatform;
  verifyToken: string;
  webhookUrl: string;
  credentials: ConnectionInput;
  existingMetadata?: Record<string, unknown>;
}) {
  return {
    ...(input.existingMetadata || {}),
    legacyCompat: true,
    legacyBotId: input.botId,
    verifyToken: encryptSecret(input.verifyToken),
    verifyTokenPreview: input.verifyToken.slice(-6),
    webhookUrl: input.webhookUrl,
    generatedAt: new Date().toISOString(),
    ...(input.credentials.phoneNumberId ? { phoneNumberId: input.credentials.phoneNumberId } : {}),
    ...(input.credentials.pageId ? { pageId: input.credentials.pageId } : {}),
    ...(input.credentials.instagramAccountId
      ? { instagramAccountId: input.credentials.instagramAccountId }
      : {}),
  };
}

async function findBotContext(botId: string) {
  const bot = await findBotById(botId);
  if (!bot) {
    throw { status: 404, message: "Bot not found" };
  }

  if (!bot.workspace_id || !bot.project_id) {
    throw {
      status: 409,
      message: "Legacy integrations now require the bot to belong to a workspace project",
    };
  }

  return bot;
}

async function findCompatibilityAccountsByBot(
  botId: string,
  platform?: string
) {
  const bot = await findBotContext(botId);
  const params: Array<string | null> = [bot.workspace_id, bot.project_id, botId];
  let platformClause = "";

  if (platform) {
    params.push(platform);
    platformClause = ` AND pa.platform_type = $${params.length}`;
  }

  const res = await query(
    `SELECT
       pa.*,
       $3::uuid AS bot_id
     FROM platform_accounts pa
     WHERE pa.workspace_id = $1
       AND pa.project_id = $2
       AND pa.metadata->>'legacyBotId' = $3
       ${platformClause}
     ORDER BY pa.created_at DESC`,
    params
  );

  return res.rows as CompatibilityPlatformAccount[];
}

async function findCompatibilityAccountById(id: string) {
  const res = await query(
    `SELECT
       pa.*,
       COALESCE(pa.metadata->>'legacyBotId', '') AS bot_id
     FROM platform_accounts pa
     WHERE pa.id = $1
     LIMIT 1`,
    [id]
  );

  const record = res.rows[0];
  if (!record || !record.bot_id) {
    return null;
  }

  return record as CompatibilityPlatformAccount;
}

export function getIntegrationVerifyToken(record: {
  metadata?: Record<string, unknown> | null;
}) {
  return decryptSecret(getMetadata(record as CompatibilityPlatformAccount).verifyToken ?? null);
}

export async function getIntegrationsService(botId: string, userId: string) {
  await ensureBotAccess(botId, userId);
  const integrations = await findCompatibilityAccountsByBot(botId);
  return integrations.map(sanitizeIntegration);
}

export async function getIntegrationService(id: string, userId: string) {
  const integration = await findCompatibilityAccountById(id);

  if (!integration) {
    throw { status: 404, message: "Integration not found" };
  }

  await ensureBotAccess(integration.bot_id, userId);
  return sanitizeIntegration(integration);
}

export async function generateConnectionDetailsService(
  botId: string,
  userId: string,
  platform: string,
  credentials: ConnectionInput
) {
  await ensureBotAccess(botId, userId);

  const bot = await findBotContext(botId);
  const normalizedPlatform = normalizeChannel(platform);
  if (!isSupportedPlatform(normalizedPlatform)) {
    throw { status: 400, message: `Unsupported platform '${platform}'` };
  }

  validateConnectionInput(normalizedPlatform, credentials);

  const verifyToken = generateVerifyToken();
  const webhookUrl = buildWebhookUrl(normalizedPlatform, botId);
  const existing = (await findCompatibilityAccountsByBot(botId, normalizedPlatform))[0] || null;
  const nextToken =
    credentials.accessToken || credentials.botToken || credentials.appSecret || null;
  const nextAccountId =
    credentials.phoneNumberId || credentials.pageId || credentials.instagramAccountId || null;
  const nextMetadata = buildCompatibilityMetadata({
    botId,
    platform: normalizedPlatform,
    verifyToken,
    webhookUrl,
    credentials,
    existingMetadata: getMetadata(existing),
  });

  let saved: CompatibilityPlatformAccount;

  if (existing) {
    const res = await query(
      `UPDATE platform_accounts
       SET
         name = $1,
         account_id = COALESCE($2, account_id),
         token = COALESCE($3, token),
         metadata = $4::jsonb,
         status = 'active',
         updated_at = NOW()
       WHERE id = $5
       RETURNING *, $6::uuid AS bot_id`,
      [
        existing.name,
        nextAccountId,
        nextToken ? JSON.stringify(encryptSecret(nextToken)) : null,
        JSON.stringify(nextMetadata),
        existing.id,
        botId,
      ]
    );
    saved = res.rows[0] as CompatibilityPlatformAccount;
  } else {
    const res = await query(
      `INSERT INTO platform_accounts
         (user_id, workspace_id, project_id, platform_type, name, account_id, token, status, metadata)
       VALUES
         ($1, $2, $3, $4, $5, $6, $7, 'active', $8::jsonb)
       RETURNING *, $9::uuid AS bot_id`,
      [
        userId,
        bot.workspace_id,
        bot.project_id,
        normalizedPlatform,
        `${PLATFORM_REQUIREMENTS[normalizedPlatform].label} (${bot.name})`,
        nextAccountId,
        nextToken ? JSON.stringify(encryptSecret(nextToken)) : null,
        JSON.stringify(nextMetadata),
        botId,
      ]
    );
    saved = res.rows[0] as CompatibilityPlatformAccount;
  }

  await logAuditSafe({
    userId,
    workspaceId: bot.workspace_id,
    projectId: bot.project_id,
    action: existing ? "update" : "create",
    entity: "integration",
    entityId: saved.id,
    newData: saved as unknown as Record<string, unknown>,
  });

  return {
    integration: sanitizeIntegration(saved),
    connectionDetails: {
      webhookUrl,
      verifyToken,
    },
  };
}

export async function updateIntegrationService(
  id: string,
  userId: string,
  config: Record<string, unknown>
) {
  const integration = await findCompatibilityAccountById(id);

  if (!integration) {
    throw { status: 404, message: "Integration not found" };
  }

  await ensureBotAccess(integration.bot_id, userId);

  const updatedMetadata = {
    ...getMetadata(integration),
    ...(config || {}),
  };

  const res = await query(
    `UPDATE platform_accounts
     SET metadata = $1::jsonb,
         updated_at = NOW()
     WHERE id = $2
     RETURNING *, $3::uuid AS bot_id`,
    [JSON.stringify(updatedMetadata), id, integration.bot_id]
  );

  const updated = sanitizeIntegration(res.rows[0] as CompatibilityPlatformAccount);
  await logAuditSafe({
    userId,
    workspaceId: integration.workspace_id,
    projectId: integration.project_id,
    action: "update",
    entity: "integration",
    entityId: id,
    oldData: integration as unknown as Record<string, unknown>,
    newData: updated as unknown as Record<string, unknown>,
  });
  return updated;
}

export async function deleteIntegrationService(id: string, userId: string) {
  const integration = await findCompatibilityAccountById(id);

  if (!integration) {
    throw { status: 404, message: "Integration not found" };
  }

  await ensureBotAccess(integration.bot_id, userId);
  await logAuditSafe({
    userId,
    workspaceId: integration.workspace_id,
    projectId: integration.project_id,
    action: "delete",
    entity: "integration",
    entityId: id,
    oldData: integration as unknown as Record<string, unknown>,
  });
  await query(`DELETE FROM platform_accounts WHERE id = $1`, [id]);
}

export async function findWebhookIntegration(botId: string, platform: string) {
  return (await findCompatibilityAccountsByBot(botId, normalizeChannel(platform)))[0] || null;
}

export async function findLegacyWhatsAppBotMatch(phoneNumberId: string) {
  const res = await query(
    `SELECT
       pa.*,
       (pa.metadata->>'legacyBotId') AS bot_id
     FROM platform_accounts pa
     WHERE pa.platform_type = 'whatsapp'
       AND pa.status = 'active'
       AND pa.metadata->>'legacyBotId' IS NOT NULL
       AND (
         pa.account_id = $1
         OR pa.phone_number = $1
         OR pa.metadata->>'phoneNumberId' = $1
       )
     ORDER BY pa.created_at DESC
     LIMIT 1`,
    [phoneNumberId]
  );

  const record = res.rows[0];
  return record ? (record as CompatibilityPlatformAccount) : null;
}

export async function findLegacyPlatformAccountByBotAndPlatform(
  botId: string,
  platform: string
) {
  return (await findCompatibilityAccountsByBot(botId, normalizeChannel(platform)))[0] || null;
}
