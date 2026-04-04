import { type ComponentType, useEffect, useState } from "react";
import { Activity, BarChart3, Layers3, Radar, TrendingUp } from "lucide-react";

import PageAccessNotice from "../components/access/PageAccessNotice";
import OptimizationImpactChart from "../components/analytics/OptimizationImpactChart";
import RegistryAnalyticsDashboard from "../components/analytics/RegistryAnalyticsDashboard";
import DashboardLayout from "../components/layout/DashboardLayout";
import { useVisibility } from "../hooks/useVisibility";
import { analyticsService } from "../services/analyticsService";
import { conversationService, type AssignmentCapacityResponse } from "../services/conversationService";
import { useAuthStore } from "../store/authStore";

type AnalyticsTimeRange = "24h" | "7d" | "30d";

type StatTone = "slate" | "emerald" | "cyan" | "amber" | "violet" | "rose";

const ANALYTICS_TIME_RANGE_HOURS: Record<AnalyticsTimeRange, number> = {
  "24h": 24,
  "7d": 24 * 7,
  "30d": 24 * 30,
};

function TimeRangeSelector({
  value,
  onChange,
}: {
  value: AnalyticsTimeRange;
  onChange: (value: AnalyticsTimeRange) => void;
}) {
  const options: Array<{ value: AnalyticsTimeRange; label: string }> = [
    { value: "24h", label: "Last 24h" },
    { value: "7d", label: "Last 7d" },
    { value: "30d", label: "Last 30d" },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition ${
            value === option.value
              ? "border-primary bg-primary text-white"
              : "border-border-main bg-canvas text-text-muted hover:text-text-main"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function StatCard({
  label,
  value,
  helper,
  icon: Icon,
  tone = "slate",
}: {
  label: string;
  value: number | string;
  helper?: string;
  icon: ComponentType<{ size?: number }>;
  tone?: StatTone;
}) {
  const toneClasses: Record<StatTone, { ring: string; icon: string; value: string; glow: string }> = {
    slate: {
      ring: "from-slate-300/70 to-slate-400/30",
      icon: "bg-slate-100 text-slate-700",
      value: "text-text-main",
      glow: "shadow-[0_0_0_1px_rgba(148,163,184,0.12)]",
    },
    emerald: {
      ring: "from-emerald-400/70 to-emerald-500/30",
      icon: "bg-emerald-50 text-emerald-600",
      value: "text-emerald-700",
      glow: "shadow-[0_0_0_1px_rgba(16,185,129,0.12)]",
    },
    cyan: {
      ring: "from-cyan-400/70 to-sky-500/30",
      icon: "bg-cyan-50 text-cyan-600",
      value: "text-cyan-700",
      glow: "shadow-[0_0_0_1px_rgba(34,211,238,0.12)]",
    },
    amber: {
      ring: "from-amber-400/70 to-orange-400/30",
      icon: "bg-amber-50 text-amber-600",
      value: "text-amber-700",
      glow: "shadow-[0_0_0_1px_rgba(245,158,11,0.12)]",
    },
    violet: {
      ring: "from-violet-400/70 to-fuchsia-500/30",
      icon: "bg-violet-50 text-violet-600",
      value: "text-violet-700",
      glow: "shadow-[0_0_0_1px_rgba(139,92,246,0.12)]",
    },
    rose: {
      ring: "from-rose-400/70 to-pink-500/30",
      icon: "bg-rose-50 text-rose-600",
      value: "text-rose-700",
      glow: "shadow-[0_0_0_1px_rgba(244,63,94,0.12)]",
    },
  };
  const toneClass = toneClasses[tone];

  return (
    <div className={`rounded-[1.25rem] border border-border-main bg-surface p-5 shadow-sm ${toneClass.glow}`}>
      <div className={`-mx-5 -mt-5 mb-4 h-1 rounded-t-[1.25rem] bg-gradient-to-r ${toneClass.ring}`} />
      <div className="flex items-center justify-between gap-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text-muted">
          {label}
        </div>
        <div className={`rounded-xl p-2 ${toneClass.icon}`}>
          <Icon size={16} />
        </div>
      </div>
      <div className={`mt-4 text-2xl font-semibold tracking-tight ${toneClass.value}`}>
        {value}
      </div>
      {helper ? <div className="mt-2 text-sm text-text-muted">{helper}</div> : null}
    </div>
  );
}

export default function AnalyticsPage() {
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);
  const activeProject = useAuthStore((state) => state.activeProject);
  const { canViewPage } = useVisibility();
  const [timeRange, setTimeRange] = useState<AnalyticsTimeRange>("24h");
  const [overview, setOverview] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [usageSummary, setUsageSummary] = useState<any>(null);
  const [assignmentCapacity, setAssignmentCapacity] = useState<AssignmentCapacityResponse | null>(null);
  const [presence, setPresence] = useState<any[]>([]);
  const [optimizationPerformance, setOptimizationPerformance] = useState<any[]>([]);
  const canViewAnalyticsPage = canViewPage("analytics");
  const timeRangeHours = ANALYTICS_TIME_RANGE_HOURS[timeRange];
  const performanceDays = timeRange === "24h" ? 1 : timeRange === "7d" ? 7 : 30;

  useEffect(() => {
    if (!canViewAnalyticsPage) {
      setOverview(null);
      setEvents([]);
      setUsageSummary(null);
      setAssignmentCapacity(null);
      setPresence([]);
      setOptimizationPerformance([]);
      return;
    }

    analyticsService.getWorkspaceUsageSummary().then(setUsageSummary).catch(console.error);

    if (!activeWorkspace?.workspace_id) {
      setOverview(null);
      setEvents([]);
      setAssignmentCapacity(null);
      setPresence([]);
      setOptimizationPerformance([]);
      return;
    }

    analyticsService
      .getWorkspaceStats(activeWorkspace.workspace_id, activeProject?.id, timeRangeHours)
      .then(setOverview)
      .catch(console.error);
    analyticsService
      .getWorkspaceEvents(activeWorkspace.workspace_id, activeProject?.id, timeRangeHours)
      .then(setEvents)
      .catch(console.error);
    analyticsService
      .getWorkspacePresence(activeWorkspace.workspace_id, activeProject?.id)
      .then(setPresence)
      .catch(console.error);
    analyticsService
      .getWorkspaceOptimizationPerformance(activeWorkspace.workspace_id, performanceDays)
      .then(setOptimizationPerformance)
      .catch(console.error);
    conversationService
      .getAssignmentCapacity({
        workspaceId: activeWorkspace.workspace_id,
        projectId: activeProject?.id || undefined,
      })
      .then(setAssignmentCapacity)
      .catch(console.error);
  }, [activeWorkspace?.workspace_id, activeProject?.id, canViewAnalyticsPage, timeRangeHours, performanceDays]);

  const stats = overview?.stats || {
    totalEvents: 0,
    leadsCaptured: 0,
    conversationForks: 0,
    entryResolutions: 0,
    activeCampaigns: 0,
    totalLeads: 0,
  };

  const usage = usageSummary?.summary || {
    totalWorkspaces: 0,
    activeWorkspaces: 0,
    lockedWorkspaces: 0,
    totalCampaigns: 0,
    campaignCapacity: 0,
    totalPlatformAccounts: 0,
    platformAccountCapacity: 0,
    subscriptionBreakdown: {},
  };

  return (
    <DashboardLayout>
      {!canViewAnalyticsPage ? (
        <PageAccessNotice
          title="Analytics are not available for this role"
          description="Analytics are available to roles with workspace or project reporting access."
          href="/"
          ctaLabel="Open dashboard"
        />
      ) : (
        <div className="mx-auto max-w-7xl space-y-6 text-text-main">
          <section className="rounded-[1.75rem] border border-border-main bg-surface p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted">
                  Workspace Analytics
                </div>
                <h1 className="mt-2 text-[1.6rem] font-semibold tracking-tight text-text-main">
                  Runtime telemetry for {activeWorkspace?.workspace_name || "active workspace"}
                </h1>
                <p className="mt-2 text-sm leading-6 text-text-muted">
                  Usage, runtime activity, and subscription state in one clean workspace view.
                </p>
              </div>
              <div className="flex flex-col items-end gap-3">
                <div className="rounded-2xl border border-border-main bg-canvas p-3 text-primary">
                  <Radar size={22} />
                </div>
                <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
              </div>
            </div>
          </section>

          <div className="rounded-[1.25rem] border border-border-main bg-canvas/70 px-4 py-3 text-xs text-text-muted">
            Showing analytics for the last{" "}
            {timeRange === "24h" ? "24 hours" : timeRange === "7d" ? "7 days" : "30 days"}.
          </div>

          <OptimizationImpactChart
            data={optimizationPerformance}
            title="Optimizer impact over time"
          />

          <RegistryAnalyticsDashboard
            workspaceId={activeWorkspace?.workspace_id || null}
            scopeLabel={activeWorkspace?.workspace_name || null}
            timeRange={timeRange}
          />

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Visible Workspaces"
              value={usage.totalWorkspaces}
              helper={`${usage.activeWorkspaces} active / ${usage.lockedWorkspaces} locked`}
              icon={Layers3}
              tone="emerald"
            />
            <StatCard
              label="Campaign Usage"
              value={usage.totalCampaigns}
              helper={`${usage.campaignCapacity || 0} total capacity`}
              icon={TrendingUp}
              tone="amber"
            />
            <StatCard
              label="Account Usage"
              value={usage.totalPlatformAccounts}
              helper={`${usage.platformAccountCapacity || 0} total capacity`}
              icon={Activity}
              tone="cyan"
            />
            <StatCard
              label="Active Subscriptions"
              value={usage.subscriptionBreakdown?.active || 0}
              helper={`${usage.subscriptionBreakdown?.overdue || 0} overdue / ${usage.subscriptionBreakdown?.locked || 0} locked`}
              icon={Radar}
              tone="violet"
            />
            <StatCard
              label="Eligible Agents"
              value={assignmentCapacity?.summary.eligibleCandidates || 0}
              helper={`${assignmentCapacity?.summary.atCapacityCandidates || 0} at capacity`}
              icon={BarChart3}
              tone="rose"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <StatCard label="Total Events" value={stats.totalEvents} icon={Activity} tone="cyan" />
            <StatCard label="Leads Captured" value={stats.leadsCaptured} icon={TrendingUp} tone="emerald" />
            <StatCard label="Conversation Forks" value={stats.conversationForks} icon={Layers3} tone="violet" />
            <StatCard label="Entry Resolutions" value={stats.entryResolutions} icon={Radar} tone="amber" />
            <StatCard label="Active Campaigns" value={stats.activeCampaigns} icon={Layers3} tone="rose" />
          </div>

          <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
            <section className="rounded-[1.5rem] border border-border-main bg-surface p-6 shadow-sm">
              <div className="mb-4 text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted">
                Live Agent Presence
              </div>
              <div className="space-y-3">
                {presence.map((agent) => (
                  <div
                    key={agent.user_id}
                    className="flex items-center justify-between rounded-xl border border-border-main bg-gradient-to-r from-canvas to-emerald-50/40 px-4 py-3"
                  >
                    <div>
                      <div className="font-medium text-text-main">
                        {agent.name || agent.email || agent.user_id}
                      </div>
                      <div className="mt-1 text-xs uppercase tracking-[0.16em] text-text-muted">
                        {String(agent.session_status || "offline")} • {agent.active_chats || 0} active chats
                      </div>
                      {agent.last_action ? (
                        <div className="mt-1 text-xs text-text-muted">{agent.last_action}</div>
                      ) : null}
                    </div>
                    <div className="text-right text-xs text-text-muted">
                      {agent.last_activity_at
                        ? new Date(agent.last_activity_at).toLocaleString()
                        : "No activity"}
                    </div>
                  </div>
                ))}
                {!presence.length ? (
                  <div className="rounded-xl border border-dashed border-border-main bg-canvas px-4 py-6 text-sm text-text-muted">
                    No live agent presence recorded yet.
                  </div>
                ) : null}
              </div>
            </section>

            <section className="rounded-[1.5rem] border border-border-main bg-surface p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted">
                    Agent Capacity
                  </div>
                  <div className="mt-2 text-sm text-text-muted">
                    Live assignment capacity for the current workspace/project scope.
                  </div>
                </div>
                {assignmentCapacity?.requiredSkills?.length ? (
                  <div className="rounded-full bg-primary-fade px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
                    {assignmentCapacity.requiredSkills.length} skill signals
                  </div>
                ) : null}
              </div>
              <div className="space-y-3">
                {(assignmentCapacity?.candidates || []).slice(0, 8).map((candidate) => (
                  <div
                    key={candidate.user_id}
                    className="rounded-xl border border-border-main bg-gradient-to-br from-canvas to-cyan-50/40 px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="font-medium text-text-main">
                          {candidate.name || candidate.email || candidate.user_id}
                        </div>
                        <div className="mt-1 text-xs uppercase tracking-[0.16em] text-text-muted">
                          {candidate.role} • {candidate.open_assignment_count}/{candidate.capacity_limit} open
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-text-main">
                          {candidate.capacity_remaining} free
                        </div>
                        <div className="mt-1 text-xs text-text-muted">
                          {candidate.pending_assignment_count} pending
                        </div>
                      </div>
                    </div>
                    {(candidate.agent_skills.length > 0 || candidate.required_skills.length > 0) ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {candidate.required_skills.slice(0, 3).map((skill) => (
                          <span
                            key={`required-${candidate.user_id}-${skill}`}
                            className="rounded-full bg-canvas px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted"
                          >
                            Need {skill.replace(/_/g, " ")}
                          </span>
                        ))}
                        {candidate.agent_skills.slice(0, 3).map((skill) => (
                          <span
                            key={`skill-${candidate.user_id}-${skill}`}
                            className="rounded-full bg-primary-fade px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-primary"
                          >
                            {skill.replace(/_/g, " ")}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
                {!assignmentCapacity?.candidates?.length ? (
                  <div className="rounded-xl border border-dashed border-border-main bg-canvas px-4 py-6 text-sm text-text-muted">
                    No assignment capacity data available yet.
                  </div>
                ) : null}
              </div>
            </section>

            <section className="rounded-[1.5rem] border border-border-main bg-surface p-6 shadow-sm">
              <div className="mb-4 text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted">
                Platform Breakdown
              </div>
              <div className="space-y-3">
                {(overview?.platformBreakdown || []).map((item: any) => (
                  <div
                    key={item.platform}
                    className="flex items-center justify-between rounded-xl border border-border-main bg-canvas px-4 py-3"
                  >
                    <div className="font-medium capitalize text-text-main">{item.platform}</div>
                    <div className="text-sm font-semibold text-text-main">{item.total}</div>
                  </div>
                ))}
                {!overview?.platformBreakdown?.length ? (
                  <div className="rounded-xl border border-dashed border-border-main bg-canvas px-4 py-6 text-sm text-text-muted">
                    No platform activity yet for this workspace.
                  </div>
                ) : null}
              </div>
            </section>

            <section className="rounded-[1.5rem] border border-border-main bg-surface p-6 shadow-sm">
              <div className="mb-4 text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted">
                Subscription Mix
              </div>
              <div className="space-y-3">
                {Object.entries(usage.subscriptionBreakdown || {}).map(([status, total]) => (
                  <div
                    key={status}
                    className="flex items-center justify-between rounded-xl border border-border-main bg-gradient-to-r from-canvas to-violet-50/40 px-4 py-3"
                  >
                    <div className="font-medium capitalize text-text-main">{status}</div>
                    <div className="text-sm font-semibold text-text-main">{String(total)}</div>
                  </div>
                ))}
                {!Object.keys(usage.subscriptionBreakdown || {}).length ? (
                  <div className="rounded-xl border border-dashed border-border-main bg-canvas px-4 py-6 text-sm text-text-muted">
                    No workspace subscription data available yet.
                  </div>
                ) : null}
              </div>
            </section>

            <section className="rounded-[1.5rem] border border-border-main bg-surface p-6 shadow-sm">
              <div className="mb-4 text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted">
                Recent Events
              </div>
              <div className="space-y-3">
                {events.map((event) => (
                  <div key={event.id} className="rounded-xl border border-border-main bg-gradient-to-r from-canvas to-amber-50/30 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-sm font-semibold text-text-main">
                          {event.event_name || event.event_type}
                        </div>
                        <div className="mt-1 text-xs uppercase tracking-[0.16em] text-primary">
                          {event.platform || "system"}
                        </div>
                      </div>
                      <div className="text-xs text-text-muted">
                        {event.created_at ? new Date(event.created_at).toLocaleString() : "Unknown"}
                      </div>
                    </div>
                    <div className="mt-2 text-sm text-text-muted">
                      {event.description || event.details || "No details"}
                    </div>
                  </div>
                ))}
                {!events.length ? (
                  <div className="rounded-xl border border-dashed border-border-main bg-canvas px-4 py-6 text-sm text-text-muted">
                    No recent analytics events recorded yet.
                  </div>
                ) : null}
              </div>
            </section>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
