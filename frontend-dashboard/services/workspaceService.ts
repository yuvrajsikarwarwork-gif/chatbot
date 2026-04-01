import apiClient from "./apiClient";

export interface Workspace {
  id: string;
  name: string;
  owner_user_id: string;
  company_website?: string | null;
  industry?: string | null;
  tax_id?: string | null;
  plan_id?: string | null;
  effective_plan_id?: string | null;
  status: string;
  locked_at?: string | null;
  archived_at?: string | null;
  deleted_at?: string | null;
  purge_after?: string | null;
  subscription_id?: string | null;
  subscription_status?: string | null;
  billing_status?: string | null;
  expiry_date?: string | null;
  grace_period_end?: string | null;
  billing_cycle?: string | null;
  currency?: string | null;
  price_amount?: number | null;
  auto_renew?: boolean | null;
  subscription_plan_name?: string | null;
  seat_quantity?: number | null;
  included_seat_limit?: number | null;
  extra_seat_quantity?: number | null;
  extra_seat_unit_price?: number | null;
  ai_reply_limit?: number | null;
  ai_overage_unit_price?: number | null;
  wallet_auto_topup_enabled?: boolean | null;
  wallet_auto_topup_amount?: number | null;
  wallet_low_balance_threshold?: number | null;
  external_customer_ref?: string | null;
  external_subscription_ref?: string | null;
  current_period_start?: string | null;
  current_period_end?: string | null;
  trial_ends_at?: string | null;
  canceled_at?: string | null;
  billing_metadata?: Record<string, unknown> | null;
  lock_reason?: string | null;
  admin_notes?: string | null;
  agent_seat_limit_override?: number | null;
  project_limit_override?: number | null;
  active_bot_limit_override?: number | null;
  monthly_campaign_limit_override?: number | null;
  max_numbers_override?: number | null;
  ai_reply_limit_override?: number | null;
  campaign_count?: number | null;
  platform_account_count?: number | null;
  created_at?: string;
  updated_at?: string;
  invite_link?: string | null;
  invite_expires_at?: string | null;
  invite_failed?: boolean | null;
  accessGranted?: boolean | null;
  support_access_granted?: boolean | null;
  invite_delivery?: {
    ok: boolean;
    provider: string;
    detail: string;
    checkedAt: string;
  } | null;
}

export interface WorkspaceInviteResponse {
  success: boolean;
  ownerUserId?: string;
  ownerEmail?: string;
  inviteLink?: string | null;
  inviteExpiresAt?: string | null;
  emailDelivery?: {
    ok: boolean;
    provider: string;
    detail: string;
    checkedAt: string;
  } | null;
}

export interface SupportRequest {
  id: string;
  workspace_id: string;
  workspace_name?: string;
  requested_by: string;
  requested_by_name?: string;
  requested_by_email?: string;
  target_user_id?: string | null;
  target_user_name?: string | null;
  target_user_email?: string | null;
  reason: string;
  requested_expires_at?: string | null;
  status: string;
  resolved_by?: string | null;
  resolved_by_name?: string | null;
  resolved_by_email?: string | null;
  resolution_notes?: string | null;
  created_at?: string;
  resolved_at?: string | null;
}

export interface SupportAccessRow {
  workspace_id: string;
  workspace_name?: string;
  user_id: string;
  user_name?: string | null;
  user_email?: string | null;
  granted_by?: string | null;
  granted_by_name?: string | null;
  granted_by_email?: string | null;
  expires_at?: string | null;
}

export interface WorkspaceMember {
  workspace_id: string;
  user_id: string;
  name?: string | null;
  email?: string | null;
  global_role?: string | null;
  role: string;
  status: string;
  permissions_json?: Record<string, unknown> | null;
  invite_link?: string | null;
  invite_expires_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface WalletTransaction {
  id: string;
  workspace_id: string;
  project_id?: string | null;
  conversation_id?: string | null;
  bot_id?: string | null;
  platform?: string | null;
  transaction_type: string;
  entry_kind?: string | null;
  pricing_category?: string | null;
  unit_type?: string | null;
  unit_count?: number | null;
  unit_price?: number | null;
  balance_after?: number | null;
  reference_type?: string | null;
  reference_id?: string | null;
  amount: number;
  external_ref?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string;
}

export interface WorkspaceWalletSummary {
  enabled: boolean;
  balance: number;
  totalCredits: number;
  totalDebits: number;
  recentTransactions: WalletTransaction[];
}

export interface WorkspaceBillingContext {
  workspace: Workspace;
  wallet: WorkspaceWalletSummary;
}

export interface WorkspaceMailSettings {
  workspaceId: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpFrom: string;
  smtpPassConfigured: boolean;
  usesSystemDefault: boolean;
  planName: string;
  billingStatus: string;
  canEdit: boolean;
  restrictionMessage: string | null;
  workspaceMailConfigured: boolean;
  source: "workspace" | "system";
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface WorkspaceMailTestResult {
  ok: boolean;
  detail: string;
  checkedAt: string;
}

export interface WorkspaceOverview {
  workspace: Workspace & {
    max_campaigns?: number | null;
    max_numbers?: number | null;
    max_users?: number | null;
    max_projects?: number | null;
    max_integrations?: number | null;
    max_bots?: number | null;
  };
  metrics: {
    members: number;
    projects: number;
    bots: number;
    flows: number;
    campaigns: number;
    integrations: number;
    conversations: number;
    openConversations: number;
    leads: number;
    openSupportRequests: number;
  };
  limits: {
    users: number | null;
    projects: number | null;
    campaigns: number | null;
    integrations: number | null;
    bots: number | null;
  };
  wallet: WorkspaceWalletSummary;
  support: {
    totalRequests: number;
    openRequests: number;
    activeAccess: number;
    accessGranted?: boolean;
    support_access_granted?: boolean;
  };
}

export interface WorkspaceExportRequest {
  id: string;
  status: string;
  createdAt?: string | null;
  completedAt?: string | null;
  requestedBy?: string | null;
  requestedAt?: string | null;
  fileName?: string | null;
  emailedTo?: string | null;
  previewDownloadPath?: string | null;
}

export interface WorkspaceHistoryRow extends Workspace {
  owner_name?: string | null;
  owner_email?: string | null;
  restore_available?: boolean;
  purge_expired?: boolean;
  purge_days_remaining?: number | null;
}

export const workspaceService = {
  list: async (): Promise<Workspace[]> => {
    const res = await apiClient.get("/workspaces");
    return res.data;
  },

  listHistory: async (): Promise<WorkspaceHistoryRow[]> => {
    const res = await apiClient.get("/workspaces/history");
    return Array.isArray(res.data) ? res.data : [];
  },

  get: async (id: string): Promise<Workspace> => {
    const res = await apiClient.get(`/workspaces/${id}`);
    return res.data;
  },

  getOverview: async (id: string): Promise<WorkspaceOverview> => {
    const res = await apiClient.get(`/workspaces/${id}/overview`);
    return res.data;
  },

  getWallet: async (id: string): Promise<WorkspaceWalletSummary> => {
    const res = await apiClient.get(`/workspaces/${id}/wallet`);
    return res.data;
  },

  getBillingContext: async (id: string): Promise<WorkspaceBillingContext> => {
    const res = await apiClient.get(`/workspaces/${id}/billing-context`);
    return res.data;
  },

  getMailSettings: async (id: string): Promise<WorkspaceMailSettings> => {
    const res = await apiClient.get(`/workspaces/${id}/mail-settings`);
    return res.data;
  },

  updateMailSettings: async (
    id: string,
    payload: {
      smtpHost: string;
      smtpPort: number | string;
      smtpUser: string;
      smtpPass?: string;
      smtpFrom: string;
    }
  ): Promise<WorkspaceMailSettings> => {
    const res = await apiClient.put(`/workspaces/${id}/mail-settings`, payload);
    return res.data;
  },

  testMailSettings: async (
    id: string,
    payload: {
      smtpHost: string;
      smtpPort: number | string;
      smtpUser: string;
      smtpPass?: string;
      smtpFrom: string;
      recipientEmail: string;
    }
  ): Promise<WorkspaceMailTestResult> => {
    const res = await apiClient.post(`/workspaces/${id}/mail-settings/test`, payload);
    return res.data;
  },

  listMembers: async (id: string): Promise<WorkspaceMember[]> => {
    const res = await apiClient.get(`/workspaces/${id}/members`);
    return Array.isArray(res.data) ? res.data : [];
  },

  createWalletAdjustment: async (
    id: string,
    payload: {
      transactionType: "credit" | "debit" | "adjustment";
      amount: number;
      note?: string;
      projectId?: string | null;
      externalRef?: string | null;
    }
  ) => {
    const res = await apiClient.post(`/workspaces/${id}/wallet`, payload);
    return res.data;
  },

  create: async (payload: Record<string, unknown>): Promise<Workspace> => {
    const res = await apiClient.post("/workspaces", payload);
    return res.data;
  },

  update: async (id: string, payload: Record<string, unknown>): Promise<Workspace> => {
    const res = await apiClient.put(`/workspaces/${id}`, payload);
    return res.data;
  },

  delete: async (id: string): Promise<Workspace> => {
    const res = await apiClient.delete(`/workspaces/${id}`);
    return res.data;
  },

  archive: async (id: string): Promise<Workspace> => {
    const res = await apiClient.post(`/workspaces/${id}/archive`);
    return res.data;
  },

  restore: async (id: string): Promise<Workspace> => {
    const res = await apiClient.post(`/workspaces/${id}/restore`);
    return res.data;
  },

  selfRestore: async (id: string): Promise<Workspace> => {
    const res = await apiClient.post(`/workspaces/${id}/self-restore`);
    return res.data;
  },

  updateBilling: async (id: string, payload: Record<string, unknown>): Promise<Workspace> => {
    const res = await apiClient.put(`/workspaces/${id}/billing`, payload);
    return res.data;
  },

  lock: async (id: string, payload: Record<string, unknown>): Promise<Workspace> => {
    const res = await apiClient.post(`/workspaces/${id}/lock`, payload);
    return res.data;
  },

  unlock: async (id: string, payload: Record<string, unknown> = {}): Promise<Workspace> => {
    const res = await apiClient.post(`/workspaces/${id}/unlock`, payload);
    return res.data;
  },

  resendOwnerInvite: async (id: string): Promise<WorkspaceInviteResponse> => {
    const res = await apiClient.post(`/workspaces/${id}/members/resend-owner-invite`);
    return res.data;
  },

  resendMemberInvite: async (
    id: string,
    payload: { userId: string }
  ): Promise<WorkspaceInviteResponse & { userId?: string }> => {
    const res = await apiClient.post(`/workspaces/${id}/invites/resend`, payload);
    return res.data;
  },

  updateOwnerEmailAndResendInvite: async (
    id: string,
    payload: { ownerEmail: string }
  ): Promise<WorkspaceInviteResponse> => {
    const res = await apiClient.post(`/workspaces/${id}/members/update-owner-email`, payload);
    return res.data;
  },

  listSupportAccess: async (id: string): Promise<SupportAccessRow[]> => {
    const res = await apiClient.get(`/workspaces/${id}/support-access`);
    return res.data;
  },

  grantSupportAccess: async (id: string, payload: Record<string, unknown>) => {
    const res = await apiClient.post(`/workspaces/${id}/support-access`, payload);
    return res.data;
  },

  revokeSupportAccess: async (id: string, userId: string) => {
    const res = await apiClient.delete(`/workspaces/${id}/support-access/${userId}`);
    return res.data;
  },

  listSupportRequests: async (id: string): Promise<SupportRequest[]> => {
    const res = await apiClient.get(`/workspaces/${id}/support-requests`);
    return res.data;
  },

  createSupportRequest: async (id: string, payload: Record<string, unknown>): Promise<SupportRequest> => {
    const res = await apiClient.post(`/workspaces/${id}/support-requests`, payload);
    return res.data;
  },

  approveSupportRequest: async (id: string, requestId: string, payload: Record<string, unknown> = {}) => {
    const res = await apiClient.post(`/workspaces/${id}/support-requests/${requestId}/approve`, payload);
    return res.data;
  },

  denySupportRequest: async (id: string, requestId: string, payload: Record<string, unknown> = {}) => {
    const res = await apiClient.post(`/workspaces/${id}/support-requests/${requestId}/deny`, payload);
    return res.data;
  },

  emergencyResetOwnerPassword: async (id: string) => {
    const res = await apiClient.post(`/workspaces/${id}/members/emergency-owner-reset`);
    return res.data;
  },

  requestExport: async (id: string) => {
    const res = await apiClient.post(`/workspaces/${id}/export-requests`);
    return res.data;
  },

  listExportRequests: async (id: string): Promise<WorkspaceExportRequest[]> => {
    const res = await apiClient.get(`/workspaces/${id}/export-requests`);
    return Array.isArray(res.data) ? res.data : [];
  },

  downloadExport: async (id: string, jobId: string): Promise<{ blob: Blob; fileName: string }> => {
    const res = await apiClient.get(`/workspaces/${id}/export-requests/${jobId}/download`, {
      responseType: "blob",
    });
    const disposition = String(res.headers?.["content-disposition"] || "");
    const match = disposition.match(/filename="?([^"]+)"?/i);
    return {
      blob: res.data as Blob,
      fileName: match?.[1] || `workspace-export-${jobId}.json`,
    };
  },
};
