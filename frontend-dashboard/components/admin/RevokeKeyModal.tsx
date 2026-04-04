import { useEffect, useState } from "react";

type RevokeKeyModalProps = {
  open: boolean;
  keyName: string;
  isSubmitting?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void | Promise<void>;
};

export default function RevokeKeyModal({
  open,
  keyName,
  isSubmitting = false,
  onCancel,
  onConfirm,
}: RevokeKeyModalProps) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open) {
      setReason("");
    }
  }, [open]);

  if (!open) {
    return null;
  }

  const trimmedReason = reason.trim();
  const canConfirm = trimmedReason.length >= 5 && !isSubmitting;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-gray-900/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[2rem] border border-rose-100 bg-white p-8 shadow-2xl">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-rose-100 text-xl text-rose-600">
            ⚠️
          </div>
          <h3 className="text-lg font-semibold tracking-tight text-text-main">Revoke API key?</h3>
          <p className="mt-2 text-sm leading-6 text-text-muted">
            This will immediately disable <span className="font-semibold text-text-main">"{keyName}"</span> for every integration using it.
          </p>
        </div>

        <label className="space-y-2">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">
            Reason for revocation
          </div>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="e.g. Credential leaked in a public repo, rotating after offboarding..."
            className="min-h-[100px] w-full rounded-2xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main outline-none transition focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
          />
        </label>

        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            onClick={() => onConfirm(trimmedReason)}
            disabled={!canConfirm}
            className="rounded-2xl border border-rose-600 bg-rose-600 px-4 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? "Revoking..." : "Confirm revocation"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-2xl border border-border-main bg-surface px-4 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-text-muted transition hover:border-primary/30 hover:text-text-main"
          >
            Cancel
          </button>
          <p className="text-center text-[9px] font-bold uppercase tracking-[0.18em] text-text-muted">
            A reason is required for the audit log.
          </p>
        </div>
      </div>
    </div>
  );
}
