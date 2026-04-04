import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Clock3,
  Flame,
  RefreshCcw,
  Radar,
  Zap,
} from "lucide-react";

import { analyticsService } from "../../services/analyticsService";

type RegistryHealthRow = {
  event_type: string;
  count?: number;
  failure_count?: number;
  flow_id?: string | null;
  node_id?: string | null;
  target_flow_id?: string | null;
  handler_id?: string | null;
  last_seen_at?: string | null;
  samples?: Array<{
    conversationId?: string | null;
    metadata?: Record<string, any>;
  }>;
};

type RegistryKeywordRow = {
  keyword: string;
  count: number;
  flow_count?: number;
  node_count?: number;
  last_seen_at?: string | null;
};

type RegistryData = {
  health: RegistryHealthRow[];
  leaky: RegistryHealthRow[];
  keywords: RegistryKeywordRow[];
  fallbackKeywords: RegistryKeywordRow[];
  unpublishedSummary: {
    total: number;
    flows: Array<{
      id: string;
      name?: string | null;
      updated_at?: string | null;
      trigger_count?: number;
    }>;
  };
};

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US").format(Math.max(0, Number(value || 0)));
}

function formatRelative(value?: string | null) {
  if (!value) return "Unknown";
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return "Unknown";

  const diffMs = Date.now() - time;
  const diffMinutes = Math.max(1, Math.floor(diffMs / 60000));
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

type AnalyticsTimeRange = "24h" | "7d" | "30d";

const TIME_RANGE_HOURS: Record<AnalyticsTimeRange, number> = {
  "24h": 24,
  "7d": 24 * 7,
  "30d": 24 * 30,
};

function useRegistryAnalyticsData(workspaceId?: string | null, timeRange: AnalyticsTimeRange = "24h") {
  const sinceHours = TIME_RANGE_HOURS[timeRange];
  const [data, setData] = useState<RegistryData>({
    health: [],
    leaky: [],
    keywords: [],
    fallbackKeywords: [],
    unpublishedSummary: {
      total: 0,
      flows: [],
    },
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const reload = async () => {
    if (!workspaceId) {
      setData({
        health: [],
        leaky: [],
        keywords: [],
        fallbackKeywords: [],
        unpublishedSummary: { total: 0, flows: [] },
      });
      setError("");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const [health, leaky, keywords, fallbackKeywords, unpublishedSummary] = await Promise.all([
        analyticsService.getRegistryDropoffReport(workspaceId, {
          eventType: "ANY",
          limit: 100,
          sinceHours,
        }),
        analyticsService.getRegistryDropoffReport(workspaceId, {
          eventType: "ERROR_HANDLED",
          limit: 5,
          sinceHours,
        }),
        analyticsService.getRegistryKeywordPopularity(workspaceId, {
          limit: 5,
          sinceHours,
        }),
        analyticsService.getRegistryLegacyFallbackInspector(workspaceId, {
          limit: 8,
          sinceHours,
        }),
        analyticsService.getRegistryUnpublishedFlowSummary(workspaceId, {
          limit: 5,
        }),
      ]);

      setData({
        health: Array.isArray(health) ? health : [],
        leaky: Array.isArray(leaky) ? leaky : [],
        keywords: Array.isArray(keywords) ? keywords : [],
        fallbackKeywords: Array.isArray(fallbackKeywords) ? fallbackKeywords : [],
        unpublishedSummary: {
          total: Number(unpublishedSummary?.total || 0),
          flows: Array.isArray(unpublishedSummary?.flows) ? unpublishedSummary.flows : [],
        },
      });
    } catch (err: any) {
      console.error("Failed to load registry analytics", err);
      setError(err?.response?.data?.error || "Failed to load registry analytics.");
      setData({
        health: [],
        leaky: [],
        keywords: [],
        fallbackKeywords: [],
        unpublishedSummary: { total: 0, flows: [] },
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload().catch(() => null);
  }, [workspaceId, sinceHours]);

  return {
    data,
    loading,
    error,
    sinceHours,
    reload,
  };
}

function MetricPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "emerald" | "rose" | "cyan" | "amber";
}) {
  const toneClasses: Record<typeof tone, string> = {
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
    rose: "bg-rose-50 text-rose-700 border-rose-100",
    cyan: "bg-cyan-50 text-cyan-700 border-cyan-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
  };

  return (
    <div className={`rounded-2xl border px-4 py-3 ${toneClasses[tone]}`}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.2em] opacity-75">
        {label}
      </div>
      <div className="mt-2 text-xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}

function HealthRadarCard({ rows }: { rows: RegistryHealthRow[] }) {
  const summary = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        const count = Number(row.count ?? row.failure_count ?? 0);
        if (row.event_type === "TRIGGER_MATCH") acc.triggers += count;
        if (row.event_type === "LEGACY_FALLBACK_MATCH") acc.legacyFallbacks += count;
        if (row.event_type === "ERROR_HANDLED") acc.errors += count;
        if (row.event_type === "OVERRIDE_EXECUTED") acc.overrides += count;
        acc.total += count;
        return acc;
      },
      { triggers: 0, legacyFallbacks: 0, errors: 0, overrides: 0, total: 0 }
    );
  }, [rows]);

  const healthRate =
    summary.triggers + summary.errors > 0
      ? Math.round((summary.triggers / (summary.triggers + summary.errors)) * 100)
      : 0;

  return (
    <section className="rounded-[1.5rem] border border-border-main bg-surface p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted">
            Health Radar
          </div>
          <h2 className="mt-2 text-[1.1rem] font-semibold tracking-tight text-text-main">
            Registry success vs recovery
          </h2>
          <p className="mt-2 text-sm leading-6 text-text-muted">
            A quick signal for whether the registry is matching cleanly or recovering from failures.
          </p>
        </div>
        <div className="rounded-2xl border border-border-main bg-canvas p-3 text-primary">
          <Radar size={22} />
        </div>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <MetricPill label="Trigger Match Rate" value={`${healthRate}%`} tone="emerald" />
        <MetricPill label="Legacy Fallbacks" value={formatCount(summary.legacyFallbacks)} tone="amber" />
        <MetricPill label="Recovered Errors" value={formatCount(summary.errors)} tone="rose" />
        <MetricPill label="Overrides" value={formatCount(summary.overrides)} tone="amber" />
      </div>

      <div className="mt-6 overflow-hidden rounded-full bg-canvas">
        <div className="flex h-3 w-full bg-slate-100">
          <div className="bg-emerald-500 transition-all" style={{ width: `${healthRate}%` }} />
          <div
            className="bg-rose-400 transition-all"
            style={{ width: `${Math.max(0, 100 - healthRate)}%` }}
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-text-muted">
        <span className="rounded-full bg-emerald-50 px-3 py-1 font-medium text-emerald-700">
          Success {formatCount(summary.triggers)}
        </span>
        <span className="rounded-full bg-rose-50 px-3 py-1 font-medium text-rose-700">
          Recovery {formatCount(summary.errors)}
        </span>
        <span className="rounded-full bg-amber-50 px-3 py-1 font-medium text-amber-700">
          Decision events {formatCount(summary.total)}
        </span>
      </div>
    </section>
  );
}

function LeakyBucketCard({ rows }: { rows: RegistryHealthRow[] }) {
  return (
    <section className="rounded-[1.5rem] border border-border-main bg-surface p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <AlertTriangle className="text-amber-500" size={18} />
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted">
            Leaky Bucket
          </div>
          <h3 className="mt-1 text-[1.05rem] font-semibold tracking-tight text-text-main">
            Top failing nodes
          </h3>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border-main bg-canvas px-4 py-6 text-sm text-text-muted">
            No failing nodes recorded yet. That is a good sign.
          </div>
        ) : (
          rows.map((row, index) => (
            <div
              key={`${row.flow_id || "flow"}-${row.node_id || "node"}-${index}`}
              className="rounded-xl border border-rose-100 bg-gradient-to-r from-rose-50 to-canvas px-4 py-3"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-rose-600">
                    Node {row.node_id || "unknown"}
                  </div>
                  <div className="mt-1 text-sm font-medium text-text-main">
                    Flow {row.flow_id || row.target_flow_id || "unknown"}
                  </div>
                  <div className="mt-1 text-xs text-text-muted">
                    Last seen {formatRelative(row.last_seen_at)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-semibold tracking-tight text-rose-700">
                    {formatCount(Number(row.failure_count ?? row.count ?? 0))}
                  </div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-rose-500">
                    failures
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function TriggerPopularityCard({ rows }: { rows: RegistryKeywordRow[] }) {
  const max = Math.max(...rows.map((row) => Number(row.count || 0)), 0);

  return (
    <section className="rounded-[1.5rem] border border-border-main bg-surface p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <Flame className="text-cyan-500" size={18} />
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted">
            Trigger Popularity
          </div>
          <h3 className="mt-1 text-[1.05rem] font-semibold tracking-tight text-text-main">
            Most used keywords
          </h3>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border-main bg-canvas px-4 py-6 text-sm text-text-muted">
            No trigger matches recorded yet.
          </div>
        ) : (
          rows.map((row, index) => {
            const count = Number(row.count || 0);
            const width = max > 0 ? Math.max(8, (count / max) * 100) : 8;
            return (
              <div key={`${row.keyword}-${index}`} className="rounded-xl border border-border-main bg-canvas px-4 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-fade text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
                      #{index + 1}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-text-main">
                        {row.keyword || "unknown"}
                      </div>
                      <div className="mt-1 text-xs text-text-muted">
                        {formatCount(row.flow_count || 0)} flows • {formatCount(row.node_count || 0)} nodes
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-semibold text-text-main">{formatCount(count)}</div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text-muted">
                      hits
                    </div>
                  </div>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-border-main/60">
                  <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-primary" style={{ width: `${width}%` }} />
                </div>
                <div className="mt-2 text-[11px] text-text-muted">
                  Last seen {formatRelative(row.last_seen_at)}
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

function FallbackInspectorCard({ rows }: { rows: RegistryKeywordRow[] }) {
  const max = Math.max(...rows.map((row) => Number(row.count || 0)), 0);

  return (
    <section className="rounded-[1.5rem] border border-border-main bg-surface p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <Zap className="text-violet-500" size={18} />
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted">
            Fallback Inspector
          </div>
          <h3 className="mt-1 text-[1.05rem] font-semibold tracking-tight text-text-main">
            Missing registry keywords
          </h3>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border-main bg-canvas px-4 py-6 text-sm text-text-muted">
            No legacy fallbacks recorded in this window.
          </div>
        ) : (
          rows.map((row, index) => {
            const count = Number(row.count || 0);
            const width = max > 0 ? Math.max(8, (count / max) * 100) : 8;
            return (
              <div key={`${row.keyword}-${index}`} className="rounded-xl border border-violet-100 bg-gradient-to-r from-violet-50 to-canvas px-4 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-100 text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-700">
                      #{index + 1}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-text-main">
                        {row.keyword || "unknown"}
                      </div>
                      <div className="mt-1 text-xs text-text-muted">
                        {formatCount(row.flow_count || 0)} flows • {formatCount(row.node_count || 0)} nodes
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-semibold text-text-main">{formatCount(count)}</div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text-muted">
                      fallbacks
                    </div>
                  </div>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-border-main/60">
                  <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500" style={{ width: `${width}%` }} />
                </div>
                <div className="mt-2 text-[11px] text-text-muted">
                  Last seen {formatRelative(row.last_seen_at)}
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

function UnpublishedFlowsRow({
  total,
  flows,
}: {
  total: number;
  flows: Array<{
    id: string;
    name?: string | null;
    updated_at?: string | null;
    trigger_count?: number;
  }>;
}) {
  return (
    <section className="rounded-[1.5rem] border border-border-main bg-surface p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted">
            Migration Progress
          </div>
          <h3 className="mt-1 text-[1.05rem] font-semibold tracking-tight text-text-main">
            Unpublished flows
          </h3>
          <p className="mt-2 text-sm text-text-muted">
            Active flows with flow_json but no trigger rows yet.
          </p>
        </div>
        <div className="rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-right">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-700">
            Count
          </div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-violet-700">
            {formatCount(total)}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {flows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border-main bg-canvas px-4 py-6 text-sm text-text-muted sm:col-span-2 xl:col-span-3">
            No unpublished active flows found.
          </div>
        ) : (
          flows.map((flow) => (
            <div
              key={flow.id}
              className="rounded-xl border border-violet-100 bg-gradient-to-br from-violet-50 to-canvas px-4 py-4"
            >
              <div className="text-sm font-semibold text-text-main">
                {flow.name || flow.id}
              </div>
              <div className="mt-1 text-xs text-text-muted">
                {formatCount(flow.trigger_count || 0)} triggers
              </div>
              <div className="mt-2 text-[11px] text-text-muted">
                Updated {formatRelative(flow.updated_at)}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

export default function RegistryAnalyticsDashboard({
  workspaceId,
  scopeLabel,
  timeRange,
}: {
  workspaceId?: string | null;
  scopeLabel?: string | null;
  timeRange: AnalyticsTimeRange;
}) {
  const { data, loading, error, reload } = useRegistryAnalyticsData(workspaceId, timeRange);

  return (
    <section className="rounded-[1.75rem] border border-border-main bg-surface p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted">
            Registry Analytics
          </div>
          <h2 className="mt-2 text-[1.6rem] font-semibold tracking-tight text-text-main">
            Flow Health Dashboard
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-text-muted">
            Real-time visibility into registry matches, recoveries, and trigger popularity for{" "}
            <span className="font-medium text-text-main">{scopeLabel || "the active workspace"}</span>.
          </p>
        </div>
        <button
          type="button"
          onClick={() => reload().catch(() => null)}
          className="inline-flex items-center gap-2 rounded-full border border-border-main bg-canvas px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-text-muted transition hover:text-text-main"
        >
          <RefreshCcw size={14} />
          Refresh
        </button>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1.1fr_0.95fr]">
        <HealthRadarCard rows={data.health} />
        <LeakyBucketCard rows={data.leaky} />
      </div>

      <div className="mt-6">
        <TriggerPopularityCard rows={data.keywords} />
      </div>

      <div className="mt-6">
        <UnpublishedFlowsRow
          total={data.unpublishedSummary.total}
          flows={data.unpublishedSummary.flows}
        />
      </div>

      <div className="mt-6">
        <FallbackInspectorCard rows={data.fallbackKeywords} />
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 text-[11px] text-text-muted">
        <div className="inline-flex items-center gap-2">
          <Clock3 size={14} />
          <span>Showing the last {timeRange === "24h" ? "24 hours" : timeRange === "7d" ? "7 days" : "30 days"}.</span>
        </div>
        <div className="inline-flex items-center gap-2">
          <BarChart3 size={14} />
          <span>Scope refreshes automatically when the workspace changes.</span>
        </div>
      </div>

      {loading ? (
        <div className="mt-4 rounded-xl border border-dashed border-border-main bg-canvas px-4 py-4 text-sm text-text-muted">
          Loading registry analytics...
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}
    </section>
  );
}
