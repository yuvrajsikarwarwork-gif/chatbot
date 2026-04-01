import apiClient from "./apiClient";

export interface NotificationItem {
  id: string;
  user_id: string;
  workspace_id?: string | null;
  type: string;
  message: string;
  is_read: boolean;
  created_at?: string;
  read_at?: string | null;
  metadata?: Record<string, unknown> | null;
}

export const notificationService = {
  list: async (limit = 12): Promise<{ notifications: NotificationItem[]; unreadCount: number }> => {
    try {
      const res = await apiClient.get("/notifications", {
        params: { limit },
      });
      return res.data;
    } catch (error) {
      console.error("Failed to load notifications", error);
      return { notifications: [], unreadCount: 0 };
    }
  },

  markRead: async (id: string): Promise<NotificationItem> => {
    const res = await apiClient.post(`/notifications/${id}/read`);
    return res.data;
  },

  markAllRead: async (): Promise<{ success: boolean }> => {
    const res = await apiClient.post("/notifications/read-all");
    return res.data;
  },
};
