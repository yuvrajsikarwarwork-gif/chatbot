import { Request, Response } from "express";

import {
  getAiProvidersSettingsService,
  getBillingWalletSettingsService,
  getEmailServicesSettingsService,
  getGlobalIntegrationsSettingsService,
  listGlobalIntegrationsAuditHistoryService,
  regenerateGlobalVerifyTokenService,
  testGlobalIntegrationsSettingsService,
  testEmailServicesSettingsService,
  updateAiProvidersSettingsService,
  updateBillingWalletSettingsService,
  updateEmailServicesSettingsService,
  updateGlobalIntegrationsSettingsService,
} from "../services/platformSettingsService";

export async function getGlobalIntegrationsSettings(_req: Request, res: Response) {
  res.json(await getGlobalIntegrationsSettingsService());
}

export async function updateGlobalIntegrationsSettings(req: Request, res: Response) {
  const userId = String(req.user?.id || req.user?.user_id || "").trim();
  const result = await updateGlobalIntegrationsSettingsService({
    userId,
    publicApiBaseUrl: String(req.body?.publicApiBaseUrl || ""),
    publicAppBaseUrl: String(req.body?.publicAppBaseUrl || ""),
    metaAppId: String(req.body?.metaAppId || ""),
    embeddedSignupConfigId: String(req.body?.embeddedSignupConfigId || ""),
    metaAppSecret:
      typeof req.body?.metaAppSecret === "string" ? req.body.metaAppSecret : null,
    metaWebhookVerifyToken:
      typeof req.body?.metaWebhookVerifyToken === "string"
        ? req.body.metaWebhookVerifyToken
        : null,
  });

  res.json(result);
}

export async function testGlobalIntegrationsSettings(_req: Request, res: Response) {
  res.json(await testGlobalIntegrationsSettingsService());
}

export async function regenerateGlobalVerifyToken(req: Request, res: Response) {
  const userId = String(req.user?.id || req.user?.user_id || "").trim();
  res.json(await regenerateGlobalVerifyTokenService(userId));
}

export async function listGlobalIntegrationsAuditHistory(_req: Request, res: Response) {
  res.json(await listGlobalIntegrationsAuditHistoryService());
}

export async function getEmailServicesSettings(_req: Request, res: Response) {
  res.json(await getEmailServicesSettingsService());
}

export async function updateEmailServicesSettings(req: Request, res: Response) {
  const userId = String(req.user?.id || req.user?.user_id || "").trim();
  res.json(
    await updateEmailServicesSettingsService({
      userId,
      provider: String(req.body?.provider || "smtp"),
      smtpHost: String(req.body?.smtpHost || ""),
      smtpPort: req.body?.smtpPort,
      smtpUser: String(req.body?.smtpUser || ""),
      smtpFrom: String(req.body?.smtpFrom || ""),
      smtpReplyTo: typeof req.body?.smtpReplyTo === "string" ? req.body.smtpReplyTo : null,
      testRecipient: typeof req.body?.testRecipient === "string" ? req.body.testRecipient : null,
      smtpPass: typeof req.body?.smtpPass === "string" ? req.body.smtpPass : null,
      smtpEncryption: typeof req.body?.smtpEncryption === "string" ? req.body.smtpEncryption : null,
      smtpSenderName: typeof req.body?.smtpSenderName === "string" ? req.body.smtpSenderName : null,
    })
  );
}

export async function testEmailServicesSettings(req: Request, res: Response) {
  res.json(
    await testEmailServicesSettingsService({
      smtpHost: typeof req.body?.smtpHost === "string" ? req.body.smtpHost : null,
      smtpPort: req.body?.smtpPort,
      smtpUser: typeof req.body?.smtpUser === "string" ? req.body.smtpUser : null,
      smtpFrom: typeof req.body?.smtpFrom === "string" ? req.body.smtpFrom : null,
      smtpReplyTo: typeof req.body?.smtpReplyTo === "string" ? req.body.smtpReplyTo : null,
      testRecipient: typeof req.body?.testRecipient === "string" ? req.body.testRecipient : null,
      smtpPass: typeof req.body?.smtpPass === "string" ? req.body.smtpPass : null,
      smtpEncryption: typeof req.body?.smtpEncryption === "string" ? req.body.smtpEncryption : null,
      smtpSenderName: typeof req.body?.smtpSenderName === "string" ? req.body.smtpSenderName : null,
    })
  );
}

export async function getAiProvidersSettings(_req: Request, res: Response) {
  res.json(await getAiProvidersSettingsService());
}

export async function updateAiProvidersSettings(req: Request, res: Response) {
  const userId = String(req.user?.id || req.user?.user_id || "").trim();
  res.json(
    await updateAiProvidersSettingsService({
      userId,
      defaultProvider: String(req.body?.defaultProvider || ""),
      defaultModel: String(req.body?.defaultModel || ""),
      fallbackProvider: String(req.body?.fallbackProvider || ""),
      fallbackModel: String(req.body?.fallbackModel || ""),
      openaiModel: String(req.body?.openaiModel || ""),
      geminiModel: String(req.body?.geminiModel || ""),
      temperature: req.body?.temperature,
      maxOutputTokens: req.body?.maxOutputTokens,
      openaiApiKey: typeof req.body?.openaiApiKey === "string" ? req.body.openaiApiKey : null,
      geminiApiKey: typeof req.body?.geminiApiKey === "string" ? req.body.geminiApiKey : null,
    })
  );
}

export async function getBillingWalletSettings(_req: Request, res: Response) {
  res.json(await getBillingWalletSettingsService());
}

export async function updateBillingWalletSettings(req: Request, res: Response) {
  const userId = String(req.user?.id || req.user?.user_id || "").trim();
  res.json(
    await updateBillingWalletSettingsService({
      userId,
      billingProvider: String(req.body?.billingProvider || "hybrid"),
      stripePublicKey: String(req.body?.stripePublicKey || ""),
      stripeSecretKey: typeof req.body?.stripeSecretKey === "string" ? req.body.stripeSecretKey : null,
      stripeWebhookSecret:
        typeof req.body?.stripeWebhookSecret === "string" ? req.body.stripeWebhookSecret : null,
      razorpayKeyId: String(req.body?.razorpayKeyId || ""),
      razorpayKeySecret: typeof req.body?.razorpayKeySecret === "string" ? req.body.razorpayKeySecret : null,
      razorpayWebhookSecret:
        typeof req.body?.razorpayWebhookSecret === "string" ? req.body.razorpayWebhookSecret : null,
      billingWebhookUrl:
        typeof req.body?.billingWebhookUrl === "string" ? req.body.billingWebhookUrl : null,
      defaultCurrency: String(req.body?.defaultCurrency || "INR"),
      walletAutoTopupDefaultEnabled: Boolean(req.body?.walletAutoTopupDefaultEnabled),
      walletAutoTopupDefaultAmount: req.body?.walletAutoTopupDefaultAmount,
      walletLowBalanceThresholdDefault: req.body?.walletLowBalanceThresholdDefault,
    })
  );
}
