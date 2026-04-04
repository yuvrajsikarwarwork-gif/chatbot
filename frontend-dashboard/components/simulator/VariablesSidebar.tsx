import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ChevronRight, History, Variable } from "lucide-react";

type VariableHistoryEntry = {
  value: any;
  updatedAt: string;
  nodeId: string | null;
  nodeType: string | null;
  method: string | null;
  sourceLabel: string | null;
  confidence: number | null;
};

type VariableProvenanceRecord = {
  value: any;
  updatedAt: string;
  nodeId: string | null;
  nodeType: string | null;
  method: string | null;
  sourceLabel: string | null;
  confidence: number | null;
  history?: VariableHistoryEntry[];
};

type VariablesSidebarProps = {
  variables?: Record<string, any>;
  currentNodeId?: string | null;
  flowName?: string | null;
  onJumpToNode?: (nodeId: string) => void;
};

const RESERVED_KEYS = new Set(["_variable_provenance"]);

function formatVariableValue(value: any) {
  if (value === null || value === undefined) {
    return "null";
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function formatConfidence(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "n/a";
  }
  return `${Math.max(0, Math.min(1, Number(value))) * 100}%`;
}

function formatTimestamp(value: string | null | undefined) {
  if (!value) {
    return "Unknown";
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function getProvenanceMap(variables: Record<string, any>) {
  const raw = variables?._variable_provenance;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, VariableProvenanceRecord>;
  }
  return {};
}

function VariableRow({
  name,
  value,
  provenance,
  onJumpToNode,
}: {
  name: string;
  value: any;
  provenance?: VariableProvenanceRecord | null;
  onJumpToNode?: (nodeId: string) => void;
}) {
  const [hasChanged, setHasChanged] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const formattedValue = useMemo(() => formatVariableValue(value), [value]);
  const history = Array.isArray(provenance?.history) ? provenance!.history : [];
  const sourceNodeId = provenance?.nodeId || null;
  const sourceLabel = provenance?.sourceLabel || null;
  const canJump = Boolean(sourceNodeId && onJumpToNode);

  useEffect(() => {
    setHasChanged(true);
    const timer = window.setTimeout(() => setHasChanged(false), 1800);
    return () => window.clearTimeout(timer);
  }, [formattedValue]);

  return (
    <div className={`border-b border-border-main px-3 py-2 transition-colors duration-500 ${hasChanged ? "bg-emerald-50/80" : "bg-surface"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[11px] font-black uppercase tracking-[0.16em] text-text-muted">
            {name}
          </div>
          {sourceNodeId || provenance?.method || provenance?.confidence !== null ? (
            <div className="mt-1 flex flex-wrap gap-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-text-muted">
              {sourceNodeId ? (
                <span className="rounded-full border border-border-main bg-canvas px-1.5 py-0.5">
                  Node {sourceNodeId}
                </span>
              ) : null}
              {provenance?.method ? (
                <span className="rounded-full border border-border-main bg-canvas px-1.5 py-0.5">
                  {provenance.method}
                </span>
              ) : null}
              {provenance?.confidence !== null && provenance?.confidence !== undefined ? (
                <span className="rounded-full border border-border-main bg-canvas px-1.5 py-0.5">
                  {formatConfidence(provenance.confidence)}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 items-start gap-1">
          {canJump ? (
            <button
              type="button"
              onClick={() => {
                if (sourceNodeId && onJumpToNode) {
                  onJumpToNode(sourceNodeId);
                }
              }}
              className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary-fade px-2 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-primary transition hover:opacity-90"
              title="Jump to source node"
            >
              <ArrowRight size={10} />
              Jump
            </button>
          ) : null}
          {history.length > 0 ? (
            <button
              type="button"
              onClick={() => setShowHistory((current) => !current)}
              className="inline-flex items-center gap-1 rounded-full border border-border-main bg-canvas px-2 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-text-muted transition hover:bg-surface"
            >
              <History size={10} />
              {showHistory ? "Hide" : "History"}
            </button>
          ) : null}
        </div>
      </div>

      <div
        className={`mt-2 min-w-0 text-right text-[11px] font-mono transition-colors ${
          hasChanged ? "font-bold text-emerald-700" : "text-text-main"
        }`}
        title={formattedValue}
      >
        <span className="break-words">{formattedValue}</span>
      </div>

      {sourceLabel ? (
        <div className="mt-2 text-[10px] text-text-muted">
          Source: <span className="font-semibold text-text-main">{sourceLabel}</span>
        </div>
      ) : null}

      {showHistory && history.length > 0 ? (
        <div className="mt-3 rounded-2xl border border-border-main bg-canvas px-3 py-2">
          <div className="text-[9px] font-black uppercase tracking-[0.16em] text-text-muted">
            Value History
          </div>
          <div className="mt-2 space-y-2">
            {[...(history || []), provenance ? {
              value: provenance.value,
              updatedAt: provenance.updatedAt,
              nodeId: provenance.nodeId,
              nodeType: provenance.nodeType,
              method: provenance.method,
              sourceLabel: provenance.sourceLabel,
              confidence: provenance.confidence,
            } : null]
              .filter(Boolean)
              .map((entry, index) => {
                const snapshot = entry as VariableHistoryEntry;
                return (
                  <div key={`${name}-history-${index}`} className="rounded-lg border border-border-main bg-surface px-2 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[9px] font-black uppercase tracking-[0.14em] text-text-muted">
                        {snapshot.method || "update"}
                      </div>
                      <div className="text-[9px] text-text-muted">
                        {formatTimestamp(snapshot.updatedAt)}
                      </div>
                    </div>
                    <div className="mt-1 font-mono text-[10px] text-text-main">
                      {formatVariableValue(snapshot.value)}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                      {snapshot.nodeId ? (
                        <span className="rounded-full border border-border-main bg-canvas px-1.5 py-0.5">
                          Node {snapshot.nodeId}
                        </span>
                      ) : null}
                      {snapshot.confidence !== null && snapshot.confidence !== undefined ? (
                        <span className="rounded-full border border-border-main bg-canvas px-1.5 py-0.5">
                          {formatConfidence(snapshot.confidence)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function VariablesSidebar({
  variables = {},
  currentNodeId = null,
  flowName = null,
  onJumpToNode,
}: VariablesSidebarProps) {
  const provenanceMap = useMemo(() => getProvenanceMap(variables || {}), [variables]);
  const visibleKeys = useMemo(
    () =>
      Object.keys(variables || {})
        .filter((key) => !RESERVED_KEYS.has(key) && !key.startsWith("_"))
        .sort(),
    [variables]
  );
  const canJump = Boolean(currentNodeId && onJumpToNode);

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-3xl border border-border-main bg-canvas shadow-sm">
      <div className="flex items-center justify-between border-b border-border-main bg-surface px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Variable size={14} className="text-primary" />
            <h3 className="truncate text-xs font-black uppercase tracking-[0.18em] text-text-muted">
              Live Memory
            </h3>
          </div>
          {flowName ? (
            <p className="mt-1 truncate text-[10px] text-text-muted">{flowName}</p>
          ) : null}
        </div>
        <span className="rounded-full border border-border-main bg-canvas px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.16em] text-text-muted">
          {visibleKeys.length} keys
        </span>
      </div>

      <div className="border-b border-border-main bg-canvas px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[9px] font-black uppercase tracking-[0.18em] text-text-muted">
              Last Changed By
            </div>
            <div className="mt-1 truncate font-mono text-[11px] text-text-main">
              {currentNodeId || "Unknown"}
            </div>
          </div>
          <button
            type="button"
            disabled={!canJump}
            onClick={() => {
              if (currentNodeId && onJumpToNode) {
                onJumpToNode(currentNodeId);
              }
            }}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary bg-primary px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Jump
            <ArrowRight size={11} />
          </button>
        </div>
        {!canJump ? (
          <p className="mt-2 text-[10px] text-text-muted">
            Select a node in the flow or a conversation with an active node to jump to it.
          </p>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {visibleKeys.length === 0 ? (
          <div className="flex h-full items-center justify-center p-4 text-center text-[11px] italic text-text-muted">
            No variables set in this session.
          </div>
        ) : (
          <div>
            {visibleKeys.map((key) => (
              <VariableRow
                key={key}
                name={key}
                value={variables[key]}
                provenance={provenanceMap[key] || null}
                onJumpToNode={onJumpToNode}
              />
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-border-main bg-surface px-4 py-2 text-[9px] font-medium text-text-muted">
        <span className="inline-flex items-center gap-1">
          <ChevronRight size={10} />
          Read-only debug view for the current conversation memory.
        </span>
      </div>
    </div>
  );
}
