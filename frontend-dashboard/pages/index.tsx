import { useEffect, useMemo, useState } from "react";

import PageAccessNotice from "../components/access/PageAccessNotice";
import DashboardLayout from "../components/layout/DashboardLayout";
import { useVisibility } from "../hooks/useVisibility";
import { analyticsService } from "../services/analyticsService";
import { botService } from "../services/botService";
import { conversationService } from "../services/conversationService";
import { flowService } from "../services/flowService";
import { useAuthStore } from "../store/authStore";
import { useBotStore } from "../store/botStore";

interface DashboardStats {
  conversations: number;
  messages: number;
  totalEvents: number;
  activeCampaigns: number;
  totalLeads: number;
  activeFlows: number;
  liveConversations: number;
  unreadMessages: number;
  liveAgents: number;
}

const formatTimeAgo = (value?: string) => {
  if (!value) return "Unknown";

  const diffMs = Date.now() - new Date(value).getTime();
  if (Number.isNaN(diffMs)) return "Unknown";

  const diffMinutes = Math.max(1, Math.floor(diffMs / 60000));
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
};

export default function DashboardPage() {
  const { canViewPage, isPlatformOperator } = useVisibility();
  const selectedBotId = useBotStore((s) => s.selectedBotId);
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);
  const activeProject = useAuthStore((state) => state.activeProject);
  const [stats, setStats] = useState<DashboardStats>({
    conversations: 0,
    messages: 0,
    totalEvents: 0,
    activeCampaigns: 0,
    totalLeads: 0,
    activeFlows: 0,
    liveConversations: 0,
    unreadMessages: 0,
    liveAgents: 0,
  });
  const [events, setEvents] = useState<any[]>([]);
  const [presence, setPresence] = useState<any[]>([]);
  const [availableBotCount, setAvailableBotCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const canViewDashboardPage = canViewPage("dashboard");
  const isPlatformDashboard = isPlatformOperator && !activeWorkspace?.workspace_id;
  const currentScopeLabel = activeProject?.name || activeWorkspace?.workspace_name || "Workspace";

  useEffect(() => {
    if (!canViewDashboardPage || !activeWorkspace?.workspace_id || isPlatformDashboard) {
      setAvailableBotCount(0);
      return;
    }

    botService
      .getBots({
        workspaceId: activeWorkspace.workspace_id,
        projectId: activeProject?.id || undefined,
      })
      .then((rows) => {
        setAvailableBotCount(Array.isArray(rows) ? rows.length : 0);
      })
      .catch((err) => {
        console.error("Failed to load dashboard bot count", err);
        setAvailableBotCount(0);
      });
  }, [activeProject?.id, activeWorkspace?.workspace_id, canViewDashboardPage, isPlatformDashboard]);

  useEffect(() => {
    if (!canViewDashboardPage) {
      setStats({
        conversations: 0,
        messages: 0,
        totalEvents: 0,
        activeCampaigns: 0,
        totalLeads: 0,
        activeFlows: 0,
        liveConversations: 0,
        unreadMessages: 0,
        liveAgents: 0,
      });
      setEvents([]);
      setPresence([]);
      setError("");
      return;
    }
    if (!activeWorkspace?.workspace_id || isPlatformDashboard) {
      setStats({
        conversations: 0,
        messages: 0,
        totalEvents: 0,
        activeCampaigns: 0,
        totalLeads: 0,
        activeFlows: 0,
        liveConversations: 0,
        unreadMessages: 0,
        liveAgents: 0,
      });
      setEvents([]);
      setPresence([]);
      setError("");
      return;
    }

    const load = async () => {
      try {
        setLoading(true);
        setError("");
        const [workspaceStats, workspaceEvents, workspacePresence, conversations, bots] = await Promise.all([
          analyticsService.getWorkspaceStats(activeWorkspace.workspace_id, activeProject?.id || undefined),
          analyticsService.getWorkspaceEvents(activeWorkspace.workspace_id, activeProject?.id || undefined),
          analyticsService.getWorkspacePresence(activeWorkspace.workspace_id, activeProject?.id || undefined),
          conversationService.list({
            workspaceId: activeWorkspace.workspace_id,
            projectId: activeProject?.id || undefined,
          }),
          botService.getBots({
            workspaceId: activeWorkspace.workspace_id,
            projectId: activeProject?.id || undefined,
          }),
        ]);

        const botRows = Array.isArray(bots) ? bots : [];
        const flowCounts = await Promise.all(
          botRows.map(async (bot: any) => {
            const flows = await flowService.getFlowSummaries(String(bot.id));
            return Array.isArray(flows)
              ? flows.filter((flow: any) => flow?.is_active !== false && !Boolean(flow?.is_system_flow)).length
              : 0;
          })
        );

        let botMessageCount = 0;
        let botConversationCount = 0;
        if (selectedBotId) {
          try {
            const botStats = await analyticsService.getBotStats(selectedBotId);
            botMessageCount = Number(botStats?.messages || 0);
            botConversationCount = Number(botStats?.conversations || 0);
          } catch (err) {
            console.error("Failed to load selected bot analytics", err);
          }
        }

        const conversationRows = Array.isArray(conversations) ? conversations : [];
        const liveConversations = conversationRows.filter((item) => {
          const status = String(item?.status || "").toLowerCase();
          return status === "active" || status === "agent_pending";
        }).length;
        const unreadMessages = conversationRows.reduce(
          (total, item) => total + Number(item?.unread_count || 0),
          0
        );
        const liveAgents = (Array.isArray(workspacePresence) ? workspacePresence : []).filter((agent) =>
          ["online", "idle"].includes(String(agent?.session_status || "").toLowerCase())
        ).length;

        setStats({
          conversations: botConversationCount || liveConversations,
          messages: botMessageCount,
          totalEvents: Number(workspaceStats?.stats?.totalEvents || 0),
          activeCampaigns: Number(workspaceStats?.stats?.activeCampaigns || 0),
          totalLeads: Number(workspaceStats?.stats?.totalLeads || 0),
          activeFlows: flowCounts.reduce((sum, count) => sum + count, 0),
          liveConversations,
          unreadMessages,
          liveAgents,
        });
        setEvents(Array.isArray(workspaceEvents) ? workspaceEvents : []);
        setPresence(Array.isArray(workspacePresence) ? workspacePresence : []);
      } catch (err: any) {
        console.error("Failed to load dashboard analytics", err);
        setStats({
          conversations: 0,
          messages: 0,
          totalEvents: 0,
          activeCampaigns: 0,
          totalLeads: 0,
          activeFlows: 0,
          liveConversations: 0,
          unreadMessages: 0,
          liveAgents: 0,
        });
        setEvents([]);
        setPresence([]);
        if (err?.response?.status === 403) {
          setError("Analytics are not available for your current role in this workspace.");
          return;
        }
        setError(err?.response?.data?.error || "Failed to load dashboard analytics");
      } finally {
        setLoading(false);
      }
    };

    load().catch(console.error);
  }, [activeProject?.id, activeWorkspace?.workspace_id, canViewDashboardPage, isPlatformDashboard, selectedBotId]);

  const metrics = useMemo(
    () => [
      { label: "Active Flows", value: stats.activeFlows },
      { label: "Live Conversations", value: stats.liveConversations },
      { label: "Unread Messages", value: stats.unreadMessages },
      { label: "Live Agents", value: stats.liveAgents },
      { label: "Active Campaigns", value: stats.activeCampaigns },
      { label: "Recent Events", value: stats.totalEvents },
      { label: "Active Context", value: currentScopeLabel },
    ],
    [currentScopeLabel, stats]
  );

  return (
    <DashboardLayout>
      {!canViewDashboardPage || isPlatformDashboard ? (
        <PageAccessNotice
          title="Dashboard is not available for this role"
          description={
            isPlatformOperator
              ? "Platform operators should start from workspaces, support, or users and permissions."
              : "Open the inbox to work with conversations from your current role."
          }
          href={isPlatformOperator ? "/workspaces" : "/inbox"}
          ctaLabel={isPlatformOperator ? "Open workspaces" : "Open inbox"}
        />
      ) : (
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 border-b border-border-main pb-6">
          <h1 className="text-2xl font-bold tracking-tight text-text-main">System Performance</h1>
          <p className="mt-1 text-sm text-text-muted">
            Monitoring active context:{" "}
            <span className="font-mono text-text-main">
              {selectedBotId
                ? `${currentScopeLabel} - ${selectedBotId.slice(0, 8)}`
                : currentScopeLabel}
            </span>
          </p>
        </header>

        {error ? (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => (
            <div
              key={metric.label}
              className="bg-surface border border-border-main rounded-xl shadow-sm p-5"
            >
              <p className="mb-1 text-xs font-bold uppercase tracking-widest text-text-muted">
                {metric.label}
              </p>
              <p className="truncate text-2xl font-bold text-text-main">{metric.value}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="bg-surface border border-border-main rounded-xl shadow-sm overflow-hidden">
              <div className="flex items-center justify-between border-b border-border-main bg-surface p-4">
                <h2 className="text-xs font-bold uppercase tracking-widest text-text-muted">
                  Recent System Events
                </h2>
                <div className={`h-2 w-2 rounded-full ${loading ? "bg-amber-400" : "bg-emerald-500"}`} />
              </div>
              <div className="divide-y divide-border-light">
                {events.length === 0 ? (
                  <div className="p-4 text-sm text-text-muted">
                    {loading ? "Loading analytics events..." : "No analytics events recorded yet."}
                  </div>
                ) : (
                  events.slice(0, 8).map((event, index) => (
                    <div
                      key={event.id || `${event.event_type}-${index}`}
                      className="flex items-center justify-between p-4"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded bg-canvas text-xs font-bold text-text-muted">
                          EVT
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-text-main">
                            {event.event_name || event.event_type || "Event"}
                          </p>
                          <p className="text-xs font-mono text-text-muted">
                            {event.conversation_id || event.bot_id || "No context id"}
                          </p>
                        </div>
                      </div>
                      <span className="text-xs font-bold uppercase text-text-muted">
                        {formatTimeAgo(event.created_at)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-surface border border-border-main rounded-xl shadow-sm p-6">
              <h3 className="mb-4 text-xs font-bold uppercase tracking-widest text-text-muted">
                Environment Status
              </h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-main">Bot Engine</span>
                  <span className="text-xs font-bold uppercase text-text-muted">
                    {availableBotCount > 0 ? "Tracking" : "Idle"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-main">Analytics Feed</span>
                  <span className="text-xs font-bold uppercase text-text-muted">
                    {loading ? "Loading" : "Ready"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-main">Recent Events</span>
                  <span className="text-xs font-bold uppercase text-text-muted">
                    {events.length}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-main">Agents Online</span>
                  <span className="text-xs font-bold uppercase text-text-muted">
                    {presence.filter((agent) => ["online", "idle"].includes(String(agent?.session_status || "").toLowerCase())).length}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      )}
    </DashboardLayout>
  );
}

