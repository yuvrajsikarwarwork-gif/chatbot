import { create } from "zustand";
import { persist } from "zustand/middleware";

export type AdminTimeWindow = "24 hours" | "7 days" | "30 days";

interface AdminAnalyticsState {
  adminTimeWindow: AdminTimeWindow;
  setAdminTimeWindow: (value: AdminTimeWindow) => void;
}

const STORAGE_KEY = "control_tower_admin_time_window";

export const useAdminAnalyticsStore = create<AdminAnalyticsState>()(
  persist(
    (set) => ({
      adminTimeWindow: "24 hours",
      setAdminTimeWindow: (value) => set({ adminTimeWindow: value }),
    }),
    {
      name: STORAGE_KEY,
    }
  )
);
