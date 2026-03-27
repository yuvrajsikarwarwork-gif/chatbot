import { useEffect, useState } from "react";
import { Activity, Layers3, Radar, TrendingUp } from "lucide-react";

import PageAccessNotice from "../components/access/PageAccessNotice";
import DashboardLayout from "../components/layout/DashboardLayout";
import { useVisibility } from "../hooks/useVisibility";
import { analyticsService } from "../services/analyticsService";
import { conversationService, type AssignmentCapacityResponse } from "../services/conversationService";
import { useAuthStore } from "../store/authStore";

export default function AnalyticsPage() {
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);
  const activeProject = useAuthStore((state) => state.activeProject);
  const { canViewPage } = useVisibility();
  const [overview, setOverview] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [usageSummary, setUsageSummary] = useState<any>(null);
  const [assignmentCapacity, setAssignmentCapacity] = useState<AssignmentCapacityResponse | null>(null);
  const [presence, setPresence] = useState<any[]>([]);
  const canViewAnalyticsPage = canViewPage("analytics");

  useEffect(() => {
    if (!canViewAnalyticsPage) {
      setOverview(null);
      setEvents([]);
      setUsageSummary(null);
      setAssignmentCapacity(null);
      setPresence([]);
      return;
    }
    analyticsService.getWorkspaceUsageSummary().then(setUsageSummary).catch(console.error);

    if (!activeWorkspace?.workspace_id) {
      setOverview(null);
      setEvents([]);
      setAssignmentCapacity(null);
      setPresence([]);
      return;
    }

    analyticsService
      .getWorkspaceStats(activeWorkspace.workspace_id, activeProject?.id)
      .then(setOverview)
      .catch(console.error);
    analyticsService
      .getWorkspaceEvents(activeWorkspace.workspace_id, activeProject?.id)
      .then(setEvents)
      .catch(console.error);
    analyticsService
      .getWorkspacePresence(activeWorkspace.workspace_id, activeProject?.id)
      .then(setPresence)
      .catch(console.error);
    conversationService
      .getAssignmentCapacity({
        workspaceId: activeWorkspace.workspace_id,
        projectId: activeProject?.id || undefined,
      })
      .then(setAssignmentCapacity)
      .catch(console.error);
  }, [activeWorkspace?.workspace_id, activeProject?.id, canViewAnalyticsPage]);

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
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)]">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
                Workspace Analytics
              </div>
              <h1 className="mt-2 text-[1.6rem] font-semibold tracking-tight text-[var(--text)]">
                Runtime telemetry for {activeWorkspace?.workspace_name || "active workspace"}
              </h1>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                Usage, runtime activity, and subscription state in one clean workspace view.
              </p>
            </div>
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-strong)] p-3 text-[var(--accent)]">
              <Radar size={22} />
            </div>
          </div>
        </section>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: "Visible Workspaces",
              value: usage.totalWorkspaces,
              helper: `${usage.activeWorkspaces} active / ${usage.lockedWorkspaces} locked`,
              icon: Layers3,
            },
            {
              label: "Campaign Usage",
              value: usage.totalCampaigns,
              helper: `${usage.campaignCapacity || 0} total capacity`,
              icon: TrendingUp,
            },
            {
              label: "Account Usage",
              value: usage.totalPlatformAccounts,
              helper: `${usage.platformAccountCapacity || 0} total capacity`,
              icon: Activity,
            },
            {
              label: "Active Subscriptions",
              value: usage.subscriptionBreakdown?.active || 0,
              helper: `${usage.subscriptionBreakdown?.overdue || 0} overdue / ${usage.subscriptionBreakdown?.locked || 0} locked`,
              icon: Radar,
            },
            {
              label: "Eligible Agents",
              value: assignmentCapacity?.summary.eligibleCandidates || 0,
              helper: `${assignmentCapacity?.summary.atCapacityCandidates || 0} at capacity`,
              icon: Activity,
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.label}
                className="rounded-[1.25rem] border border-[var(--line)] bg-[var(--surface-strong)] p-5 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
                    {item.label}
                  </div>
                  <div className="rounded-xl bg-[var(--surface-muted)] p-2 text-[var(--muted)]">
                    <Icon size={16} />
                  </div>
                </div>
                <div className="mt-4 text-2xl font-semibold tracking-tight text-[var(--text)]">
                  {item.value}
                </div>
                <div className="mt-2 text-sm text-[var(--muted)]">{item.helper}</div>
              </div>
            );
          })}
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[
            { label: "Total Events", value: stats.totalEvents, icon: Activity },
            { label: "Leads Captured", value: stats.leadsCaptured, icon: TrendingUp },
            { label: "Conversation Forks", value: stats.conversationForks, icon: Layers3 },
            { label: "Entry Resolutions", value: stats.entryResolutions, icon: Radar },
            { label: "Active Campaigns", value: stats.activeCampaigns, icon: Layers3 },
            { label: "Total Leads", value: stats.totalLeads, icon: TrendingUp },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.label}
                className="rounded-[1.25rem] border border-[var(--line)] bg-[var(--surface-strong)] p-5 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
                    {item.label}
                  </div>
                  <div className="rounded-xl bg-[var(--surface-muted)] p-2 text-[var(--muted)]">
                    <Icon size={16} />
                  </div>
                </div>
                <div className="mt-4 text-2xl font-semibold tracking-tight text-[var(--text)]">
                  {item.value}
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <section className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface-strong)] p-6 shadow-sm">
            <div className="mb-4 text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
              Live Agent Presence
            </div>
            <div className="space-y-3">
              {presence.map((agent) => (
                <div
                  key={agent.user_id}
                  className="flex items-center justify-between rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] px-4 py-3"
                >
                  <div>
                    <div className="font-medium text-[var(--text)]">
                      {agent.name || agent.email || agent.user_id}
                    </div>
                    <div className="mt-1 text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
                      {agent.session_status} • {agent.active_chats || 0} active chats
                    </div>
                    {agent.last_action ? (
                      <div className="mt-1 text-xs text-[var(--muted)]">{agent.last_action}</div>
                    ) : null}
                  </div>
                  <div className="text-right text-xs text-[var(--muted)]">
                    {agent.last_activity_at
                      ? new Date(agent.last_activity_at).toLocaleString()
                      : "No activity"}
                  </div>
                </div>
              ))}
              {!presence.length ? (
                <div className="rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface-muted)] px-4 py-6 text-sm text-[var(--muted)]">
                  No live agent presence recorded yet.
                </div>
              ) : null}
            </div>
          </section>

          <section className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface-strong)] p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
                  Agent Capacity
                </div>
                <div className="mt-2 text-sm text-[var(--muted)]">
                  Live assignment capacity for the current workspace/project scope.
                </div>
              </div>
              {assignmentCapacity?.requiredSkills?.length ? (
                <div className="rounded-full bg-cyan-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-700">
                  {assignmentCapacity.requiredSkills.length} skill signals
                </div>
              ) : null}
            </div>
            <div className="space-y-3">
              {(assignmentCapacity?.candidates || []).slice(0, 8).map((candidate) => (
                <div
                  key={candidate.user_id}
                  className="rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="font-medium text-[var(--text)]">
                        {candidate.name || candidate.email || candidate.user_id}
                      </div>
                      <div className="mt-1 text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
                        {candidate.role} • {candidate.open_assignment_count}/{candidate.capacity_limit} open
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold text-[var(--text)]">
                        {candidate.capacity_remaining} free
                      </div>
                      <div className="mt-1 text-xs text-[var(--muted)]">
                        {candidate.pending_assignment_count} pending
                      </div>
                    </div>
                  </div>
                  {(candidate.agent_skills.length > 0 || candidate.required_skills.length > 0) ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {candidate.required_skills.slice(0, 3).map((skill) => (
                        <span
                          key={`required-${candidate.user_id}-${skill}`}
                          className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600"
                        >
                          Need {skill.replace(/_/g, " ")}
                        </span>
                      ))}
                      {candidate.agent_skills.slice(0, 3).map((skill) => (
                        <span
                          key={`skill-${candidate.user_id}-${skill}`}
                          className="rounded-full bg-cyan-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-700"
                        >
                          {skill.replace(/_/g, " ")}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
              {!assignmentCapacity?.candidates?.length ? (
                <div className="rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface-muted)] px-4 py-6 text-sm text-[var(--muted)]">
                  No assignment capacity data available yet.
                </div>
              ) : null}
            </div>
          </section>

          <section className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface-strong)] p-6 shadow-sm">
            <div className="mb-4 text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
              Platform Breakdown
            </div>
            <div className="space-y-3">
              {(overview?.platformBreakdown || []).map((item: any) => (
                <div
                  key={item.platform}
                  className="flex items-center justify-between rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] px-4 py-3"
                >
                  <div className="font-medium capitalize text-[var(--text)]">{item.platform}</div>
                  <div className="text-sm font-semibold text-[var(--text)]">{item.total}</div>
                </div>
              ))}
              {!overview?.platformBreakdown?.length ? (
                <div className="rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface-muted)] px-4 py-6 text-sm text-[var(--muted)]">
                  No platform activity yet for this workspace.
                </div>
              ) : null}
            </div>
          </section>

          <section className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface-strong)] p-6 shadow-sm">
            <div className="mb-4 text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
              Subscription Mix
            </div>
            <div className="space-y-3">
              {Object.entries(usage.subscriptionBreakdown || {}).map(([status, total]) => (
                <div
                  key={status}
                  className="flex items-center justify-between rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] px-4 py-3"
                >
                  <div className="font-medium capitalize text-[var(--text)]">{status}</div>
                  <div className="text-sm font-semibold text-[var(--text)]">{String(total)}</div>
                </div>
              ))}
              {!Object.keys(usage.subscriptionBreakdown || {}).length ? (
                <div className="rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface-muted)] px-4 py-6 text-sm text-[var(--muted)]">
                  No workspace subscription data available yet.
                </div>
              ) : null}
            </div>
          </section>

          <section className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface-strong)] p-6 shadow-sm">
            <div className="mb-4 text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
              Recent Events
            </div>
            <div className="space-y-3">
              {events.map((event) => (
                <div key={event.id} className="rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold text-[var(--text)]">
                        {event.event_name || event.event_type}
                      </div>
                      <div className="mt-1 text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
                        {event.event_type} {event.platform ? `• ${event.platform}` : ""}
                      </div>
                    </div>
                    <div className="text-xs text-[var(--muted)]">
                      {new Date(event.created_at).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
              {!events.length ? (
                <div className="rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface-muted)] px-4 py-6 text-sm text-[var(--muted)]">
                  No analytics events recorded yet.
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
