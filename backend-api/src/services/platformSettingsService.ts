import crypto from "crypto";
import nodemailer from "nodemailer";

import { env } from "../config/env";
import { decryptSecret, encryptSecret } from "../utils/encryption";
import { getPlatformSettingsRecord, upsertPlatformSettingsRecord } from "../models/platformSettingsModel";
import { logAuditSafe } from "./auditLogService";
import { listPlatformAuditLogs } from "../models/auditLogModel";

function previewValue(value: string, visible = 4) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.length <= visible) {
    return trimmed;
  }

  return `${"*".repeat(Math.max(4, trimmed.length - visible))}${trimmed.slice(-visible)}`;
}

function normalizeBaseUrl(value: string, fallback: string) {
  return String(value || fallback).trim().replace(/\/$/, "");
}

const GLOBAL_INTEGRATIONS_KEY = "global_integrations";
const EMAIL_SERVICES_KEY = "email_services";
const AI_PROVIDERS_KEY = "ai_providers";
const BILLING_WALLET_KEY = "billing_wallet";

type GlobalIntegrationsStoredSettings = {
  publicApiBaseUrl?: string;
  publicAppBaseUrl?: string;
  metaAppId?: string;
  metaAppSecret?: unknown;
  embeddedSignupConfigId?: string;
  metaWebhookVerifyToken?: unknown;
};

type EmailServicesStoredSettings = {
  provider?: string;
  smtpHost?: string;
  smtpPort?: number | string;
  smtpUser?: string;
  smtpPass?: unknown;
  smtpFrom?: string;
  smtpReplyTo?: string;
  testRecipient?: string;
  smtpEncryption?: string;
  smtpSenderName?: string;
};

type AiProvidersStoredSettings = {
  defaultProvider?: string;
  defaultModel?: string;
  fallbackProvider?: string;
  fallbackModel?: string;
  openaiApiKey?: unknown;
  openaiModel?: string;
  geminiApiKey?: unknown;
  geminiModel?: string;
  temperature?: number | string;
  maxOutputTokens?: number | string;
};

type BillingWalletStoredSettings = {
  billingProvider?: string;
  stripePublicKey?: string;
  stripeSecretKey?: unknown;
  stripeWebhookSecret?: unknown;
  razorpayKeyId?: string;
  razorpayKeySecret?: unknown;
  razorpayWebhookSecret?: unknown;
  billingWebhookUrl?: string;
  defaultCurrency?: string;
  walletAutoTopupDefaultEnabled?: boolean;
  walletAutoTopupDefaultAmount?: number | string;
  walletLowBalanceThresholdDefault?: number | string;
};

function sanitizeStoredSettings(record: any): GlobalIntegrationsStoredSettings {
  return record?.settings_json && typeof record.settings_json === "object"
    ? (record.settings_json as GlobalIntegrationsStoredSettings)
    : {};
}

function sanitizeEmailSettings(record: any): EmailServicesStoredSettings {
  return record?.settings_json && typeof record.settings_json === "object"
    ? (record.settings_json as EmailServicesStoredSettings)
    : {};
}

function sanitizeAiSettings(record: any): AiProvidersStoredSettings {
  return record?.settings_json && typeof record.settings_json === "object"
    ? (record.settings_json as AiProvidersStoredSettings)
    : {};
}

function sanitizeBillingWalletSettings(record: any): BillingWalletStoredSettings {
  return record?.settings_json && typeof record.settings_json === "object"
    ? (record.settings_json as BillingWalletStoredSettings)
    : {};
}

function toSafeNumber(value: unknown, fallback: number) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function resolveEffectiveGlobalIntegrations(stored: GlobalIntegrationsStoredSettings) {
  const publicApiBaseUrl = normalizeBaseUrl(
    String(stored.publicApiBaseUrl || env.PUBLIC_API_BASE_URL || ""),
    `http://localhost:${env.PORT || "4000"}`
  );
  const publicAppBaseUrl = normalizeBaseUrl(
    String(stored.publicAppBaseUrl || env.PUBLIC_APP_BASE_URL || ""),
    "http://localhost:3000"
  );
  const metaAppId = String(stored.metaAppId || env.META_APP_ID || "").trim();
  const embeddedSignupConfigId = String(
    stored.embeddedSignupConfigId || env.META_EMBEDDED_SIGNUP_CONFIG_ID || ""
  ).trim();
  const metaAppSecret =
    decryptSecret(stored.metaAppSecret) || String(env.META_APP_SECRET || "").trim();
  const metaWebhookVerifyToken =
    decryptSecret(stored.metaWebhookVerifyToken) ||
    String(env.META_WEBHOOK_VERIFY_TOKEN || "").trim() ||
    "";

  return {
    meta: {
      appId: metaAppId || null,
      appIdPreview: previewValue(metaAppId, 6),
      appSecretConfigured: Boolean(metaAppSecret),
      embeddedSignupConfigId: embeddedSignupConfigId || null,
      embeddedSignupConfigIdPreview: previewValue(embeddedSignupConfigId, 6),
      signatureVerificationEnabled: Boolean(metaAppSecret),
      metaWebhookVerifyTokenConfigured: Boolean(metaWebhookVerifyToken),
      metaWebhookVerifyTokenPreview: previewValue(metaWebhookVerifyToken, 6),
    },
    urls: {
      publicApiBaseUrl,
      publicAppBaseUrl,
      globalWebhookUrl: `${publicApiBaseUrl}/api/webhook/global`,
      metaOAuthCallbackUrl: `${publicApiBaseUrl}/api/integrations/meta/callback`,
      integrationsAppUrl: `${publicAppBaseUrl}/integrations`,
    },
    readiness: {
      metaEmbeddedSignupReady: Boolean(metaAppId && embeddedSignupConfigId),
      metaOAuthReady: Boolean(metaAppId && metaAppSecret),
      globalWebhookReady: Boolean(publicApiBaseUrl),
    },
    editable: {
      publicApiBaseUrl,
      publicAppBaseUrl,
      metaAppId: metaAppId || "",
      embeddedSignupConfigId: embeddedSignupConfigId || "",
    },
  };
}

export async function getGlobalIntegrationsSettingsService() {
  const storedRecord = await getPlatformSettingsRecord(GLOBAL_INTEGRATIONS_KEY);
  const storedSettings = sanitizeStoredSettings(storedRecord);
  return resolveEffectiveGlobalIntegrations(storedSettings);
}

export async function updateGlobalIntegrationsSettingsService(input: {
  userId: string;
  publicApiBaseUrl: string;
  publicAppBaseUrl: string;
  metaAppId: string;
  embeddedSignupConfigId: string;
  metaAppSecret?: string | null;
  metaWebhookVerifyToken?: string | null;
}) {
  const existingRecord = await getPlatformSettingsRecord(GLOBAL_INTEGRATIONS_KEY);
  const existingSettings = sanitizeStoredSettings(existingRecord);

  const nextSettings: GlobalIntegrationsStoredSettings = {
    publicApiBaseUrl: normalizeBaseUrl(
      String(input.publicApiBaseUrl || ""),
      `http://localhost:${env.PORT || "4000"}`
    ),
    publicAppBaseUrl: normalizeBaseUrl(
      String(input.publicAppBaseUrl || ""),
      "http://localhost:3000"
    ),
    metaAppId: String(input.metaAppId || "").trim(),
    embeddedSignupConfigId: String(input.embeddedSignupConfigId || "").trim(),
    metaAppSecret:
      typeof input.metaAppSecret === "string" && input.metaAppSecret.trim()
        ? encryptSecret(input.metaAppSecret.trim())
        : existingSettings.metaAppSecret || null,
    metaWebhookVerifyToken:
      typeof input.metaWebhookVerifyToken === "string" && input.metaWebhookVerifyToken.trim()
        ? encryptSecret(input.metaWebhookVerifyToken.trim())
        : existingSettings.metaWebhookVerifyToken || null,
  };

  await upsertPlatformSettingsRecord({
    settingsKey: GLOBAL_INTEGRATIONS_KEY,
    settingsJson: nextSettings as unknown as Record<string, unknown>,
    userId: input.userId,
  });

  await logAuditSafe({
    userId: input.userId,
    action: "update",
    entity: "platform_settings",
    entityId: GLOBAL_INTEGRATIONS_KEY,
    oldData: resolveEffectiveGlobalIntegrations(existingSettings) as unknown as Record<string, unknown>,
    newData: resolveEffectiveGlobalIntegrations(nextSettings) as unknown as Record<string, unknown>,
    metadata: {
      settings_key: GLOBAL_INTEGRATIONS_KEY,
      platform_scope: "global",
    },
  });

  return getGlobalIntegrationsSettingsService();
}

export async function testGlobalIntegrationsSettingsService() {
  const settings = await getGlobalIntegrationsSettingsService();
  const checks = [
    {
      key: "public_api_base_url",
      label: "Public API base URL",
      ok: /^https?:\/\//i.test(settings.urls.publicApiBaseUrl),
      detail: settings.urls.publicApiBaseUrl,
    },
    {
      key: "public_app_base_url",
      label: "Public app base URL",
      ok: /^https?:\/\//i.test(settings.urls.publicAppBaseUrl),
      detail: settings.urls.publicAppBaseUrl,
    },
    {
      key: "meta_oauth",
      label: "Meta OAuth credentials",
      ok: settings.readiness.metaOAuthReady,
      detail: settings.readiness.metaOAuthReady
        ? "Meta App ID and secret are configured."
        : "Meta App ID or secret is missing.",
    },
    {
      key: "embedded_signup",
      label: "Meta embedded signup",
      ok: settings.readiness.metaEmbeddedSignupReady,
      detail: settings.readiness.metaEmbeddedSignupReady
        ? "Embedded signup config is ready."
        : "Meta App ID or embedded signup config id is missing.",
    },
    {
      key: "webhook_signature",
      label: "Webhook signature verification",
      ok: settings.meta.signatureVerificationEnabled,
      detail: settings.meta.signatureVerificationEnabled
        ? "Signature verification is enabled."
        : "Signature verification is disabled until a Meta app secret is configured.",
    },
  ];

  return {
    ok: checks.every((check) => check.ok),
    checkedAt: new Date().toISOString(),
    checks,
  };
}

export async function regenerateGlobalVerifyTokenService(userId: string) {
  const existingRecord = await getPlatformSettingsRecord(GLOBAL_INTEGRATIONS_KEY);
  const existingSettings = sanitizeStoredSettings(existingRecord);
  const nextToken = crypto.randomBytes(24).toString("hex");

  const nextSettings: GlobalIntegrationsStoredSettings = {
    ...existingSettings,
    metaWebhookVerifyToken: encryptSecret(nextToken),
  };

  await upsertPlatformSettingsRecord({
    settingsKey: GLOBAL_INTEGRATIONS_KEY,
    settingsJson: nextSettings as unknown as Record<string, unknown>,
    userId,
  });

  await logAuditSafe({
    userId,
    action: "rotate",
    entity: "platform_settings",
    entityId: GLOBAL_INTEGRATIONS_KEY,
    metadata: {
      settings_key: GLOBAL_INTEGRATIONS_KEY,
      platform_scope: "global",
      rotated_field: "meta_webhook_verify_token",
    },
  });

  return {
    regeneratedToken: nextToken,
    settings: await getGlobalIntegrationsSettingsService(),
  };
}

export async function listGlobalIntegrationsAuditHistoryService() {
  const rows = await listPlatformAuditLogs({
    entity: "platform_settings",
    limit: 20,
  });
  return rows.filter((row: any) => {
    const settingsKey = String(row?.metadata?.settings_key || "").trim();
    return settingsKey === GLOBAL_INTEGRATIONS_KEY || String(row?.entity_id || "") === GLOBAL_INTEGRATIONS_KEY;
  });
}

function resolveEmailServices(stored: EmailServicesStoredSettings) {
  const provider = String(stored.provider || "smtp").trim().toLowerCase();
  const smtpHost = String(stored.smtpHost || env.SMTP_HOST || "").trim();
  const smtpPort = toSafeNumber(stored.smtpPort || env.SMTP_PORT, 587);
  const smtpUser = String(stored.smtpUser || env.SMTP_USER || "").trim();
  const smtpPass = decryptSecret(stored.smtpPass) || String(env.SMTP_PASS || "").trim();
  const smtpFrom = String(stored.smtpFrom || env.SMTP_FROM || smtpUser || "").trim();
  const smtpReplyTo = String(stored.smtpReplyTo || "").trim();
  const testRecipient = String(stored.testRecipient || smtpFrom || "").trim();
  const smtpEncryption = String(stored.smtpEncryption || "tls").trim().toLowerCase();
  const smtpSenderName = String(stored.smtpSenderName || "BOT.OS").trim();

  return {
    status: {
      configured: Boolean(smtpHost && smtpUser && smtpPass),
      secure: smtpEncryption === "ssl" || smtpPort === 465,
      provider,
    },
    previews: {
      smtpHost: smtpHost || null,
      smtpPort,
      smtpUser: smtpUser || null,
      smtpFrom: smtpFrom || null,
      smtpReplyTo: smtpReplyTo || null,
      smtpPassConfigured: Boolean(smtpPass),
      testRecipient: testRecipient || null,
      smtpEncryption,
      smtpSenderName: smtpSenderName || null,
    },
    editable: {
      provider,
      smtpHost,
      smtpPort,
      smtpUser,
      smtpFrom,
      smtpReplyTo,
      testRecipient,
      smtpEncryption,
      smtpSenderName,
    },
  };
}

export async function getEmailServicesSettingsService() {
  return resolveEmailServices(
    sanitizeEmailSettings(await getPlatformSettingsRecord(EMAIL_SERVICES_KEY))
  );
}

export async function updateEmailServicesSettingsService(input: {
  userId: string;
  provider: string;
  smtpHost: string;
  smtpPort: number | string;
  smtpUser: string;
  smtpFrom: string;
  smtpReplyTo?: string | null;
  testRecipient?: string | null;
  smtpPass?: string | null;
  smtpEncryption?: string | null;
  smtpSenderName?: string | null;
}) {
  const existing = sanitizeEmailSettings(await getPlatformSettingsRecord(EMAIL_SERVICES_KEY));
  const next: EmailServicesStoredSettings = {
    provider: String(input.provider || "smtp").trim().toLowerCase(),
    smtpHost: String(input.smtpHost || "").trim(),
    smtpPort: toSafeNumber(input.smtpPort, 587),
    smtpUser: String(input.smtpUser || "").trim(),
    smtpFrom: String(input.smtpFrom || "").trim(),
    smtpReplyTo: String(input.smtpReplyTo || "").trim(),
    testRecipient: String(input.testRecipient || "").trim(),
    smtpEncryption: String(input.smtpEncryption || existing.smtpEncryption || "tls").trim().toLowerCase(),
    smtpSenderName: String(input.smtpSenderName || existing.smtpSenderName || "BOT.OS").trim(),
    smtpPass:
      typeof input.smtpPass === "string" && input.smtpPass.trim()
        ? encryptSecret(input.smtpPass.trim())
        : existing.smtpPass || null,
  };

  await upsertPlatformSettingsRecord({
    settingsKey: EMAIL_SERVICES_KEY,
    settingsJson: next as unknown as Record<string, unknown>,
    userId: input.userId,
  });
  await logAuditSafe({
    userId: input.userId,
    action: "update",
    entity: "platform_settings",
    entityId: EMAIL_SERVICES_KEY,
    metadata: { settings_key: EMAIL_SERVICES_KEY, platform_scope: "global" },
  });
  return getEmailServicesSettingsService();
}

function buildSmtpTransport(
  smtpHost: string,
  smtpUser: string,
  smtpPass: string,
  smtpPort: number,
  smtpEncryption?: string | null
) {
  if (!smtpHost || !smtpUser || !smtpPass) {
    return null;
  }

  const encryption = String(smtpEncryption || "tls").trim().toLowerCase();
  const secure = encryption === "ssl" || smtpPort === 465;
  const requireTLS = encryption === "tls";

  return nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure,
    requireTLS,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });
}

export async function testEmailServicesSettingsService(input?: {
  smtpHost?: string | null;
  smtpPort?: number | string | null;
  smtpUser?: string | null;
  smtpFrom?: string | null;
  smtpReplyTo?: string | null;
  testRecipient?: string | null;
  smtpPass?: string | null;
  smtpEncryption?: string | null;
  smtpSenderName?: string | null;
}) {
  const stored = sanitizeEmailSettings(await getPlatformSettingsRecord(EMAIL_SERVICES_KEY));
  const settings = resolveEmailServices(stored);
  if (!settings.status.configured) {
    return {
      ok: false,
      detail: "SMTP host, user, or password is missing.",
      checkedAt: new Date().toISOString(),
    };
  }

  const smtpHost = String(input?.smtpHost || settings.editable.smtpHost || "").trim();
  const smtpPort = toSafeNumber(input?.smtpPort || settings.editable.smtpPort, 587);
  const smtpUser = String(input?.smtpUser || settings.editable.smtpUser || "").trim();
  const smtpFrom = String(input?.smtpFrom || settings.editable.smtpFrom || smtpUser || "").trim();
  const smtpReplyTo = String(input?.smtpReplyTo || settings.editable.smtpReplyTo || "").trim();
  const testRecipient = String(input?.testRecipient || settings.editable.testRecipient || smtpFrom || "").trim();
  const smtpEncryption = String(input?.smtpEncryption || settings.editable.smtpEncryption || "tls").trim().toLowerCase();
  const smtpSenderName = String(input?.smtpSenderName || settings.editable.smtpSenderName || "BOT.OS").trim();
  const smtpPass =
    String(input?.smtpPass || "").trim() ||
    decryptSecret(stored.smtpPass) ||
    String(env.SMTP_PASS || "").trim();

  const transporter = buildSmtpTransport(smtpHost, smtpUser, smtpPass, smtpPort, smtpEncryption);
  if (!transporter) {
    return {
      ok: false,
      detail: "SMTP host, user, or password is missing.",
      checkedAt: new Date().toISOString(),
    };
  }
  try {
    await transporter.verify();
    await transporter.sendMail({
      from: `"${smtpSenderName}" <${smtpFrom || smtpUser}>`,
      to: testRecipient,
      subject: `Test message from ${smtpSenderName}`,
      text: `Hello from ${smtpSenderName}.\n\nThis is a test email from the BOT.OS system email configuration.`,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
        <h2 style="margin:0 0 12px">Hello from ${smtpSenderName}</h2>
        <p>This is a test email from the BOT.OS system email configuration.</p>
      </div>`,
      replyTo: smtpReplyTo || undefined,
    });
    return {
      ok: true,
      detail: `SMTP connection verified successfully${testRecipient ? ` for ${testRecipient}` : ""}.`,
      checkedAt: new Date().toISOString(),
    };
  } catch (error: any) {
    throw {
      status: 502,
      message: String(error?.response || error?.responseCode || error?.message || error?.code || error || "SMTP connection failed").trim(),
    };
  }
}

function resolveAiProviders(stored: AiProvidersStoredSettings) {
  const defaultProvider = String(stored.defaultProvider || "openai").trim().toLowerCase();
  const defaultModel = String(stored.defaultModel || stored.openaiModel || "gpt-5.4-mini").trim();
  const fallbackProvider = String(stored.fallbackProvider || defaultProvider).trim().toLowerCase();
  const fallbackModel = String(stored.fallbackModel || stored.geminiModel || defaultModel).trim();
  const openaiModel = String(stored.openaiModel || "gpt-5.4-mini").trim();
  const geminiModel = String(stored.geminiModel || "gemini-1.5-pro").trim();
  const temperature = Math.max(0, Math.min(2, toSafeNumber(stored.temperature, 0.2)));
  const maxOutputTokens = Math.max(64, toSafeNumber(stored.maxOutputTokens, 1024));
  return {
    status: {
      openaiConfigured: Boolean(decryptSecret(stored.openaiApiKey)),
      geminiConfigured: Boolean(decryptSecret(stored.geminiApiKey)),
      defaultProvider,
    },
    editable: {
      defaultProvider,
      defaultModel,
      fallbackProvider,
      fallbackModel,
      openaiModel,
      geminiModel,
      temperature,
      maxOutputTokens,
    },
  };
}

export async function getAiProvidersSettingsService() {
  return resolveAiProviders(
    sanitizeAiSettings(await getPlatformSettingsRecord(AI_PROVIDERS_KEY))
  );
}

export async function getAiProvidersRuntimeService() {
  const stored = sanitizeAiSettings(await getPlatformSettingsRecord(AI_PROVIDERS_KEY));
  const resolved = resolveAiProviders(stored);
  return {
    ...resolved,
    secrets: {
      openaiApiKey: decryptSecret(stored.openaiApiKey) || "",
      geminiApiKey: decryptSecret(stored.geminiApiKey) || "",
    },
  };
}

export async function updateAiProvidersSettingsService(input: {
  userId: string;
  defaultProvider: string;
  defaultModel: string;
  fallbackProvider: string;
  fallbackModel: string;
  openaiModel: string;
  geminiModel: string;
  temperature?: number | string;
  maxOutputTokens?: number | string;
  openaiApiKey?: string | null;
  geminiApiKey?: string | null;
}) {
  const existing = sanitizeAiSettings(await getPlatformSettingsRecord(AI_PROVIDERS_KEY));
  const next: AiProvidersStoredSettings = {
    defaultProvider: String(input.defaultProvider || "openai").trim().toLowerCase(),
    defaultModel: String(input.defaultModel || "").trim(),
    fallbackProvider: String(input.fallbackProvider || input.defaultProvider || "openai").trim().toLowerCase(),
    fallbackModel: String(input.fallbackModel || input.defaultModel || "").trim(),
    openaiModel: String(input.openaiModel || "").trim(),
    geminiModel: String(input.geminiModel || "").trim(),
    temperature: Math.max(0, Math.min(2, toSafeNumber(input.temperature, 0.2))),
    maxOutputTokens: Math.max(64, toSafeNumber(input.maxOutputTokens, 1024)),
    openaiApiKey:
      typeof input.openaiApiKey === "string" && input.openaiApiKey.trim()
        ? encryptSecret(input.openaiApiKey.trim())
        : existing.openaiApiKey || null,
    geminiApiKey:
      typeof input.geminiApiKey === "string" && input.geminiApiKey.trim()
        ? encryptSecret(input.geminiApiKey.trim())
        : existing.geminiApiKey || null,
  };
  await upsertPlatformSettingsRecord({
    settingsKey: AI_PROVIDERS_KEY,
    settingsJson: next as unknown as Record<string, unknown>,
    userId: input.userId,
  });
  await logAuditSafe({
    userId: input.userId,
    action: "update",
    entity: "platform_settings",
    entityId: AI_PROVIDERS_KEY,
    metadata: { settings_key: AI_PROVIDERS_KEY, platform_scope: "global" },
  });
  return getAiProvidersSettingsService();
}

function resolveBillingWallet(stored: BillingWalletStoredSettings) {
  const billingProvider = String(stored.billingProvider || "hybrid").trim().toLowerCase();
  const stripeWebhookSecretConfigured = Boolean(decryptSecret(stored.stripeWebhookSecret));
  const razorpayWebhookSecretConfigured = Boolean(decryptSecret(stored.razorpayWebhookSecret));
  const billingWebhookUrl = String(stored.billingWebhookUrl || "").trim() || `${normalizeBaseUrl(String(env.PUBLIC_API_BASE_URL || ""), `http://localhost:${env.PORT || "4000"}`)}/api/billing/webhook`;
  return {
    status: {
      stripeConfigured: Boolean(stored.stripePublicKey && decryptSecret(stored.stripeSecretKey)),
      razorpayConfigured: Boolean(stored.razorpayKeyId && decryptSecret(stored.razorpayKeySecret)),
      stripeWebhookSecretConfigured,
      razorpayWebhookSecretConfigured,
      billingProvider,
    },
    editable: {
      billingProvider,
      stripePublicKey: String(stored.stripePublicKey || "").trim(),
      razorpayKeyId: String(stored.razorpayKeyId || "").trim(),
      billingWebhookUrl,
      defaultCurrency: String(stored.defaultCurrency || "INR").trim().toUpperCase(),
      walletAutoTopupDefaultEnabled: Boolean(stored.walletAutoTopupDefaultEnabled),
      walletAutoTopupDefaultAmount: toSafeNumber(stored.walletAutoTopupDefaultAmount, 0),
      walletLowBalanceThresholdDefault: toSafeNumber(stored.walletLowBalanceThresholdDefault, 0),
    },
  };
}

export async function getBillingWalletCheckoutSecretsService() {
  const stored = sanitizeBillingWalletSettings(
    await getPlatformSettingsRecord(BILLING_WALLET_KEY)
  );

  return {
    billingProvider: String(stored.billingProvider || "hybrid").trim().toLowerCase(),
    defaultCurrency: String(stored.defaultCurrency || "INR").trim().toUpperCase(),
    stripe: {
      publicKey: String(stored.stripePublicKey || "").trim(),
      secretKey: decryptSecret(stored.stripeSecretKey) || "",
      webhookSecret: decryptSecret(stored.stripeWebhookSecret) || "",
    },
    razorpay: {
      keyId: String(stored.razorpayKeyId || "").trim(),
      keySecret: decryptSecret(stored.razorpayKeySecret) || "",
      webhookSecret: decryptSecret(stored.razorpayWebhookSecret) || "",
    },
  };
}

export async function getBillingWalletSettingsService() {
  return resolveBillingWallet(
    sanitizeBillingWalletSettings(await getPlatformSettingsRecord(BILLING_WALLET_KEY))
  );
}

export async function updateBillingWalletSettingsService(input: {
  userId: string;
  billingProvider: string;
  stripePublicKey: string;
  stripeSecretKey?: string | null;
  stripeWebhookSecret?: string | null;
  razorpayKeyId: string;
  razorpayKeySecret?: string | null;
  razorpayWebhookSecret?: string | null;
  billingWebhookUrl?: string | null;
  defaultCurrency: string;
  walletAutoTopupDefaultEnabled: boolean;
  walletAutoTopupDefaultAmount: number | string;
  walletLowBalanceThresholdDefault: number | string;
}) {
  const existing = sanitizeBillingWalletSettings(await getPlatformSettingsRecord(BILLING_WALLET_KEY));
  const next: BillingWalletStoredSettings = {
    billingProvider: String(input.billingProvider || "hybrid").trim().toLowerCase(),
    stripePublicKey: String(input.stripePublicKey || "").trim(),
    stripeSecretKey:
      typeof input.stripeSecretKey === "string" && input.stripeSecretKey.trim()
        ? encryptSecret(input.stripeSecretKey.trim())
        : existing.stripeSecretKey || null,
    stripeWebhookSecret:
      typeof input.stripeWebhookSecret === "string" && input.stripeWebhookSecret.trim()
        ? encryptSecret(input.stripeWebhookSecret.trim())
        : existing.stripeWebhookSecret || null,
    razorpayKeyId: String(input.razorpayKeyId || "").trim(),
    razorpayKeySecret:
      typeof input.razorpayKeySecret === "string" && input.razorpayKeySecret.trim()
        ? encryptSecret(input.razorpayKeySecret.trim())
        : existing.razorpayKeySecret || null,
    razorpayWebhookSecret:
      typeof input.razorpayWebhookSecret === "string" && input.razorpayWebhookSecret.trim()
        ? encryptSecret(input.razorpayWebhookSecret.trim())
        : existing.razorpayWebhookSecret || null,
    billingWebhookUrl: String(input.billingWebhookUrl || "").trim(),
    defaultCurrency: String(input.defaultCurrency || "INR").trim().toUpperCase(),
    walletAutoTopupDefaultEnabled: Boolean(input.walletAutoTopupDefaultEnabled),
    walletAutoTopupDefaultAmount: toSafeNumber(input.walletAutoTopupDefaultAmount, 0),
    walletLowBalanceThresholdDefault: toSafeNumber(input.walletLowBalanceThresholdDefault, 0),
  };
  await upsertPlatformSettingsRecord({
    settingsKey: BILLING_WALLET_KEY,
    settingsJson: next as unknown as Record<string, unknown>,
    userId: input.userId,
  });
  await logAuditSafe({
    userId: input.userId,
    action: "update",
    entity: "platform_settings",
    entityId: BILLING_WALLET_KEY,
    metadata: { settings_key: BILLING_WALLET_KEY, platform_scope: "global" },
  });
  return getBillingWalletSettingsService();
}
