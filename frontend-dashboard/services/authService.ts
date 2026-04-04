import apiClient from "./apiClient";
import { sessionService } from "./sessionService";
import { useAuthStore } from "../store/authStore";

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

  switchOrganization: async (organizationId: string) => {
    const store = useAuthStore.getState();
    const targetOrganization = store.organizations.find((organization) => organization.id === organizationId) || null;

    if (!targetOrganization) {
      throw new Error("Organization not found");
    }

    store.clearOrganizationImpersonation();
    store.setActiveOrganization(targetOrganization, null);

    const data = await authService.me();
    const currentStore = useAuthStore.getState();
    currentStore.setPermissionSnapshot({
      user: data.user || currentStore.user,
      memberships: data.memberships || currentStore.memberships,
      activeWorkspace: null,
      projectAccesses: data.projectAccesses || currentStore.projectAccesses,
      activeProject: null,
      resolvedAccess: data.resolvedAccess || null,
      organizations: data.organizations || currentStore.organizations,
      activeOrganization: data.activeOrganization || targetOrganization,
      activeOrganizationMembership:
        data.activeOrganizationMembership || currentStore.activeOrganizationMembership || null,
      organizationImpersonation: null,
    });

    return data;
  },

  startOrganizationImpersonation: async (organizationId: string) => {
    const store = useAuthStore.getState();
    const response = await apiClient.post(`/admin/impersonate/organization/${organizationId}`, {});
    const data = response.data?.data || {};
    const targetOrganization =
      store.organizations.find((organization) => organization.id === organizationId) ||
      data.activeOrganization ||
      null;

    if (targetOrganization) {
      store.setActiveOrganization(targetOrganization, data.activeOrganizationMembership || null);
    }
    store.setOrganizationImpersonation(
      data.organizationImpersonation || {
        active: true,
        mode: "organization",
        organizationId,
        organizationName: targetOrganization?.name || organizationId,
        impersonatorId: store.user?.id || "",
        readOnly: true,
        startedAt: new Date().toISOString(),
        expiresAt: null,
      }
    );

    const refreshed = await authService.me();
    const currentStore = useAuthStore.getState();
    currentStore.setPermissionSnapshot({
      user: refreshed.user || currentStore.user,
      memberships: refreshed.memberships || currentStore.memberships,
      activeWorkspace: null,
      projectAccesses: refreshed.projectAccesses || currentStore.projectAccesses,
      activeProject: null,
      resolvedAccess: refreshed.resolvedAccess || null,
      organizations: refreshed.organizations || currentStore.organizations,
      activeOrganization: refreshed.activeOrganization || targetOrganization,
      activeOrganizationMembership:
        refreshed.activeOrganizationMembership ||
        data.activeOrganizationMembership ||
        currentStore.activeOrganizationMembership ||
        null,
      organizationImpersonation: currentStore.organizationImpersonation,
    });

    return { ...response.data, context: refreshed };
  },

  endOrganizationImpersonation: async (organizationId?: string | null) => {
    const response = await apiClient.post("/admin/impersonate/organization/exit", {
      organizationId: organizationId || undefined,
    });
    const data = response.data?.data || {};
    const currentStore = useAuthStore.getState();

    currentStore.clearOrganizationImpersonation();
    currentStore.setPermissionSnapshot({
      user: data.user || currentStore.user,
      memberships: data.memberships || currentStore.memberships,
      activeWorkspace: null,
      projectAccesses: data.projectAccesses || currentStore.projectAccesses,
      activeProject: null,
      resolvedAccess: data.resolvedAccess || null,
      organizations: data.organizations || currentStore.organizations,
      activeOrganization: null,
      activeOrganizationMembership: null,
      organizationImpersonation: null,
    });

    return response.data;
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
