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
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const canViewCampaignPage = canViewPage("campaigns");
  const tabs = useMemo(
    () => [
      { label: "Overview", href: `/campaigns/${campaignId}` },
      { label: "Channels", href: `/campaigns/${campaignId}/channels` },
      { label: "Entries", href: `/campaigns/${campaignId}/entries` },
      { label: "Audience", href: `/campaigns/${campaignId}/audience` },
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
    Promise.all([campaignService.get(String(campaignId)), campaignService.getActivity(String(campaignId))])
      .then(([detail, rows]) => {
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
      })
      .catch((err: any) => {
        console.error("Failed to load campaign activity", err);
        setLogs([]);
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
