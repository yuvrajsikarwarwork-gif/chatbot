import { create } from "zustand";

type ToastTone = "success" | "error" | "info";

type ToastItem = {
  id: string;
  title?: string;
  message: string;
  details?: string[];
  tone: ToastTone;
  durationMs?: number;
};

type ToastPayload = {
  title?: string;
  message: string;
  details?: string[];
  tone?: ToastTone;
  durationMs?: number;
};

type ConfirmState = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  resolve?: (value: boolean) => void;
};

interface UiState {
  toasts: ToastItem[];
  confirm: ConfirmState | null;
  pushToast: (payload: string | ToastPayload, tone?: ToastTone) => void;
  dismissToast: (id: string) => void;
  openConfirm: (
    title: string,
    message: string,
    confirmLabel?: string,
    cancelLabel?: string
  ) => Promise<boolean>;
  resolveConfirm: (value: boolean) => void;
}

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useUiStore = create<UiState>((set, get) => ({
  toasts: [],
  confirm: null,
  pushToast: (payload, tone = "info") => {
    const id = uid();
    const nextToast =
      typeof payload === "string"
        ? { id, message: payload, tone, details: [] as string[], durationMs: 3200 }
        : {
            id,
            title: payload.title,
            message: payload.message,
            details: Array.isArray(payload.details) ? payload.details : [],
            tone: payload.tone || tone,
            durationMs: payload.durationMs || (Array.isArray(payload.details) && payload.details.length > 0 ? 9000 : 3200),
          };

    set((state) => ({
      toasts: [...state.toasts, nextToast],
    }));

    setTimeout(() => {
      get().dismissToast(id);
    }, nextToast.durationMs || 3200);
  },
  dismissToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    })),
  openConfirm: (title, message, confirmLabel = "Confirm", cancelLabel = "Cancel") =>
    new Promise<boolean>((resolve) => {
      set({
        confirm: {
          open: true,
          title,
          message,
          confirmLabel,
          cancelLabel,
          resolve,
        },
      });
    }),
  resolveConfirm: (value) => {
    const active = get().confirm;
    active?.resolve?.(value);
    set({ confirm: null });
  },
}));

export function notify(payload: string | ToastPayload, tone: ToastTone = "info") {
  useUiStore.getState().pushToast(payload, tone);
}

export function confirmAction(
  title: string,
  message: string,
  confirmLabel?: string,
  cancelLabel?: string
) {
  return useUiStore.getState().openConfirm(title, message, confirmLabel, cancelLabel);
}
