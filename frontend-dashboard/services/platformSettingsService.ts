import apiClient from "./apiClient";

export interface GlobalIntegrationsSettings {
  meta: {
    appId: string | null;
    appIdPreview: string | null;
    appSecretConfigured: boolean;
    embeddedSignupConfigId: string | null;
    embeddedSignupConfigIdPreview: string | null;
    signatureVerificationEnabled: boolean;
    metaWebhookVerifyTokenConfigured: boolean;
    metaWebhookVerifyTokenPreview: string | null;
  };
  urls: {
    publicApiBaseUrl: string;
    publicAppBaseUrl: string;
    globalWebhookUrl: string;
    metaOAuthCallbackUrl: string;
    integrationsAppUrl: string;
  };
  readiness: {
    metaEmbeddedSignupReady: boolean;
    metaOAuthReady: boolean;
    globalWebhookReady: boolean;
  };
  editable: {
    publicApiBaseUrl: string;
    publicAppBaseUrl: string;
    metaAppId: string;
    embeddedSignupConfigId: string;
  };
}

export interface GlobalIntegrationsTestResult {
  ok: boolean;
  checkedAt: string;
  checks: Array<{
    key: string;
    label: string;
    ok: boolean;
    detail: string;
  }>;
}

export interface PlatformSettingsAuditRow {
  id: string;
  action: string;
  entity: string;
  entity_id: string;
  created_at: string;
  actor_user_name?: string | null;
  actor_user_email?: string | null;
  user_name?: string | null;
  user_email?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface EmailServicesSettings {
  status: {
    configured: boolean;
    secure: boolean;
    provider: string;
  };
  previews: {
    smtpHost: string | null;
    smtpPort: number;
    smtpUser: string | null;
    smtpFrom: string | null;
    smtpReplyTo: string | null;
    smtpPassConfigured: boolean;
    testRecipient: string | null;
    smtpEncryption?: string | null;
    smtpSenderName?: string | null;
  };
  editable: {
    provider: string;
    smtpHost: string;
    smtpPort: number;
    smtpUser: string;
    smtpFrom: string;
    smtpReplyTo: string;
    testRecipient: string;
    smtpEncryption: string;
    smtpSenderName: string;
  };
}

export interface EmailServicesTestResult {
  ok: boolean;
  detail: string;
  checkedAt: string;
}

export interface AiProvidersSettings {
  status: {
    openaiConfigured: boolean;
    geminiConfigured: boolean;
    defaultProvider: string;
  };
  editable: {
    defaultProvider: string;
    defaultModel: string;
    fallbackProvider: string;
    fallbackModel: string;
    openaiModel: string;
    geminiModel: string;
    temperature: number;
    maxOutputTokens: number;
  };
}

export interface BillingWalletSettings {
  status: {
    stripeConfigured: boolean;
    razorpayConfigured: boolean;
    stripeWebhookSecretConfigured: boolean;
    razorpayWebhookSecretConfigured: boolean;
    billingProvider: string;
  };
  editable: {
    billingProvider: string;
    stripePublicKey: string;
    razorpayKeyId: string;
    billingWebhookUrl: string;
    defaultCurrency: string;
    walletAutoTopupDefaultEnabled: boolean;
    walletAutoTopupDefaultAmount: number;
    walletLowBalanceThresholdDefault: number;
  };
}

export const platformSettingsService = {
  getGlobalIntegrations: async (): Promise<GlobalIntegrationsSettings> => {
    const res = await apiClient.get("/platform-settings/global-integrations");
    return res.data;
  },

  updateGlobalIntegrations: async (payload: {
    publicApiBaseUrl: string;
    publicAppBaseUrl: string;
    metaAppId: string;
    embeddedSignupConfigId: string;
    metaAppSecret?: string;
    metaWebhookVerifyToken?: string;
  }): Promise<GlobalIntegrationsSettings> => {
    const res = await apiClient.put("/platform-settings/global-integrations", payload);
    return res.data;
  },

  testGlobalIntegrations: async (): Promise<GlobalIntegrationsTestResult> => {
    const res = await apiClient.post("/platform-settings/global-integrations/test");
    return res.data;
  },

  regenerateGlobalVerifyToken: async (): Promise<{
    regeneratedToken: string;
    settings: GlobalIntegrationsSettings;
  }> => {
    const res = await apiClient.post("/platform-settings/global-integrations/regenerate-verify-token");
    return res.data;
  },

  listGlobalIntegrationsHistory: async (): Promise<PlatformSettingsAuditRow[]> => {
    const res = await apiClient.get("/platform-settings/global-integrations/history");
    return res.data;
  },

  getEmailServices: async (): Promise<EmailServicesSettings> => {
    const res = await apiClient.get("/platform-settings/email-services");
    return res.data;
  },

  updateEmailServices: async (payload: {
    provider: string;
    smtpHost: string;
    smtpPort: number | string;
    smtpUser: string;
    smtpFrom: string;
    smtpReplyTo?: string;
    testRecipient?: string;
    smtpPass?: string;
    smtpEncryption?: string;
    smtpSenderName?: string;
  }): Promise<EmailServicesSettings> => {
    const res = await apiClient.put("/platform-settings/email-services", payload);
    return res.data;
  },

  testEmailServices: async (payload: {
    provider: string;
    smtpHost: string;
    smtpPort: number | string;
    smtpUser: string;
    smtpFrom: string;
    smtpReplyTo?: string;
    testRecipient?: string;
    smtpPass?: string;
    smtpEncryption?: string;
    smtpSenderName?: string;
  }): Promise<EmailServicesTestResult> => {
    const res = await apiClient.post("/platform-settings/email-services/test", payload);
    return res.data;
  },

  getAiProviders: async (): Promise<AiProvidersSettings> => {
    const res = await apiClient.get("/platform-settings/ai-providers");
    return res.data;
  },

  updateAiProviders: async (payload: {
    defaultProvider: string;
    defaultModel: string;
    fallbackProvider: string;
    fallbackModel: string;
    openaiModel: string;
    geminiModel: string;
    temperature: number | string;
    maxOutputTokens: number | string;
    openaiApiKey?: string;
    geminiApiKey?: string;
  }): Promise<AiProvidersSettings> => {
    const res = await apiClient.put("/platform-settings/ai-providers", payload);
    return res.data;
  },

  getBillingWallet: async (): Promise<BillingWalletSettings> => {
    const res = await apiClient.get("/platform-settings/billing-wallet");
    return res.data;
  },

  updateBillingWallet: async (payload: {
    billingProvider: string;
    stripePublicKey: string;
    stripeSecretKey?: string;
    stripeWebhookSecret?: string;
    razorpayKeyId: string;
    razorpayKeySecret?: string;
    razorpayWebhookSecret?: string;
    billingWebhookUrl?: string;
    defaultCurrency: string;
    walletAutoTopupDefaultEnabled: boolean;
    walletAutoTopupDefaultAmount: number | string;
    walletLowBalanceThresholdDefault: number | string;
  }): Promise<BillingWalletSettings> => {
    const res = await apiClient.put("/platform-settings/billing-wallet", payload);
    return res.data;
  },
};
