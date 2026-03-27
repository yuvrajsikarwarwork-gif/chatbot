"use client";

import { HelpCircle } from "lucide-react";

type FormHelpHintProps = {
  label: string;
  hint: string;
};

export default function FormHelpHint({ label, hint }: FormHelpHintProps) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
        {label}
      </label>
      <button
        type="button"
        title={hint}
        aria-label={`${label}: ${hint}`}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface-muted)] text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
      >
        <HelpCircle size={12} />
      </button>
    </div>
  );
}
