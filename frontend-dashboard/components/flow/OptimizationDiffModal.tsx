import { X } from "lucide-react";

type OptimizationFieldUpdate = {
  key: string;
  description: string;
};

type OptimizationSuggestion = {
  reasoning: string;
  suggested_prompt: string;
  fieldUpdates?: OptimizationFieldUpdate[];
  notes?: string[];
};

type OptimizationDiffModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onApply: () => void | Promise<void>;
  suggestion: OptimizationSuggestion | null;
  currentPrompt: string;
  nodeLabel?: string | null;
  nodeType?: string | null;
  isApplying?: boolean;
};

export default function OptimizationDiffModal({
  isOpen,
  onClose,
  onApply,
  suggestion,
  currentPrompt,
  nodeLabel,
  nodeType,
  isApplying = false,
}: OptimizationDiffModalProps) {
  if (!isOpen || !suggestion) {
    return null;
  }

  const fieldUpdates = Array.isArray(suggestion.fieldUpdates) ? suggestion.fieldUpdates : [];
  const notes = Array.isArray(suggestion.notes) ? suggestion.notes : [];

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/55 px-4 py-6 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-[1.75rem] border border-border-main bg-surface shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border-main bg-canvas px-6 py-5">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-text-muted">
              AI Optimization Review
            </div>
            <h3 className="mt-2 text-lg font-semibold tracking-tight text-text-main">
              {nodeLabel || "Node"} {nodeType ? <span className="text-text-muted">({nodeType})</span> : null}
            </h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-text-muted">
              Compare the current prompt with the suggested revision before applying it to the flow.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-border-main bg-surface p-2 text-text-muted transition hover:border-primary/30 hover:text-primary"
            title="Close review"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar px-6 py-5">
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-3xl border border-border-main bg-canvas p-4">
              <div className="text-[9px] font-black uppercase tracking-[0.18em] text-text-muted">
                Current Prompt
              </div>
              <pre className="mt-3 whitespace-pre-wrap break-words rounded-2xl border border-border-main bg-surface p-4 text-sm leading-6 text-text-main">
                {currentPrompt || "(No prompt configured)"}
              </pre>
            </section>

            <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="text-[9px] font-black uppercase tracking-[0.18em] text-emerald-700">
                Suggested Prompt
              </div>
              <pre className="mt-3 whitespace-pre-wrap break-words rounded-2xl border border-emerald-200 bg-white p-4 text-sm leading-6 text-text-main">
                {suggestion.suggested_prompt || "(No suggestion returned)"}
              </pre>
            </section>
          </div>

          <section className="mt-4 rounded-3xl border border-border-main bg-canvas p-4">
            <div className="text-[9px] font-black uppercase tracking-[0.18em] text-text-muted">
              Why this helps
            </div>
            <p className="mt-3 text-sm leading-6 text-text-main">
              {suggestion.reasoning || "No reasoning was returned."}
            </p>
          </section>

          {fieldUpdates.length > 0 ? (
            <section className="mt-4 rounded-3xl border border-border-main bg-canvas p-4">
              <div className="text-[9px] font-black uppercase tracking-[0.18em] text-text-muted">
                Field Updates
              </div>
              <div className="mt-3 space-y-2">
                {fieldUpdates.map((field) => (
                  <div
                    key={field.key}
                    className="rounded-2xl border border-border-main bg-surface px-3 py-3"
                  >
                    <div className="text-[10px] font-black uppercase tracking-[0.16em] text-text-muted">
                      {field.key}
                    </div>
                    <div className="mt-1 text-sm leading-6 text-text-main">
                      {field.description}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {notes.length > 0 ? (
            <section className="mt-4 rounded-3xl border border-border-main bg-canvas p-4">
              <div className="text-[9px] font-black uppercase tracking-[0.18em] text-text-muted">
                Notes
              </div>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-text-main">
                {notes.map((note, index) => (
                  <li key={`${note}-${index}`} className="rounded-2xl border border-border-main bg-surface px-3 py-2">
                    {note}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border-main bg-canvas px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border-main bg-surface px-4 py-2.5 text-xs font-black uppercase tracking-[0.16em] text-text-main transition hover:border-primary/30 hover:bg-primary-fade hover:text-primary"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={onApply}
            disabled={isApplying}
            className="rounded-xl bg-primary px-5 py-2.5 text-xs font-black uppercase tracking-[0.16em] text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isApplying ? "Applying..." : "Apply Optimization"}
          </button>
        </div>
      </div>
    </div>
  );
}
