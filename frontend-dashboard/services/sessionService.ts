import { useAuthStore } from "../store/authStore";

const TOKEN_KEY = "token";

export const sessionService = {
  getToken: () => {
    const storeToken = useAuthStore.getState().token;
    if (storeToken) {
      return storeToken;
    }

    if (typeof window === "undefined") {
      return null;
    }

    return window.localStorage.getItem(TOKEN_KEY);
  },

  clear: () => {
    useAuthStore.getState().clearAuth();

    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem("activeBotId");
  },
};
