import { create } from "zustand";
import { persist } from "zustand/middleware";
import { notify } from "./uiStore";

interface BotState {
  selectedBotId: string | null;
  activeBotId: string | null;
  unlockedBotIds: string[];
  setSelectedBotId: (id: string | null) => void;
  syncSelectedBot: (validIds: string[]) => string | null;
  setBotUnlock: (id: string) => void;
  setBotLock: (id: string) => void;
  syncUnlockedBots: (validIds: string[]) => void;
  checkLockStatus: () => void;
}

export const useBotStore = create<BotState>()(
  persist(
    (set, get) => ({
      selectedBotId: null,
      activeBotId: null,
      unlockedBotIds: [],

      setSelectedBotId: (id) => {
        if (typeof window !== "undefined") {
          if (id) {
            localStorage.setItem("activeBotId", id);
          } else {
            localStorage.removeItem("activeBotId");
          }
        }

        set({ selectedBotId: id, activeBotId: id });
      },

      syncSelectedBot: (validIds) => {
        const current = get().selectedBotId;
        const nextId = current && validIds.includes(current)
          ? current
          : validIds[0] || null;

        if (typeof window !== "undefined") {
          if (nextId) {
            localStorage.setItem("activeBotId", nextId);
          } else {
            localStorage.removeItem("activeBotId");
          }
        }

        set({ selectedBotId: nextId, activeBotId: nextId });
        return nextId;
      },

      setBotUnlock: (id) => {
        const current = get().unlockedBotIds;
        if (current.includes(id)) return;
        if (current.length >= 5) {
          notify(
            "Builder limit reached. Please lock another flow before unlocking a new one.",
            "error"
          );
          return;
        }
        set({ unlockedBotIds: [...current, id] });
      },

      setBotLock: (id) => {
        set({
          unlockedBotIds: get().unlockedBotIds.filter((botId) => botId !== id),
        });
      },

      syncUnlockedBots: (validIds) => {
        const current = get().unlockedBotIds;
        const cleaned = current.filter((id) => validIds.includes(id));
        if (current.length !== cleaned.length) {
          set({ unlockedBotIds: cleaned });
        }
      },

      checkLockStatus: () => {
        // Reserved for future auto-expiry logic.
      },
    }),
    { name: "active-bot-storage" }
  )
);
