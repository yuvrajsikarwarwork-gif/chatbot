import axios, { AxiosHeaders } from "axios";
import { API_URL } from "../config/apiConfig";
import { useAuthStore } from "../store/authStore";
import { sessionService } from "./sessionService";
import { extractApiErrorInfo } from "./apiError";

const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

apiClient.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = sessionService.getToken();

    if (!config.headers) {
      config.headers = new AxiosHeaders();
    } else if (!(config.headers instanceof AxiosHeaders)) {
      config.headers = new AxiosHeaders(config.headers);
    }

    if (token) {
      config.headers.set("Authorization", `Bearer ${token}`);
    }

    const activeBotId = localStorage.getItem("activeBotId");
    if (activeBotId) {
      config.headers.set("x-bot-id", activeBotId);
    }

    const state = useAuthStore.getState();
    const activeWorkspaceId = state.activeWorkspace?.workspace_id;
    if (activeWorkspaceId) {
      config.headers.set("x-workspace-id", activeWorkspaceId);
    }

    const activeOrganizationId = state.activeOrganization?.id;
    const organizationImpersonation = state.organizationImpersonation;
    if (organizationImpersonation?.active && organizationImpersonation.organizationId) {
      config.headers.set("x-impersonation-mode", organizationImpersonation.mode);
      config.headers.set("x-impersonation-organization-id", organizationImpersonation.organizationId);
      config.headers.set("x-impersonator-id", organizationImpersonation.impersonatorId);
      config.headers.set("x-impersonation-readonly", organizationImpersonation.readOnly ? "true" : "false");
    } else if (!activeWorkspaceId && activeOrganizationId) {
      config.headers.set("x-organization-id", activeOrganizationId);
    }

    const activeProjectId = state.activeProject?.id;
    if (activeProjectId) {
      config.headers.set("x-project-id", activeProjectId);
    }
  }

  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (!error.response) {
      console.error(`API unreachable at ${API_URL}`);
    }

    (error as any).apiErrorInfo = extractApiErrorInfo(error);

    if (error.response?.status === 401 && typeof window !== "undefined") {
      sessionService.clear();
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;
