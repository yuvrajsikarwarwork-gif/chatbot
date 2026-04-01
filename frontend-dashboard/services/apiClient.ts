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

    const activeWorkspaceId = useAuthStore.getState().activeWorkspace?.workspace_id;
    if (activeWorkspaceId) {
      config.headers.set("x-workspace-id", activeWorkspaceId);
    }

    const activeProjectId = useAuthStore.getState().activeProject?.id;
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
