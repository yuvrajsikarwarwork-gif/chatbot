import { useState } from "react";

type ApiKeyRevealModalProps = {
  apiKey: string;
  onDone: () => void;
};

export default function ApiKeyRevealModal({ apiKey, onDone }: ApiKeyRevealModalProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(apiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-gray-900/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md animate-in zoom-in-95 duration-200 rounded-[2rem] border border-amber-200 bg-white p-8 shadow-2xl">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-2xl text-amber-700">
            🔑
          </div>
          <h3 className="text-lg font-bold text-text-main">New API secret generated</h3>
          <p className="mt-2 text-xs leading-5 text-text-muted">
            This secret is shown once. Copy it now and store it securely. After you dismiss this dialog, the full value will not be shown again.
          </p>
        </div>

        <div className="mt-6 rounded-2xl border border-dashed border-amber-200 bg-amber-50 p-4">
          <div className="break-all font-mono text-sm leading-6 text-purple-700">{apiKey}</div>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex flex-1 items-center justify-center rounded-xl border border-border-main bg-surface px-4 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-text-main transition hover:border-primary/30 hover:bg-primary-fade hover:text-primary"
          >
            {copied ? "Copied" : "Copy secret"}
          </button>
          <button
            type="button"
            onClick={onDone}
            className="inline-flex flex-1 items-center justify-center rounded-xl border border-gray-900 bg-gray-900 px-4 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-white transition hover:bg-black"
          >
            I saved it
          </button>
        </div>
      </div>
    </div>
  );
}
