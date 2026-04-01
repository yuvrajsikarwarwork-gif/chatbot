import apiClient from "./apiClient";
import { sessionService } from "./sessionService";

export const authService = {
  pricingCheckout: async (payload: {
    email: string;
    password: string;
    name: string;
    companyName: string;
    ownerPhone?: string | null;
    companyWebsite?: string | null;
    industry?: string | null;
    taxId?: string | null;
    planId?: string;
    billingCycle?: string;
    currency?: string;
    seats?: number;
    bots?: number;
    campaignVolume?: number;
    aiReplies?: number;
    addOnIds?: string[];
  }) => {
    const res = await apiClient.post("/auth/pricing-checkout/init", payload);
    return res.data;
  },

  pricingCheckoutConfirm: async (payload: {
    referenceId: string;
    orderId?: string;
    paymentId?: string;
    signature?: string;
    sessionId?: string;
    password: string;
    planId: string;
  }) => {
    const res = await apiClient.post("/auth/pricing-checkout/confirm", payload);
    if (res.data.token) {
      localStorage.setItem("token", res.data.token);
    }
    return res.data;
  },

  login: async (email: string, password: string) => {
    const res = await apiClient.post("/auth/login", {
      email,
      password,
    });

    if (res.data.token) {
      localStorage.setItem("token", res.data.token);
    }
    
    return res.data;
  },

  me: async () => {
    const res = await apiClient.get("/auth/me");
    return res.data;
  },

  startSupportSession: async (payload: {
    workspaceId: string;
    durationHours?: number;
    consentConfirmed: boolean;
    consentNote?: string;
  }) => {
    const res = await apiClient.post("/auth/support-session", payload);
    return res.data;
  },

  endSupportSession: async (payload?: { workspaceId?: string | null }) => {
    const res = await apiClient.delete("/auth/support-session", {
      params: payload?.workspaceId ? { workspaceId: payload.workspaceId } : undefined,
    });
    return res.data;
  },

  startWorkspaceImpersonation: async (workspaceId: string, payload: { durationHours?: number; consentNote?: string } = {}) => {
    const res = await apiClient.post(`/admin/impersonate/${workspaceId}`, payload);
    return res.data;
  },

  endWorkspaceImpersonation: async (payload?: { workspaceId?: string | null }) => {
    const res = await apiClient.post("/admin/impersonate/exit", payload || {});
    return res.data;
  },

  previewInvite: async (token: string) => {
    const res = await apiClient.get("/auth/invite", {
      params: { token },
    });
    return res.data;
  },

  acceptInvite: async (payload: { token: string; password: string; name?: string }) => {
    const res = await apiClient.post("/auth/accept-invite", payload);
    if (res.data.token) {
      localStorage.setItem("token", res.data.token);
    }
    return res.data;
  },

  requestPasswordReset: async (email: string) => {
    const res = await apiClient.post("/auth/request-password-reset", { email });
    return res.data;
  },

  verifyPasswordResetOtp: async (payload: { email: string; otp: string }) => {
    const res = await apiClient.post("/auth/verify-password-reset-otp", payload);
    return res.data;
  },

  resetPassword: async (payload: { email: string; otp: string; password: string }) => {
    const res = await apiClient.post("/auth/reset-password", payload);
    return res.data;
  },

  logout: async () => {
    try {
      await apiClient.post(
        "/auth/logout",
        {},
        {
          validateStatus: (status) => Boolean(status && (status === 401 || (status >= 200 && status < 300))),
        }
      );
    } catch (err) {
      console.warn("Logout request skipped", err);
    }
    sessionService.clear();
  },
};
