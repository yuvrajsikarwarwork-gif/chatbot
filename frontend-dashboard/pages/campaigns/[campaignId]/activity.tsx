import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";

import PageAccessNotice from "../../../components/access/PageAccessNotice";
import DashboardLayout from "../../../components/layout/DashboardLayout";
import BackButtonStrip from "../../../components/navigation/BackButtonStrip";
import SectionTabs from "../../../components/navigation/SectionTabs";
import { useVisibility } from "../../../hooks/useVisibility";
import { campaignService } from "../../../services/campaignService";
import { useAuthStore } from "../../../store/authStore";

export default function CampaignActivityPage() {
  const router = useRouter();
  const { campaignId } = router.query;
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);
  const activeProject = useAuthStore((state) => state.activeProject);
  const setActiveProject = useAuthStore((state) => state.setActiveProject);
  const { canViewPage } = useVisibility();
  const [logs, setLogs] = useState<any[]>([]);
  const [broadcastAnalytics, setBroadcastAnalytics] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const canViewCampaignPage = canViewPage("campaigns");
  const suppressionSlices = Array.isArray(broadcastAnalytics?.suppressionSlices)
    ? [...broadcastAnalytics.suppressionSlices].sort(
        (a: any, b: any) => Number(b.leadCount || 0) - Number(a.leadCount || 0)
      )
    : [];
  const suppressionTotal = suppressionSlices.reduce(
    (sum: number, slice: any) => sum + Number(slice.leadCount || 0),
    0
  );
  const templateRows = Array.isArray(broadcastAnalytics?.templateSummary) ? broadcastAnalytics.templateSummary : [];
  const platformSummary = templateRows.reduce((acc: Record<string, { launches: number; leads: number; success: number; failed: number }>, row: any) => {
    const key = String(row.platform || "unknown").trim();
    const bucket = acc[key] || { launches: 0, leads: 0, success: 0, failed: 0 };
    bucket.launches += Number(row.launch_count || 0);
    bucket.leads += Number(row.total_leads || 0);
    bucket.success += Number(row.success_count || 0);
    bucket.failed += Number(row.fail_count || 0);
    acc[key] = bucket;
    return acc;
  }, {});
  const platformRows = Object.entries(platformSummary as Record<
    string,
    { launches: number; leads: number; success: number; failed: number }
  >).map(([platform, stats]) => ({
    platform,
    launches: stats.launches,
    leads: stats.leads,
    success: stats.success,
    failed: stats.failed,
  }));
  const performanceRows = [...templateRows]
    .map((row: any) => {
      const recipients = Number(row.total_leads || 0);
      const success = Number(row.success_count || 0);
      const failed = Number(row.fail_count || 0);
      const successRate = recipients > 0 ? Math.round((success / recipients) * 100) : 0;
      return {
        key: `${row.template_name}-${row.platform}`,
        name: row.template_name,
        platform: row.platform,
        recipients,
        success,
        failed,
        launches: Number(row.launch_count || 0),
        successRate,
      };
    })
    .sort((a: any, b: any) => b.successRate - a.successRate || b.recipients - a.recipients);
  const tabs = useMemo(
    () => [
      { label: "Overview", href: `/campaigns/${campaignId}` },
      { label: "Channels", href: `/campaigns/${campaignId}/channels` },
      { label: "Entries", href: `/campaigns/${campaignId}/entries` },
      { label: "Audience", href: `/campaigns/${campaignId}/audience` },
      { label: "Automation", href: `/campaigns/${campaignId}/automation` },
      { label: "Launch", href: `/campaigns/${campaignId}/launch` },
      { label: "Activity", href: `/campaigns/${campaignId}/activity` },
    ],
    [campaignId]
  );

  useEffect(() => {
    if (!campaignId || !canViewCampaignPage) {
      setLogs([]);
      return;
    }

    setLoading(true);
    Promise.all([
      campaignService.get(String(campaignId)),
      campaignService.getActivity(String(campaignId)),
      campaignService.getBroadcastAnalytics(String(campaignId)),
    ])
      .then(([detail, rows, analytics]) => {
        const campaignDetail = detail as any;
        const workspaceId = campaignDetail.workspace_id || campaignDetail.workspaceId || activeWorkspace?.workspace_id;
        const projectId = campaignDetail.project_id || campaignDetail.projectId || activeProject?.id;
        if (projectId && workspaceId && activeProject?.id !== projectId) {
          setActiveProject({
            id: projectId,
            workspace_id: workspaceId,
            name: campaignDetail.project_name || activeProject?.name || "Project",
            status: campaignDetail.project_status || activeProject?.status || "active",
          });
        }
        setLogs(Array.isArray(rows) ? rows : []);
        setBroadcastAnalytics(analytics);
      })
      .catch((err: any) => {
        console.error("Failed to load campaign activity", err);
        setLogs([]);
        setBroadcastAnalytics(null);
        setError(err?.response?.data?.error || "Failed to load campaign activity");
      })
      .finally(() => setLoading(false));
  }, [campaignId, canViewCampaignPage, activeWorkspace?.workspace_id, activeProject?.id, activeProject?.name, activeProject?.status, setActiveProject]);

  return (
    <DashboardLayout>
      {!canViewCampaignPage ? (
        <PageAccessNotice
          title="Campaign activity is restricted for this role"
          description="Campaign pages are only available to users with campaign or assigned project access."
          href="/campaigns"
          ctaLabel="Open campaigns"
        />
      ) : (
        <div className="mx-auto max-w-6xl space-y-6">
          <BackButtonStrip href={`/campaigns/${campaignId}/launch`} label="Back to launch" />
          <section className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)]">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
                  Activity
                </div>
                <h1 className="mt-3 text-[1.6rem] font-semibold tracking-tight text-[var(--text)]">
                  Launch and delivery activity
                </h1>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                  Review template send activity tied to this campaign from the current workspace and project context.
                </p>
              </div>
              <SectionTabs items={tabs} currentPath={router.asPath.split("?")[0] || ""} />
            </div>
          </section>

          {error ? <section className="rounded-[1.5rem] border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</section> : null}

          <section className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
            <div className="space-y-3">
              <div className="grid gap-3 md:grid-cols-4">
                {[
                  { label: "Launches", value: broadcastAnalytics?.totals?.launchCount || 0 },
                  { label: "Recipients", value: broadcastAnalytics?.totals?.totalLeads || 0 },
                  { label: "Successful", value: broadcastAnalytics?.totals?.successCount || 0 },
                  { label: "Failed", value: broadcastAnalytics?.totals?.failCount || 0 },
                ].map((card) => (
                  <div key={card.label} className="rounded-2xl border border-border-main bg-surface px-4 py-3">
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">{card.label}</div>
                    <div className="mt-1 text-lg font-semibold text-text-main">{card.value}</div>
                  </div>
                ))}
              </div>

              {templateRows.length ? (
                <div className="rounded-2xl border border-border-main bg-canvas p-4">
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">
                    Delivery by template
                  </div>
                  <div className="mt-3 space-y-2">
                    {templateRows.map((row: any) => {
                      const sent = Number(row.total_leads || 0);
                      const success = Number(row.success_count || 0);
                      const successRate = sent > 0 ? Math.round((success / sent) * 100) : 0;
                      return (
                        <div key={`${row.template_name}-${row.platform}`} className="rounded-xl border border-border-main bg-surface px-4 py-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-text-main">{row.template_name}</div>
                              <div className="text-[10px] uppercase tracking-[0.18em] text-text-muted">{row.platform}</div>
                            </div>
                            <div className="text-right text-xs text-text-muted">
                              <div>{successRate}% success</div>
                              <div>{row.last_sent_at ? new Date(row.last_sent_at).toLocaleString() : "Unknown"}</div>
                            </div>
                          </div>
                          <div className="mt-3 grid gap-3 md:grid-cols-4">
                            <div className="text-sm text-text-muted">Launches: {row.launch_count}</div>
                            <div className="text-sm text-text-muted">Recipients: {row.total_leads}</div>
                            <div className="text-sm text-text-muted">Success: {row.success_count}</div>
                            <div className="text-sm text-text-muted">Failed: {row.fail_count}</div>
                          </div>
                          <div className="mt-3 h-2 rounded-full bg-canvas">
                            <div
                              className="h-2 rounded-full bg-gradient-to-r from-primary via-primary/90 to-emerald-300"
                              style={{ width: `${Math.max(8, successRate)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {platformRows.length ? (
                <div className="rounded-2xl border border-border-main bg-canvas p-4">
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">
                    Delivery by platform
                  </div>
                  <div className="mt-3 space-y-4">
                    {platformRows.map((row) => {
                      const successRate = row.leads > 0 ? Math.round((row.success / row.leads) * 100) : 0;
                      return (
                        <div key={row.platform} className="space-y-2 rounded-xl border border-border-main bg-surface px-4 py-3">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="text-sm font-semibold text-text-main">{row.platform}</div>
                            <div className="text-xs text-text-muted">{successRate}% success · {row.leads} recipients</div>
                          </div>
                          <div className="grid gap-2 md:grid-cols-3">
                            <div className="text-sm text-text-muted">Launches: {row.launches}</div>
                            <div className="text-sm text-text-muted">Successful: {row.success}</div>
                            <div className="text-sm text-text-muted">Failed: {row.failed}</div>
                          </div>
                          <div className="h-2 rounded-full bg-canvas">
                            <div
                              className="h-2 rounded-full bg-gradient-to-r from-cyan-400 via-primary to-emerald-300"
                              style={{ width: `${Math.max(8, successRate)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {performanceRows.length ? (
                <div className="rounded-2xl border border-border-main bg-canvas p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">
                      Performance segmentation
                    </div>
                    <div className="text-xs text-text-muted">
                      Sorted by success rate, then by recipient volume.
                    </div>
                  </div>
                  <div className="mt-3 space-y-3">
                    {performanceRows.map((row: any, index: number) => (
                      <div key={row.key} className="rounded-xl border border-border-main bg-surface px-4 py-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-text-main">
                              #{index + 1} {row.name}
                            </div>
                            <div className="text-[10px] uppercase tracking-[0.18em] text-text-muted">{row.platform}</div>
                          </div>
                          <div className="text-right text-xs text-text-muted">
                            <div>{row.successRate}% success</div>
                            <div>{row.recipients} recipients · {row.launches} launches</div>
                          </div>
                        </div>
                        <div className="mt-3 grid gap-3 md:grid-cols-3">
                          <div className="text-sm text-text-muted">Successful: {row.success}</div>
                          <div className="text-sm text-text-muted">Failed: {row.failed}</div>
                          <div className="text-sm text-text-muted">Volume share: {templateRows.length > 0 ? Math.round((row.recipients / Math.max(1, templateRows.reduce((sum: number, item: any) => sum + Number(item.total_leads || 0), 0))) * 100) : 0}%</div>
                        </div>
                        <div className="mt-3 h-2 rounded-full bg-canvas">
                          <div
                            className="h-2 rounded-full bg-gradient-to-r from-violet-400 via-primary to-emerald-300"
                            style={{ width: `${Math.max(8, row.successRate)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {broadcastAnalytics?.suppressionSlices?.length ? (
                <div className="rounded-2xl border border-border-main bg-canvas p-4">
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">
                    Suppression slice delivery chart
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <div className="rounded-2xl border border-border-main bg-surface px-4 py-3">
                      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">Slices</div>
                      <div className="mt-1 text-lg font-semibold text-text-main">{suppressionSlices.length}</div>
                    </div>
                    <div className="rounded-2xl border border-border-main bg-surface px-4 py-3">
                      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">Suppressed leads</div>
                      <div className="mt-1 text-lg font-semibold text-text-main">{suppressionTotal}</div>
                    </div>
                    <div className="rounded-2xl border border-border-main bg-surface px-4 py-3">
                      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">Largest slice</div>
                      <div className="mt-1 text-lg font-semibold text-text-main">
                        {suppressionSlices[0]?.name || "None"}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 space-y-4">
                    {suppressionSlices.map((slice: any) => {
                      const leadCount = Number(slice.leadCount || 0);
                      const width = Math.max(
                        10,
                        suppressionTotal > 0 ? Math.round((leadCount / suppressionTotal) * 100) : 0
                      );
                      return (
                        <div key={slice.id} className="space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                            <div className="font-semibold text-text-main">{slice.name}</div>
                            <div className="flex items-center gap-3 text-text-muted">
                              <span>{leadCount} leads</span>
                              <span>
                                {suppressionTotal > 0 ? Math.round((leadCount / suppressionTotal) * 100) : 0}%
                                {" "}of suppressed audience
                              </span>
                            </div>
                          </div>
                          <div className="h-3 rounded-full bg-surface">
                            <div
                              className="h-3 rounded-full bg-gradient-to-r from-primary via-primary/90 to-emerald-300"
                              style={{ width: `${width}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <div className="rounded-2xl border border-border-main bg-canvas p-4">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">
                  Suppression management
                </div>
                <div className="mt-3 space-y-2">
                  {broadcastAnalytics?.suppressionLists?.length ? (
                    broadcastAnalytics.suppressionLists.map((list: any) => (
                      <div key={list.id} className="rounded-xl border border-border-main bg-surface px-4 py-3 text-sm text-text-main">
                        {list.name} <span className="text-text-muted">({list.source_type || "suppression"})</span>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-xl border border-dashed border-border-main bg-surface px-4 py-3 text-sm text-text-muted">
                      No suppression lists defined yet.
                    </div>
                  )}
                </div>
              </div>

              {loading ? (
                <div className="rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface-strong)] px-4 py-6 text-sm text-[var(--muted)]">
                  Loading campaign activity...
                </div>
              ) : logs.length ? (
                logs.map((log, index) => (
                  <div key={log.id || index} className="rounded-[1.1rem] border border-[var(--line)] bg-[var(--surface-strong)] p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <div className="text-sm font-semibold text-[var(--text)]">
                          {log.template_name || log.templateName || "Template send"}
                        </div>
                        <div className="mt-1 text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
                          {log.status || log.delivery_status || "unknown"}
                        </div>
                      </div>
                      <div className="text-xs text-[var(--muted)]">
                        {log.created_at ? new Date(log.created_at).toLocaleString() : "Unknown"}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface-strong)] px-4 py-6 text-sm text-[var(--muted)]">
                  No campaign activity has been recorded for this campaign yet.
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </DashboardLayout>
  );
}
