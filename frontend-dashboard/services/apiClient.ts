import axios from "axios";

// Strictly hardcode to localhost. 
// The local dashboard does not need the tunnel to talk to the local backend.
const apiClient = axios.create({
  baseURL: "http://localhost:4000/api",
  headers: {
    "Content-Type": "application/json"
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
      console.error(`❌ API UNREACHABLE at http://localhost:4000/api`);
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