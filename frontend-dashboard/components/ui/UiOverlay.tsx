import { useUiStore } from "../../store/uiStore";

const TOAST_TONE_CLASS: Record<string, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  error: "border-red-200 bg-red-50 text-red-800",
  info: "border-slate-200 bg-white text-slate-800",
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
              <div className="text-sm font-medium">{toast.message}</div>
              <button
                onClick={() => dismissToast(toast.id)}
                className="rounded-full px-2 py-1 text-xs opacity-60 hover:opacity-100"
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>

      {confirm?.open ? (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface-strong)] p-6 shadow-2xl">
            <h2 className="text-xl font-semibold text-[var(--text)]">{confirm.title}</h2>
            <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{confirm.message}</p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => resolveConfirm(false)}
                className="rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] px-4 py-2 text-sm font-medium text-[var(--text)]"
              >
                {confirm.cancelLabel}
              </button>
              <button
                onClick={() => resolveConfirm(true)}
                className="rounded-xl bg-[var(--accent-strong)] px-4 py-2 text-sm font-medium text-white"
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
