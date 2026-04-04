import type { ReactNode } from "react";

type VersionTrigger = {
  id?: string | null;
  keyword?: string | null;
  targetFlowId?: string | null;
  targetNodeId?: string | null;
  sourceType?: string | null;
  priority?: number | null;
  isActive?: boolean | null;
};

type VersionNodeDiff = {
  nodeId: string;
  leftNode?: Record<string, any> | null;
  rightNode?: Record<string, any> | null;
};

export type FlowVersionComparison = {
  flowId: string;
  leftVersion: {
    versionNumber: number;
    publishedAt?: string | null;
    changeSummary?: string | null;
    triggers: number;
    nodes: number;
  };
  rightVersion: {
    versionNumber: number;
    publishedAt?: string | null;
    changeSummary?: string | null;
    triggers: number;
    nodes: number;
  };
  summary: {
    nodesChanged: number;
    triggersAdded: number;
    triggersRemoved: number;
  };
  nodeDiffs: VersionNodeDiff[];
  addedTriggers: VersionTrigger[];
  removedTriggers: VersionTrigger[];
};

function formatDateTime(value?: string | null) {
  if (!value) {
    return "Unknown";
  }

  const time = new Date(value).getTime();
  if (Number.isNaN(time)) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(time));
}

function getNodeLabel(node?: Record<string, any> | null) {
  if (!node) {
    return "Unknown node";
  }

  return String(node?.data?.label || node?.data?.text || node?.type || node?.id || "Node").trim();
}

function stringifyNode(node?: Record<string, any> | null) {
  if (!node) {
    return "null";
  }

  return JSON.stringify(node, null, 2);
}

function getTriggerLabel(trigger: VersionTrigger) {
  const keyword = String(trigger.keyword || "").trim() || "unknown";
  const targetNode = String(trigger.targetNodeId || "").trim();
  const targetFlow = String(trigger.targetFlowId || "").trim();
  const details = [targetFlow ? `flow ${targetFlow}` : "", targetNode ? `node ${targetNode}` : ""].filter(Boolean);
  return details.length > 0 ? `${keyword} → ${details.join(" / ")}` : keyword;
}

function DiffBadge({
  tone,
  children,
}: {
  tone: "emerald" | "rose" | "amber" | "slate";
  children: ReactNode;
}) {
  const toneClasses: Record<typeof tone, string> = {
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
    rose: "bg-rose-50 text-rose-700 border-rose-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
    slate: "bg-slate-100 text-slate-700 border-slate-200",
  };

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${toneClasses[tone]}`}>
      {children}
    </span>
  );
}

export function VersionCompareFeed({ diffData }: { diffData: FlowVersionComparison }) {
  const { summary, addedTriggers, removedTriggers, nodeDiffs, leftVersion, rightVersion } = diffData;

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-2xl border border-border-main bg-canvas p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">
              Rollback impact
            </div>
            <div className="mt-1 text-sm font-semibold text-text-main">
              Current v{leftVersion.versionNumber} → Restore v{rightVersion.versionNumber}
            </div>
            <div className="mt-1 text-xs text-text-muted">
              {leftVersion.changeSummary || "Current published version"} → {rightVersion.changeSummary || "Selected restore target"}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DiffBadge tone="emerald">+{summary.triggersAdded} restored</DiffBadge>
            <DiffBadge tone="rose">-{summary.triggersRemoved} removed</DiffBadge>
            <DiffBadge tone="amber">~{summary.nodesChanged} nodes</DiffBadge>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-3">
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-700">Current triggers</div>
            <div className="mt-2 text-xl font-semibold text-emerald-800">{leftVersion.triggers}</div>
          </div>
          <div className="rounded-xl border border-cyan-100 bg-cyan-50 px-3 py-3">
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-700">Restore triggers</div>
            <div className="mt-2 text-xl font-semibold text-cyan-800">{rightVersion.triggers}</div>
          </div>
          <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-3">
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-700">Current nodes</div>
            <div className="mt-2 text-xl font-semibold text-amber-800">{leftVersion.nodes}</div>
          </div>
          <div className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-3">
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-rose-700">Restore nodes</div>
            <div className="mt-2 text-xl font-semibold text-rose-800">{rightVersion.nodes}</div>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">
          Routing changes
        </div>
        <div className="space-y-3">
          {addedTriggers.length === 0 && removedTriggers.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border-main bg-canvas px-4 py-5 text-sm text-text-muted">
              No routing changes detected between these versions.
            </div>
          ) : (
            <>
              {addedTriggers.map((trigger, index) => (
                <div key={`added-${trigger.id || trigger.keyword || index}`} className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-700">
                      Will be restored
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-text-main">{getTriggerLabel(trigger)}</div>
                      <div className="mt-1 text-xs text-text-muted">
                        {trigger.sourceType || "universal"} · priority {Number(trigger.priority || 0)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {removedTriggers.map((trigger, index) => (
                <div key={`removed-${trigger.id || trigger.keyword || index}`} className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-full bg-rose-100 px-2 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-rose-700">
                      Will be removed
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-text-main">{getTriggerLabel(trigger)}</div>
                      <div className="mt-1 text-xs text-text-muted">
                        {trigger.sourceType || "universal"} · priority {Number(trigger.priority || 0)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </section>

      <section>
        <div className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">
          Node changes
        </div>
        <div className="space-y-3">
          {nodeDiffs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border-main bg-canvas px-4 py-5 text-sm text-text-muted">
              No node-level changes detected.
            </div>
          ) : (
            nodeDiffs.map((entry, index) => {
              const leftNode = entry.leftNode || null;
              const rightNode = entry.rightNode || null;
              const leftExists = Boolean(leftNode);
              const rightExists = Boolean(rightNode);
              const status = leftExists && rightExists ? "Modified" : leftExists ? "Will be removed" : "Will be restored";
              const tone = leftExists && rightExists ? "amber" : leftExists ? "rose" : "emerald";

              return (
                <details key={`${entry.nodeId}-${index}`} className="group rounded-2xl border border-border-main bg-surface">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-text-main">
                        {getNodeLabel(rightNode || leftNode)} <span className="text-text-muted">({entry.nodeId})</span>
                      </div>
                      <div className="mt-1 text-xs text-text-muted">
                        {leftExists && rightExists ? "Node content changed" : leftExists ? "Node exists only in current version" : "Node exists only in restore target"}
                      </div>
                    </div>
                    <DiffBadge tone={tone}>{status}</DiffBadge>
                  </summary>
                  <div className="grid gap-3 border-t border-border-main bg-canvas p-4 lg:grid-cols-2">
                    <div>
                      <div className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">
                        Current version
                      </div>
                      <pre className="max-h-72 overflow-auto rounded-xl border border-border-main bg-surface p-3 text-[11px] leading-5 text-text-main">
                        {stringifyNode(leftNode)}
                      </pre>
                    </div>
                    <div>
                      <div className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">
                        Restore target
                      </div>
                      <pre className="max-h-72 overflow-auto rounded-xl border border-border-main bg-surface p-3 text-[11px] leading-5 text-text-main">
                        {stringifyNode(rightNode)}
                      </pre>
                    </div>
                  </div>
                </details>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
