import apiClient from "./apiClient";
import { sessionService } from "./sessionService";

export const authService = {
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
