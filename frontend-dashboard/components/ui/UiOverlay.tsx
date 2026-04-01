import { useUiStore } from "../../store/uiStore";

const TOAST_TONE_CLASS: Record<string, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  error: "border-red-200 bg-red-50 text-red-800",
  info: "border-border-main bg-surface text-text-main",
};

export default function UiOverlay() {
  const toasts = useUiStore((state) => state.toasts);
  const confirm = useUiStore((state) => state.confirm);
  const dismissToast = useUiStore((state) => state.dismissToast);
  const resolveConfirm = useUiStore((state) => state.resolveConfirm);

  return (
    <>
      <div className="pointer-events-none fixed right-4 top-4 z-[120] flex w-full max-w-sm flex-col gap-3">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto rounded-2xl border px-4 py-3 shadow-lg ${TOAST_TONE_CLASS[toast.tone]}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                {toast.title ? (
                  <div className="text-sm font-semibold">{toast.title}</div>
                ) : null}
                <div className="text-sm font-medium leading-5">{toast.message}</div>
                {toast.details && toast.details.length > 0 ? (
                  <div className="mt-2 space-y-1">
                    {toast.details.slice(0, 4).map((detail, index) => (
                      <div key={`${toast.id}-detail-${index}`} className="text-xs leading-4 opacity-80">
                        {detail}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
              <button
                onClick={() => dismissToast(toast.id)}
                className="rounded-full px-2 py-1 text-xs opacity-60 hover:opacity-100"
              >
                Ã—
              </button>
            </div>
          </div>
        ))}
      </div>

      {confirm?.open ? (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[1.5rem] border border-border-main bg-surface p-6 shadow-2xl">
            <h2 className="text-xl font-semibold text-text-main">{confirm.title}</h2>
            <p className="mt-3 text-sm leading-6 text-text-muted">{confirm.message}</p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => resolveConfirm(false)}
                className="rounded-xl border border-border-main bg-transparent px-4 py-2 text-sm font-medium text-text-main transition-all hover:bg-primary-fade hover:text-primary hover:border-primary/30"
              >
                {confirm.cancelLabel}
              </button>
              <button
                onClick={() => resolveConfirm(true)}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
              >
                {confirm.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

