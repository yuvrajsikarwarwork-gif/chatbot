import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";

import PageAccessNotice from "../../../../../components/access/PageAccessNotice";
import CampaignHeader from "../../../../../components/campaign/CampaignHeader";
import DashboardLayout from "../../../../../components/layout/DashboardLayout";
import BackButtonStrip from "../../../../../components/navigation/BackButtonStrip";
import { useVisibility } from "../../../../../hooks/useVisibility";
import { campaignService } from "../../../../../services/campaignService";
import { useAuthStore } from "../../../../../store/authStore";

export default function AutomationRunDetailPage() {
  const router = useRouter();
  const { campaignId, ruleId } = router.query;
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);
  const activeProject = useAuthStore((state) => state.activeProject);
  const setActiveProject = useAuthStore((state) => state.setActiveProject);
  const hasWorkspacePermission = useAuthStore((state) => state.hasWorkspacePermission);
  const getProjectRole = useAuthStore((state) => state.getProjectRole);
  const { canViewPage, isReadOnly } = useVisibility();

  const [runtime, setRuntime] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedRunId, setSelectedRunId] = useState("");
  const [actionLoading, setActionLoading] = useState("");
  const [message, setMessage] = useState("");

  const canViewCampaignPage = canViewPage("campaigns");
  const campaign = runtime?.campaign || null;
  const selectedWorkspaceId =
    campaign?.workspaceId || campaign?.workspace_id || activeWorkspace?.workspace_id || "";
  const selectedProjectId = campaign?.projectId || campaign?.project_id || activeProject?.id || "";
  const canEditCampaign = hasWorkspacePermission(selectedWorkspaceId, "edit_campaign");
  const projectRole = getProjectRole(selectedProjectId);
  const canEditProjectCampaign =
    !isReadOnly && (canEditCampaign || projectRole === "project_admin" || projectRole === "editor");

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

  const rules = Array.isArray(runtime?.rules) ? runtime.rules : [];
  const selectedRule = rules.find((item: any) => item.id === ruleId) || rules[0] || null;
  const history = Array.isArray(selectedRule?.history) ? selectedRule.history : [];
  const selectedRun = history.find((entry: any) => entry.id === selectedRunId) || history[0] || null;

  useEffect(() => {
    if (!campaignId || !canViewCampaignPage) {
      setRuntime(null);
      return;
    }

    setLoading(true);
    setError("");
    campaignService
      .getAutomationRuntime(String(campaignId))
      .then((data) => {
        const nextRuntime = data as any;
        setRuntime(nextRuntime);
        const detailCampaign = nextRuntime?.campaign || {};
        const workspaceId = detailCampaign.workspaceId || detailCampaign.workspace_id || activeWorkspace?.workspace_id;
        const projectId = detailCampaign.projectId || detailCampaign.project_id || activeProject?.id;
        if (projectId && workspaceId && activeProject?.id !== projectId) {
          setActiveProject({
            id: projectId,
            workspace_id: workspaceId,
            name: detailCampaign.name || activeProject?.name || "Project",
            status: activeProject?.status || "active",
          });
        }
      })
      .catch((err: any) => {
        console.error("Failed to load automation run detail", err);
        setError(err?.response?.data?.error || "Failed to load automation run detail");
      })
      .finally(() => setLoading(false));
  }, [campaignId, canViewCampaignPage, activeWorkspace?.workspace_id, activeProject?.id, activeProject?.name, activeProject?.status, setActiveProject]);

  useEffect(() => {
    if (!selectedRunId && history[0]?.id) {
      setSelectedRunId(history[0].id);
    }
  }, [history, selectedRunId]);

  const handleReplay = async () => {
    if (!campaignId || !selectedRule || !selectedRun) return;
    const leadId = String(selectedRun.leadId || selectedRun.payload?.leadId || "").trim();
    if (!leadId) {
      setError("Select a run with a lead id to replay it.");
      return;
    }
    setActionLoading("replay");
    setError("");
    setMessage("");
    try {
      await campaignService.replayAutomationRule(String(campaignId), String(selectedRule.id), leadId);
      setMessage("Run replayed successfully.");
      await campaignService.getAutomationRuntime(String(campaignId)).then((data) => setRuntime(data as any));
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to replay selected run");
    } finally {
      setActionLoading("");
    }
  };

  return (
    <DashboardLayout>
      {!canViewCampaignPage ? (
        <PageAccessNotice
          title="Campaign automation is restricted for this role"
          description="Campaign pages are only available to users with campaign or assigned project access."
          href="/campaigns"
          ctaLabel="Open campaigns"
        />
      ) : (
        <div className="mx-auto max-w-7xl space-y-6">
          <BackButtonStrip href={`/campaigns/${campaignId}/automation`} label="Back to automation" />
          <CampaignHeader
            campaignName={campaign?.name}
            pageTitle="Automation Run Detail"
            description="Review a single automation rule, inspect its execution history, and replay selected runs from one operator-focused view."
            tabs={tabs}
            currentPath={router.asPath.split("?")[0] || ""}
          />

          {error ? (
            <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
              {error}
            </section>
          ) : null}
          {message ? (
            <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
              {message}
            </section>
          ) : null}

          <section className="grid gap-3 md:grid-cols-4">
            {[
              { label: "Rules", value: rules.length },
              { label: "Runs", value: history.length },
              { label: "Failed", value: history.filter((entry: any) => String(entry.status || "") === "failed").length },
              { label: "Dead letters", value: history.filter((entry: any) => String(entry.status || "") === "failed" || String(entry.status || "") === "retry").length },
            ].map((card) => (
              <div key={card.label} className="rounded-2xl border border-border-main bg-canvas px-4 py-3">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">{card.label}</div>
                <div className="mt-1 text-lg font-semibold text-text-main">{card.value}</div>
              </div>
            ))}
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-4 rounded-[2rem] border border-border-main bg-surface p-8 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">Selected rule</div>
                  <div className="mt-1 text-sm font-semibold text-text-main">{selectedRule?.name || "Rule not found"}</div>
                  <div className="mt-1 text-xs text-text-muted">
                    {selectedRule?.type || "Unknown"} · {selectedRule?.branchFieldKey || "status"} · {selectedRule?.webhookPath || "No webhook path"}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/campaigns/${campaignId}/automation`}
                    className="rounded-2xl border border-border-main bg-canvas py-3 px-6 text-[10px] font-black uppercase tracking-[0.15em] text-text-main transition-all hover:bg-surface active:scale-95"
                  >
                    Open workflow
                  </Link>
                  <button
                    type="button"
                    onClick={handleReplay}
                    disabled={!canEditProjectCampaign || !selectedRun?.leadId || actionLoading === "replay"}
                    className="rounded-2xl border border-primary bg-primary py-3 px-6 text-[10px] font-black uppercase tracking-[0.15em] text-white shadow-sm transition-all hover:-translate-y-0.5 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {actionLoading === "replay" ? "Replaying..." : "Replay selected"}
                  </button>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-border-main bg-canvas px-4 py-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">Schedule</div>
                  <div className="mt-1 text-sm font-semibold text-text-main">
                    {selectedRule?.type === "cron"
                      ? `${selectedRule?.cronEveryMinutes || "60"} min`
                      : selectedRule?.type === "webhook"
                        ? "Webhook driven"
                        : selectedRule?.dateFieldKey || "Date trigger"}
                  </div>
                </div>
                <div className="rounded-2xl border border-border-main bg-canvas px-4 py-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">Branches</div>
                  <div className="mt-1 text-sm font-semibold text-text-main">{selectedRule?.branches?.length || 0}</div>
                </div>
                <div className="rounded-2xl border border-border-main bg-canvas px-4 py-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">Actions</div>
                  <div className="mt-1 text-sm font-semibold text-text-main">{selectedRule?.actions?.length || 0}</div>
                </div>
              </div>

              <div className="rounded-2xl border border-border-main bg-canvas p-4">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">Run history</div>
                <div className="mt-3 space-y-2">
                  {history.length ? (
                    history.map((entry: any) => (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => setSelectedRunId(entry.id)}
                        className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                          selectedRunId === entry.id
                            ? "border-primary bg-primary-fade"
                            : "border-border-main bg-surface hover:border-primary/30"
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-text-main">
                              {entry.leadName || entry.summary || entry.id}
                            </div>
                            <div className="text-[10px] uppercase tracking-[0.18em] text-text-muted">
                              {entry.status || "completed"} · {entry.triggerType || "trigger"}
                            </div>
                          </div>
                          <div className="text-xs text-text-muted">
                            {entry.createdAt ? new Date(entry.createdAt).toLocaleString() : "Unknown"}
                          </div>
                        </div>
                        <div className="mt-2 text-xs leading-5 text-text-muted">
                          {entry.error || entry.summary || "Execution details available in payload."}
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="rounded-xl border border-dashed border-border-main bg-surface px-4 py-6 text-sm text-text-muted">
                      No run history has been recorded for this rule yet.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-4 rounded-[2rem] border border-border-main bg-surface p-8 shadow-sm">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">Run inspection</div>
                <div className="mt-1 text-sm font-semibold text-text-main">
                  {selectedRun?.leadName || selectedRun?.summary || "Select a run"}
                </div>
                <div className="mt-1 text-xs text-text-muted">
                  {selectedRun?.status || "No run selected"} · {selectedRun?.triggerType || "Trigger"} · {selectedRun?.createdAt ? new Date(selectedRun.createdAt).toLocaleString() : "Unknown"}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-border-main bg-canvas px-4 py-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">Lead</div>
                  <div className="mt-1 text-sm font-semibold text-text-main">
                    {selectedRun?.leadName || selectedRun?.payload?.leadName || selectedRun?.payload?.leadId || "Unknown"}
                  </div>
                </div>
                <div className="rounded-2xl border border-border-main bg-canvas px-4 py-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">Replay id</div>
                  <div className="mt-1 text-sm font-semibold text-text-main">{selectedRun?.leadId || selectedRun?.payload?.leadId || "Not available"}</div>
                </div>
              </div>

              <div className="rounded-2xl border border-border-main bg-canvas p-4">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">Payload</div>
                <pre className="mt-3 overflow-x-auto rounded-xl border border-border-main bg-surface px-3 py-3 text-[11px] leading-5 text-text-muted">
                  {JSON.stringify(selectedRun?.payload || {}, null, 2)}
                </pre>
              </div>

              <div className="rounded-2xl border border-border-main bg-canvas p-4">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">Outcome</div>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-border-main bg-surface px-3 py-3 text-sm text-text-muted">
                    Retry count: {selectedRun?.retryCount || 0}
                  </div>
                  <div className="rounded-xl border border-border-main bg-surface px-3 py-3 text-sm text-text-muted">
                    Error: {selectedRun?.error || "None"}
                  </div>
                  <div className="rounded-xl border border-border-main bg-surface px-3 py-3 text-sm text-text-muted">
                    Status: {selectedRun?.status || "completed"}
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}
    </DashboardLayout>
  );
}
