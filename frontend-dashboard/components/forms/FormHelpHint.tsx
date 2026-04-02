"use client";

import { HelpCircle } from "lucide-react";

type FormHelpHintProps = {
  label: string;
  hint: string;
};

export default function FormHelpHint({ label, hint }: FormHelpHintProps) {
  return (
    <div className="mb-2 flex items-center gap-1.5">
      <label className="block text-[10px] font-bold uppercase tracking-widest text-text-muted">
        {label}
      </label>
      <span className="group relative inline-flex align-middle">
        <button
          type="button"
          title={hint}
          aria-label={`${label}: ${hint}`}
          className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border-main bg-canvas text-text-muted transition-colors hover:border-primary hover:text-primary"
        >
          <HelpCircle size={12} />
        </button>
        <span className="pointer-events-none absolute bottom-full left-1/2 z-[100] mb-2 w-48 -translate-x-1/2 rounded-xl border border-border-main bg-surface px-3 py-2 text-[10px] font-semibold leading-relaxed tracking-wide text-text-main opacity-0 shadow-xl transition-all duration-200 group-hover:-translate-y-1 group-hover:opacity-100">
          {hint}
        </span>
      </span>
    </div>
  );
}
