import crypto from "crypto";
import axios from "axios";

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

interface RemoteRevocationResult {
  attempted: boolean;
  ok: boolean;
  provider: string;
  targets: string[];
  message?: string | null;
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

function buildGlobalWebhookUrl() {
  return `${buildPublicApiBaseUrl()}/api/webhook/global`;
}

function buildMetaOAuthCallbackUrl() {
  return `${buildPublicApiBaseUrl()}/api/integrations/meta/callback`;
}

function decodeEmbeddedSignupState(state: string) {
  try {
    const decoded = Buffer.from(String(state || ""), "base64url").toString("utf8");
    const parsed = JSON.parse(decoded);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function getEmbeddedSignupAppRedirectUri(value: unknown) {
  const fallback = `${env.PUBLIC_APP_BASE_URL.replace(/\/$/, "")}/integrations`;
  const candidate = String(value || "").trim();
  if (!candidate) {
    return fallback;
  }

  try {
    const url = new URL(candidate);
    if (!/^https?:$/i.test(url.protocol)) {
      return fallback;
    }
    return url.toString();
  } catch {
    return fallback;
  }
}

async function exchangeMetaOAuthCode(code: string, redirectUri: string) {
  const response = await axios.get(
    `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v23.0"}/oauth/access_token`,
    {
      params: {
        client_id: env.META_APP_ID,
        client_secret: env.META_APP_SECRET,
        redirect_uri: redirectUri,
        code,
      },
    }
  );

  return response.data as {
    access_token?: string;
    token_type?: string;
    expires_in?: number;
  };
}

function buildWebhookUrl(platform: SupportedPlatform, botId: string) {
  if (platform === "whatsapp" || platform === "facebook" || platform === "instagram") {
    return buildGlobalWebhookUrl();
  }
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

function extractRemoteRevocationTargets(account: CompatibilityPlatformAccount) {
  const metadata = getMetadata(account);
  const targets = new Set<string>();
  const platform = String(account.platform_type || "").toLowerCase();

  if (platform === "whatsapp") {
    const phoneNumberId =
      String(
        metadata.phoneNumberId ||
          account.account_id ||
          account.phone_number ||
          ""
      ).trim();
    if (phoneNumberId) {
      targets.add(phoneNumberId);
    }
  }

  if (platform === "facebook" || platform === "instagram") {
    const accountId = String(account.account_id || "").trim();
    if (accountId) {
      targets.add(accountId);
    }
  }

  return Array.from(targets);
}

async function revokeMetaSubscriptions(
  account: CompatibilityPlatformAccount
): Promise<RemoteRevocationResult> {
  const decryptedToken = decryptSecret(account.token);
  const targets = extractRemoteRevocationTargets(account);
  if (!decryptedToken || !targets.length) {
    return {
      attempted: false,
      ok: false,
      provider: "meta",
      targets,
      message: "No remote token or account target was available for revocation.",
    };
  }

  const graphVersion = process.env.META_GRAPH_VERSION || "v23.0";
  const failures: string[] = [];

  for (const target of targets) {
    try {
      await axios.delete(
        `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(target)}/subscribed_apps`,
        {
          params: {
            access_token: decryptedToken,
          },
        }
      );
    } catch (error: any) {
      failures.push(
        `${target}: ${String(
          error?.response?.data?.error?.message || error?.message || "Remote revocation failed"
        )}`
      );
    }
  }

  return {
    attempted: true,
    ok: failures.length === 0,
    provider: "meta",
    targets,
    message: failures.length ? failures.join(" | ") : null,
  };
}

async function revokeTelegramWebhook(
  account: CompatibilityPlatformAccount
): Promise<RemoteRevocationResult> {
  const decryptedToken = decryptSecret(account.token);
  if (!decryptedToken) {
    return {
      attempted: false,
      ok: false,
      provider: "telegram",
      targets: [],
      message: "No bot token was available for Telegram webhook revocation.",
    };
  }

  try {
    await axios.post(`https://api.telegram.org/bot${decryptedToken}/deleteWebhook`, {
      drop_pending_updates: true,
    });
    return {
      attempted: true,
      ok: true,
      provider: "telegram",
      targets: [String(account.account_id || account.name || "telegram-bot")],
      message: null,
    };
  } catch (error: any) {
    return {
      attempted: true,
      ok: false,
      provider: "telegram",
      targets: [String(account.account_id || account.name || "telegram-bot")],
      message: String(
        error?.response?.data?.description || error?.message || "Telegram webhook revocation failed"
      ),
    };
  }
}

export async function revokeRemotePlatformConnectionService(
  account: CompatibilityPlatformAccount
): Promise<RemoteRevocationResult> {
  const platform = String(account.platform_type || "").toLowerCase();
  if (["whatsapp", "facebook", "instagram"].includes(platform)) {
    return revokeMetaSubscriptions(account);
  }

  if (platform === "telegram") {
    return revokeTelegramWebhook(account);
  }

  return {
    attempted: false,
    ok: false,
    provider: platform || "unknown",
    targets: [],
    message: "Remote revocation is not required for this provider.",
  };
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
       AND pa.status = 'active'
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

export async function createMetaEmbeddedSignupSessionService(
  botId: string,
  userId: string,
  options?: {
    platform?: string;
    redirectUri?: string | null;
  }
) {
  await ensureBotAccess(botId, userId);
  const bot = await findBotContext(botId);
  const platform = normalizeChannel(String(options?.platform || "whatsapp"));
  if (!["whatsapp", "facebook", "instagram"].includes(platform)) {
    throw { status: 400, message: "Embedded signup is only supported for Meta platforms." };
  }
  if (!env.META_APP_ID || !env.META_EMBEDDED_SIGNUP_CONFIG_ID) {
    throw {
      status: 500,
      message: "Meta embedded signup is not configured. Set META_APP_ID and META_EMBEDDED_SIGNUP_CONFIG_ID.",
    };
  }

  const appRedirectUri = getEmbeddedSignupAppRedirectUri(options?.redirectUri);
  const redirectUri = buildMetaOAuthCallbackUrl();
  const statePayload = Buffer.from(
    JSON.stringify({
      botId,
      workspaceId: bot.workspace_id,
      projectId: bot.project_id,
      platform,
      appRedirectUri,
      issuedAt: new Date().toISOString(),
    })
  ).toString("base64url");

  const url = new URL(`https://www.facebook.com/${process.env.META_GRAPH_VERSION || "v23.0"}/dialog/oauth`);
  url.searchParams.set("client_id", env.META_APP_ID);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", statePayload);
  url.searchParams.set("response_type", "code");
  url.searchParams.set(
    "scope",
    "business_management,whatsapp_business_management,whatsapp_business_messaging,pages_manage_metadata,pages_messaging"
  );
  url.searchParams.set("config_id", env.META_EMBEDDED_SIGNUP_CONFIG_ID);

  return {
    signupUrl: url.toString(),
    platform,
    redirectUri,
    appRedirectUri,
    webhookUrl: buildGlobalWebhookUrl(),
    state: statePayload,
  };
}

export async function completeMetaEmbeddedSignupService(input: {
  userId: string;
  code: string;
  state: string;
  platform?: string | null;
  accountId?: string | null;
  phoneNumberId?: string | null;
  businessId?: string | null;
  metaBusinessId?: string | null;
  name?: string | null;
}) {
  if (!env.META_APP_ID || !env.META_APP_SECRET) {
    throw {
      status: 500,
      message: "Meta OAuth is not configured. Set META_APP_ID and META_APP_SECRET.",
    };
  }

  const state = decodeEmbeddedSignupState(input.state);
  if (!state?.botId) {
    throw { status: 400, message: "Invalid embedded signup state." };
  }

  await ensureBotAccess(String(state.botId), input.userId);
  const bot = await findBotContext(String(state.botId));
  const redirectUri = buildMetaOAuthCallbackUrl();
  const platform = normalizeChannel(String(input.platform || state.platform || "whatsapp"));
  if (!["whatsapp", "facebook", "instagram"].includes(platform)) {
    throw { status: 400, message: "Embedded signup completion only supports Meta platforms." };
  }

  const oauth = await exchangeMetaOAuthCode(String(input.code || "").trim(), redirectUri);
  const accessToken = String(oauth?.access_token || "").trim();
  if (!accessToken) {
    throw { status: 502, message: "Meta OAuth token exchange did not return an access token." };
  }

  const accountId =
    String(input.accountId || "").trim() ||
    String(input.phoneNumberId || "").trim() ||
    null;
  const businessId =
    String(input.businessId || "").trim() ||
    String(input.metaBusinessId || "").trim() ||
    null;
  const name =
    String(input.name || "").trim() ||
    `${PLATFORM_REQUIREMENTS[platform as SupportedPlatform].label} (${bot.name})`;

  const res = await query(
    `SELECT *
     FROM platform_accounts
     WHERE workspace_id = $1
       AND project_id = $2
       AND platform_type = $3
       AND (
         ($4::text IS NOT NULL AND account_id = $4)
         OR metadata->>'legacyBotId' = $5
       )
     ORDER BY created_at DESC
     LIMIT 1`,
    [bot.workspace_id, bot.project_id, platform, accountId, bot.id]
  );

  const existing = res.rows[0] as CompatibilityPlatformAccount | undefined;
  const metadata = buildCompatibilityMetadata({
    botId: bot.id,
    platform: platform as SupportedPlatform,
    verifyToken: generateVerifyToken(),
    webhookUrl: buildWebhookUrl(platform as SupportedPlatform, bot.id),
    credentials: {
      accessToken,
      ...(String(input.phoneNumberId || "").trim()
        ? { phoneNumberId: String(input.phoneNumberId || "").trim() }
        : {}),
      ...(platform === "facebook" && accountId ? { pageId: accountId } : {}),
      ...(platform === "instagram" && accountId ? { instagramAccountId: accountId } : {}),
    },
    existingMetadata: getMetadata(existing),
  });

  let saved: CompatibilityPlatformAccount;
  if (existing) {
    const updated = await query(
      `UPDATE platform_accounts
       SET
         name = $1,
         account_id = COALESCE($2, account_id),
         phone_number = COALESCE($3, phone_number),
         token = $4,
         business_id = COALESCE($5, business_id),
         metadata = $6::jsonb,
         status = 'active',
         updated_at = NOW()
       WHERE id = $7
       RETURNING *, $8::uuid AS bot_id`,
      [
        name,
        accountId,
        String(input.phoneNumberId || "").trim() || null,
        JSON.stringify(encryptSecret(accessToken)),
        businessId,
        JSON.stringify({
          ...metadata,
          metaBusinessId: String(input.metaBusinessId || "").trim() || null,
          embeddedSignup: true,
          oauthCompletedAt: new Date().toISOString(),
        }),
        existing.id,
        bot.id,
      ]
    );
    saved = updated.rows[0] as CompatibilityPlatformAccount;
  } else {
    const inserted = await query(
      `INSERT INTO platform_accounts
         (user_id, workspace_id, project_id, platform_type, name, phone_number, account_id, token, business_id, status, metadata)
       VALUES
         ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active', $10::jsonb)
       RETURNING *, $11::uuid AS bot_id`,
      [
        input.userId,
        bot.workspace_id,
        bot.project_id,
        platform,
        name,
        String(input.phoneNumberId || "").trim() || null,
        accountId,
        JSON.stringify(encryptSecret(accessToken)),
        businessId,
        JSON.stringify({
          ...metadata,
          metaBusinessId: String(input.metaBusinessId || "").trim() || null,
          embeddedSignup: true,
          oauthCompletedAt: new Date().toISOString(),
        }),
        bot.id,
      ]
    );
    saved = inserted.rows[0] as CompatibilityPlatformAccount;
  }

  await logAuditSafe({
    userId: input.userId,
    workspaceId: bot.workspace_id,
    projectId: bot.project_id,
    action: existing ? "update" : "create",
    entity: "integration",
    entityId: saved.id,
    newData: saved as unknown as Record<string, unknown>,
  });

  return {
    integration: sanitizeIntegration(saved),
    webhookUrl: buildGlobalWebhookUrl(),
  };
}

export function resolveMetaEmbeddedSignupAppRedirect(input: {
  code?: string | null;
  state?: string | null;
}) {
  const decodedState = decodeEmbeddedSignupState(String(input.state || ""));
  const targetBase = getEmbeddedSignupAppRedirectUri(decodedState?.appRedirectUri);
  const target = new URL(targetBase);

  if (String(input.code || "").trim()) {
    target.searchParams.set("code", String(input.code || "").trim());
  }
  if (String(input.state || "").trim()) {
    target.searchParams.set("state", String(input.state || "").trim());
  }

  return target.toString();
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
  const remoteRevocation = await revokeRemotePlatformConnectionService(integration).catch(
    (error: any) =>
      ({
        attempted: true,
        ok: false,
        provider: String(integration.platform_type || "unknown"),
        targets: extractRemoteRevocationTargets(integration),
        message: String(error?.message || error || "Remote revocation failed"),
      }) satisfies RemoteRevocationResult
  );
  await logAuditSafe({
    userId,
    workspaceId: integration.workspace_id,
    projectId: integration.project_id,
    action: "delete",
    entity: "integration",
    entityId: id,
    oldData: integration as unknown as Record<string, unknown>,
    metadata: {
      remoteRevocation,
    },
  });
  await query(`DELETE FROM platform_accounts WHERE id = $1`, [id]);
}

export async function findWebhookIntegration(botId: string, platform: string) {
  return (await findCompatibilityAccountsByBot(botId, normalizeChannel(platform)))[0] || null;
}

export async function findActiveWhatsAppPlatformAccountByPhoneNumberId(
  phoneNumberId: string
) {
  const res = await query(
    `SELECT
       pa.*,
       COALESCE(pa.metadata->>'legacyBotId', '') AS bot_id
     FROM platform_accounts pa
     LEFT JOIN workspaces w ON w.id = pa.workspace_id
     LEFT JOIN projects p ON p.id = pa.project_id
     WHERE pa.platform_type = 'whatsapp'
       AND pa.status = 'active'
       AND (w.id IS NULL OR w.deleted_at IS NULL)
       AND (p.id IS NULL OR p.deleted_at IS NULL)
       AND (
         pa.account_id = $1
         OR pa.phone_number = $1
         OR pa.metadata->>'phoneNumberId' = $1
         OR pa.metadata->>'phone_number_id' = $1
         OR pa.metadata->>'wa_phone_number_id' = $1
       )
     ORDER BY pa.created_at DESC
     LIMIT 1`,
    [phoneNumberId]
  );

  const record = res.rows[0];
  return record ? (record as CompatibilityPlatformAccount) : null;
}

export async function findLegacyWhatsAppBotMatch(phoneNumberId: string) {
  const res = await query(
    `SELECT
       pa.*,
       (pa.metadata->>'legacyBotId') AS bot_id
     FROM platform_accounts pa
     JOIN bots b ON b.id = NULLIF(pa.metadata->>'legacyBotId', '')::uuid
     LEFT JOIN workspaces w ON w.id = pa.workspace_id
     WHERE pa.platform_type = 'whatsapp'
       AND pa.status = 'active'
       AND b.deleted_at IS NULL
       AND (w.id IS NULL OR w.deleted_at IS NULL)
       AND pa.metadata->>'legacyBotId' IS NOT NULL
       AND (
         pa.account_id = $1
         OR pa.phone_number = $1
         OR pa.metadata->>'phoneNumberId' = $1
         OR pa.metadata->>'phone_number_id' = $1
         OR pa.metadata->>'wa_phone_number_id' = $1
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
