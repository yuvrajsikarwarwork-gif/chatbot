type ExtractionPreviewResult = {
  extracted?: Record<string, any>;
  confidence?: number;
  missingRequired?: string[];
  rawOutput?: string;
  timestamp?: string;
};

type ExtractionPreviewProps = {
  lastResult: ExtractionPreviewResult | null;
};

export default function ExtractionPreview({ lastResult }: ExtractionPreviewProps) {
  if (!lastResult) {
    return (
      <div className="rounded-lg border border-dashed border-border-main bg-canvas px-4 py-3 text-[10px] italic text-text-muted">
        No recent extraction data found. Run a test in the sandbox.
      </div>
    );
  }

  const extracted = lastResult.extracted || {};
  const confidence = Number(lastResult.confidence || 0);
  const missingRequired = Array.isArray(lastResult.missingRequired) ? lastResult.missingRequired : [];
  const timestamp = lastResult.timestamp ? new Date(lastResult.timestamp).toLocaleString() : "";

  return (
    <div className="space-y-3 rounded-xl border border-border-main bg-surface p-3 shadow-inner">
      <div className="flex items-center justify-between border-b border-border-main pb-2">
        <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">Last Extraction</span>
        <span className="text-[9px] text-text-muted">{timestamp}</span>
      </div>

      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-canvas">
          <div
            className={`h-full rounded-full ${confidence >= 0.8 ? "bg-emerald-500" : confidence >= 0.6 ? "bg-amber-500" : "bg-rose-500"}`}
            style={{ width: `${Math.max(0, Math.min(1, confidence)) * 100}%` }}
          />
        </div>
        <span className="font-mono text-[10px] font-black text-text-main">{(confidence * 100).toFixed(0)}%</span>
      </div>

      <div className="grid gap-1">
        {Object.entries(extracted).map(([key, value]) => (
          <div key={key} className="flex items-center justify-between rounded-md bg-canvas px-2 py-1.5 text-[11px]">
            <span className="font-medium text-text-muted">{key}</span>
            <span className="font-mono text-cyan-700">{String(value)}</span>
          </div>
        ))}
      </div>

      {missingRequired.length > 0 ? (
        <div className="rounded-lg border border-rose-100 bg-rose-50 p-2">
          <div className="mb-1 text-[10px] font-black uppercase tracking-widest text-rose-600">
            Missing requirements
          </div>
          <div className="flex flex-wrap gap-1">
            {missingRequired.map((field) => (
              <span key={field} className="rounded-full bg-rose-100 px-2 py-0.5 text-[9px] font-bold text-rose-700">
                {field}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <details>
        <summary className="cursor-pointer text-[9px] text-text-muted hover:text-text-main">View raw LLM JSON</summary>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-900 p-2 text-[9px] text-emerald-400">
          {String(lastResult.rawOutput || "")}
        </pre>
      </details>
    </div>
  );
}
