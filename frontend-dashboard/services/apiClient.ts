  import axios from "axios";

  // Helper to ensure the URL is clean and formatted correctly
  const getBaseUrl = () => {
    let url = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
    // Remove trailing slash if present to avoid double-slash errors
    return url.endsWith("/") ? url.slice(0, -1) : url;
  };

  const apiClient = axios.create({
    baseURL: getBaseUrl(),
    headers: {
      "Content-Type": "application/json",
      "Bypass-Tunnel-Reminder": "true",
      "x-localtunnel-skip-warning": "true" // Extra safety for LocalTunnel
    },
  });

  apiClient.interceptors.request.use((config) => {
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("token");

      if (!config.headers) {
        config.headers = {};
      }

      if (token) {
        config.headers["Authorization"] = "Bearer " + token;
      }

      const activeBotId = localStorage.getItem("activeBotId");
      if (activeBotId) {
        config.headers["x-bot-id"] = activeBotId;
      }
    }

    return config;
  });

  apiClient.interceptors.response.use(
    (response) => response,
    (error) => {
      if (!error.response) {
        console.error(`❌ API UNREACHABLE: Is the tunnel active? Base: ${getBaseUrl()}`);
      }

      if (error.response?.status === 401 && typeof window !== 'undefined') {
        localStorage.removeItem("token");
        if (window.location.pathname !== "/login") {
          window.location.href = "/login";
        }
      }
      return Promise.reject(error);
    }
  );

  export default apiClient;