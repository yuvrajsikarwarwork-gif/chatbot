import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BrainCircuit, Clock3, RefreshCcw, Radar, Sparkles, TrendingDown } from "lucide-react";

import { flowService } from "../../services/flowService";
import OptimizationDiffModal from "./OptimizationDiffModal";

type OptimizationReasonBucket = "low_confidence" | "missing_data" | "semantic_miss";

type OptimizationNodeRow = {
  nodeId: string;
  flowId?: string | null;
  nodeType?: string | null;
  totalAttempts?: number;
  failureCount?: number;
  fallbackCount?: number;
  avgConfidence?: number | null;
  failureRate?: number;
  reasonBucket?: OptimizationReasonBucket;
  sampleInputs?: string[];
  lastSeenAt?: string | null;
};

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

type OptimizerTabProps = {
  workspaceId?: string | null;
  onJumpToNode?: (nodeId: string) => void;
  selectedNodeId?: string | null;
  getNodeById?: (nodeId: string) => any | null;
  onApplySuggestion?: (nodeId: string, suggestion: OptimizationSuggestion) => void | Promise<void>;
};

const REASON_STYLES: Record<
  OptimizationReasonBucket,
  { label: string; pill: string; description: string }
> = {
  low_confidence: {
    label: "Low Confidence",
    pill: "bg-amber-50 text-amber-700 border-amber-200",
    description: "The model is completing, but the confidence signal is weak.",
  },
  missing_data: {
    label: "Missing Data",
    pill: "bg-sky-50 text-sky-700 border-sky-200",
    description: "The node is losing users because required inputs are incomplete.",
  },
  semantic_miss: {
    label: "Semantic Miss",
    pill: "bg-rose-50 text-rose-700 border-rose-200",
    description: "The intent classifier is routing to fallback too often.",
  },
};

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "0%";
  }
  return `${Math.max(0, Math.min(1, Number(value))) * 100}%`;
}

function formatShortDate(value?: string | null) {
  if (!value) {
    return "Unknown";
  }
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) {
    return value;
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(time));
}

function formatReasonBucket(bucket?: OptimizationReasonBucket | null) {
  if (!bucket) {
    return "Low Confidence";
  }
  return REASON_STYLES[bucket]?.label || bucket;
}

function getNodePrompt(nodeData: any) {
  return String(nodeData?.prompt || nodeData?.systemPrompt || nodeData?.instructions || "").trim();
}

function getNodeLabel(nodeData: any, fallback = "Node") {
  return String(nodeData?.label || nodeData?.text || nodeData?.title || fallback).trim() || fallback;
}

export default function OptimizerTab({
  workspaceId,
  onJumpToNode,
  selectedNodeId,
  getNodeById,
  onApplySuggestion,
}: OptimizerTabProps) {
  const [rows, setRows] = useState<OptimizationNodeRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastLoadedAt, setLastLoadedAt] = useState<string | null>(null);
  const [optimizingNodeId, setOptimizingNodeId] = useState<string | null>(null);
  const [pendingSuggestion, setPendingSuggestion] = useState<OptimizationSuggestion | null>(null);
  const [pendingNodeId, setPendingNodeId] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [modalError, setModalError] = useState("");

  const loadReport = async () => {
    if (!workspaceId) {
      setRows([]);
      setError("");
      setLastLoadedAt(null);
      return;
    }

    try {
      setIsLoading(true);
      setError("");
      const data = await flowService.getOptimizationReport(workspaceId, {
        limit: 12,
        sinceHours: 24 * 7,
      });
      setRows(Array.isArray(data) ? data : Array.isArray((data as any)?.data) ? (data as any).data : []);
      setLastLoadedAt(new Date().toISOString());
    } catch (fetchError: any) {
      console.error("Failed to load optimizer report", fetchError);
      setRows([]);
      setError(fetchError?.response?.data?.error || fetchError?.message || "Failed to load optimizer report.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadReport().catch(() => null);
  }, [workspaceId]);

  const sortedRows = useMemo(() => {
    return [...rows].sort((left, right) => {
      const leftFailureRate = Number(left.failureRate || 0);
      const rightFailureRate = Number(right.failureRate || 0);
      if (rightFailureRate !== leftFailureRate) {
        return rightFailureRate - leftFailureRate;
      }

      const leftConfidence = Number(left.avgConfidence ?? 1);
      const rightConfidence = Number(right.avgConfidence ?? 1);
      if (leftConfidence !== rightConfidence) {
        return leftConfidence - rightConfidence;
      }

      return Number(right.failureCount || 0) - Number(left.failureCount || 0);
    });
  }, [rows]);

  const summary = useMemo(() => {
    return sortedRows.reduce(
      (acc, row) => {
        acc.totalNodes += 1;
        acc.totalAttempts += Number(row.totalAttempts || 0);
        acc.totalFailures += Number(row.failureCount || 0);
        if ((row.failureRate || 0) >= 0.1) {
          acc.flaggedNodes += 1;
        }
        return acc;
      },
      { totalNodes: 0, totalAttempts: 0, totalFailures: 0, flaggedNodes: 0 }
    );
  }, [sortedRows]);

  const handleOptimize = async (row: OptimizationNodeRow) => {
    const node = getNodeById?.(row.nodeId);
    const nodeData = node?.data && typeof node.data === "object" ? node.data : {};
    if (!node) {
      setModalError("That node is no longer on the canvas.");
      return;
    }

    try {
      setModalError("");
      setOptimizingNodeId(row.nodeId);
      const response = await flowService.getOptimizationSuggestion({
        nodeData,
        sampleInputs: Array.isArray(row.sampleInputs) ? row.sampleInputs : [],
        reasonBucket: String(row.reasonBucket || "low_confidence"),
      });
      const suggestion = (response?.data || response || null) as OptimizationSuggestion | null;
      if (!suggestion || !String(suggestion.suggested_prompt || "").trim()) {
        throw new Error("AI did not return a usable suggestion.");
      }
      setPendingNodeId(row.nodeId);
      setPendingSuggestion(suggestion);
    } catch (fetchError: any) {
      console.error("Failed to generate optimization suggestion", fetchError);
      setModalError(fetchError?.response?.data?.error || fetchError?.message || "Failed to generate optimization suggestion.");
    } finally {
      setOptimizingNodeId(null);
    }
  };

  const handleApplySuggestion = async () => {
    if (!pendingNodeId || !pendingSuggestion || !onApplySuggestion) {
      return;
    }

    try {
      setIsApplying(true);
      await onApplySuggestion(pendingNodeId, pendingSuggestion);
      setPendingNodeId(null);
      setPendingSuggestion(null);
      setModalError("");
    } catch (applyError: any) {
      console.error("Failed to apply optimization suggestion", applyError);
      setModalError(applyError?.message || "Failed to apply optimization.");
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[1.5rem] border border-border-main bg-surface shadow-sm">
      <div className="flex items-start justify-between gap-4 border-b border-border-main bg-canvas px-5 py-4">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-text-muted">
            <Radar size={14} className="text-primary" />
            Optimizer
          </div>
          <h3 className="mt-2 text-sm font-semibold tracking-tight text-text-main">
            Underperforming nodes
          </h3>
          <p className="mt-1 text-xs leading-5 text-text-muted">
            The nodes below are bleeding users into fallback paths or running with weak confidence.
          </p>
        </div>

        <button
          type="button"
          onClick={() => loadReport().catch(() => null)}
          className="inline-flex items-center gap-2 rounded-full border border-border-main bg-surface px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-text-main transition hover:border-primary/30 hover:bg-primary-fade hover:text-primary"
        >
          <RefreshCcw size={12} />
          Refresh
        </button>
      </div>

      <div className="border-b border-border-main bg-surface px-5 py-3">
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-border-main bg-canvas px-3 py-2">
            <div className="text-[9px] font-black uppercase tracking-[0.16em] text-text-muted">Nodes</div>
            <div className="mt-1 text-sm font-semibold text-text-main">{summary.totalNodes}</div>
          </div>
          <div className="rounded-2xl border border-border-main bg-canvas px-3 py-2">
            <div className="text-[9px] font-black uppercase tracking-[0.16em] text-text-muted">Flagged</div>
            <div className="mt-1 text-sm font-semibold text-amber-700">{summary.flaggedNodes}</div>
          </div>
          <div className="rounded-2xl border border-border-main bg-canvas px-3 py-2">
            <div className="text-[9px] font-black uppercase tracking-[0.16em] text-text-muted">Attempts</div>
            <div className="mt-1 text-sm font-semibold text-text-main">{summary.totalAttempts}</div>
          </div>
        </div>
        {lastLoadedAt ? (
          <div className="mt-2 text-[10px] text-text-muted">Last updated {formatShortDate(lastLoadedAt)}</div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
        {isLoading ? (
          <div className="flex h-full items-center justify-center p-8 text-center">
            <div className="max-w-xs">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-border-main bg-canvas text-primary">
                <BrainCircuit size={20} />
              </div>
              <div className="mt-4 text-sm font-semibold text-text-main">Analyzing node performance...</div>
              <div className="mt-2 text-xs leading-5 text-text-muted">
                Scanning the last 7 days of AI intent and extraction activity for weak spots.
              </div>
            </div>
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center p-8 text-center">
            <div className="max-w-xs rounded-3xl border border-rose-200 bg-rose-50 px-5 py-6 text-left">
              <div className="flex items-center gap-2 text-sm font-semibold text-rose-700">
                <AlertTriangle size={16} />
                Could not load optimizer data
              </div>
              <div className="mt-2 text-xs leading-5 text-rose-700/80">{error}</div>
              <button
                type="button"
                onClick={() => loadReport().catch(() => null)}
                className="mt-4 inline-flex items-center gap-2 rounded-full border border-rose-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-rose-700 transition hover:bg-rose-100"
              >
                <RefreshCcw size={12} />
                Retry
              </button>
            </div>
          </div>
        ) : sortedRows.length === 0 ? (
          <div className="flex h-full items-center justify-center p-8 text-center">
            <div className="max-w-xs">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-700">
                <Sparkles size={20} />
              </div>
              <div className="mt-4 text-sm font-semibold text-text-main">No weak nodes found</div>
              <div className="mt-2 text-xs leading-5 text-text-muted">
                Everything in the last 7 days is staying above the optimization threshold.
              </div>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-border-main">
            {sortedRows.map((row) => {
              const bucket = (row.reasonBucket || "low_confidence") as OptimizationReasonBucket;
              const style = REASON_STYLES[bucket] || REASON_STYLES.low_confidence;
              const isSelected = selectedNodeId && String(selectedNodeId) === String(row.nodeId);
              const sampleInputs = Array.isArray(row.sampleInputs) ? row.sampleInputs : [];
              const node = getNodeById?.(row.nodeId);
              const nodeData = node?.data && typeof node.data === "object" ? node.data : {};

              return (
                <div
                  key={`${row.flowId || "flow"}-${row.nodeId}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => onJumpToNode?.(row.nodeId)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onJumpToNode?.(row.nodeId);
                    }
                  }}
                  className={`block w-full border-0 px-5 py-4 text-left transition ${
                    isSelected ? "bg-primary-fade/70" : "hover:bg-primary-fade/40"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-[0.16em] ${style.pill}`}>
                          {formatReasonBucket(bucket)}
                        </span>
                        <span className="rounded-full border border-border-main bg-canvas px-2 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-text-muted">
                          {String(row.nodeType || "node").replace(/_/g, " ")}
                        </span>
                      </div>
                      <div className="mt-3 flex items-center gap-2 text-sm font-semibold text-text-main">
                        <TrendingDown size={14} className="text-rose-500" />
                        {Math.round(Number(row.failureRate || 0) * 100)}% failure rate
                      </div>
                      <div className="mt-1 text-xs text-text-muted">
                        Avg confidence {formatPercent(row.avgConfidence)}
                        <span className="mx-2 text-border-main">|</span>
                        {Number(row.failureCount || 0)} failures out of {Number(row.totalAttempts || 0)} attempts
                      </div>
                      <div className="mt-2 text-[10px] leading-5 text-text-muted">
                        {style.description}
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-[10px] font-mono text-text-muted">
                      <div>ID {String(row.nodeId || "").slice(0, 8)}</div>
                      <div className="mt-1 inline-flex items-center gap-1 rounded-full border border-border-main bg-canvas px-2 py-1 font-sans font-black uppercase tracking-[0.16em]">
                        <Clock3 size={10} />
                        {formatShortDate(row.lastSeenAt)}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-3 rounded-2xl border border-border-main bg-canvas p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[9px] font-black uppercase tracking-[0.16em] text-text-muted">
                        Sample failures
                      </div>
                      <div className="text-[9px] font-black uppercase tracking-[0.16em] text-text-muted">
                        {sampleInputs.length} samples
                      </div>
                    </div>
                    {sampleInputs.length > 0 ? (
                      <div className="space-y-2">
                        {sampleInputs.slice(0, 2).map((input, index) => (
                          <div
                            key={`${row.nodeId}-sample-${index}`}
                            className="rounded-xl border border-border-main bg-surface px-3 py-2 text-[11px] italic text-text-main"
                          >
                            "{input}"
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-text-muted">
                        No sample inputs were captured for this node yet.
                      </div>
                    )}
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => onJumpToNode?.(row.nodeId)}
                      className="rounded-full border border-border-main bg-surface px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-text-main transition hover:border-primary/30 hover:bg-primary-fade hover:text-primary"
                    >
                      Jump to node
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleOptimize(row).catch(() => null);
                      }}
                      disabled={optimizingNodeId === row.nodeId}
                      className="rounded-full bg-primary px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {optimizingNodeId === row.nodeId ? "Optimizing..." : "Optimize"}
                    </button>
                  </div>

                  {node ? (
                    <div className="mt-3 rounded-2xl border border-border-main bg-surface px-3 py-2 text-[10px] text-text-muted">
                      Prompt: {getNodePrompt(nodeData) || "n/a"}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}

        {modalError ? (
          <div className="border-t border-border-main bg-rose-50 px-5 py-3 text-xs text-rose-700">
            {modalError}
          </div>
        ) : null}
      </div>

      <OptimizationDiffModal
        isOpen={Boolean(pendingSuggestion && pendingNodeId)}
        onClose={() => {
          setPendingNodeId(null);
          setPendingSuggestion(null);
          setModalError("");
        }}
        onApply={handleApplySuggestion}
        suggestion={pendingSuggestion}
        currentPrompt={pendingNodeId && getNodeById?.(pendingNodeId) ? getNodePrompt(getNodeById(pendingNodeId)?.data) : ""}
        nodeLabel={pendingNodeId && getNodeById?.(pendingNodeId) ? getNodeLabel(getNodeById(pendingNodeId)?.data) : null}
        nodeType={pendingNodeId && getNodeById?.(pendingNodeId) ? String(getNodeById(pendingNodeId)?.type || "") : null}
        isApplying={isApplying}
      />
    </div>
  );
}
