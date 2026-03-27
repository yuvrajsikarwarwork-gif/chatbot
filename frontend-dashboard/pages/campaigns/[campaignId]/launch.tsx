import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";

import CampaignSenderModal from "../../../components/campaign/CampaignSenderModal";
import PageAccessNotice from "../../../components/access/PageAccessNotice";
import DashboardLayout from "../../../components/layout/DashboardLayout";
import BackButtonStrip from "../../../components/navigation/BackButtonStrip";
import SectionTabs from "../../../components/navigation/SectionTabs";
import { useVisibility } from "../../../hooks/useVisibility";
import apiClient from "../../../services/apiClient";
import { useAuthStore } from "../../../store/authStore";

export default function CampaignLaunchPage() {
  const router = useRouter();
  const { campaignId } = router.query;
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);
  const activeProject = useAuthStore((state) => state.activeProject);
  const setActiveProject = useAuthStore((state) => state.setActiveProject);
  const hasWorkspacePermission = useAuthStore((state) => state.hasWorkspacePermission);
  const getProjectRole = useAuthStore((state) => state.getProjectRole);
  const { canViewPage } = useVisibility();
  const [campaign, setCampaign] = useState<any>(null);
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isLaunchOpen, setIsLaunchOpen] = useState(false);
  const [error, setError] = useState("");

  const canViewCampaignPage = canViewPage("campaigns");
  const selectedWorkspaceId =
    campaign?.workspace_id || campaign?.workspaceId || activeWorkspace?.workspace_id || "";
  const selectedProjectId =
    campaign?.project_id || campaign?.projectId || activeProject?.id || "";
  const canLaunchCampaign = hasWorkspacePermission(selectedWorkspaceId, "can_create_campaign");
  const projectRole = getProjectRole(selectedProjectId);
  const canLaunchProjectCampaign =
    canLaunchCampaign || projectRole === "project_admin" || projectRole === "editor";

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

  const approvedTemplates = useMemo(
    () => templates.filter((template) => template.status === "approved"),
    [templates]
  );

  const launchRequirements = useMemo(
    () => [
      {
        label: "Launch permission",
        met: canLaunchProjectCampaign,
        hint: "Workspace or project launch access is required.",
      },
      {
        label: "Campaign channels",
        met: Boolean(campaign?.channels?.length),
        hint: "Add at least one channel before launching.",
      },
      {
        label: "Audience lists",
        met: Boolean(campaign?.lists?.length),
        hint: "Create at least one campaign list before launching.",
      },
      {
        label: "Approved templates",
        met: approvedTemplates.length > 0,
        hint: "Approve at least one template for the active project.",
      },
    ],
    [approvedTemplates.length, canLaunchProjectCampaign, campaign?.channels?.length, campaign?.lists?.length]
  );

  const launchBlockedReasons = launchRequirements.filter((item) => !item.met);
  const isLaunchReady = launchBlockedReasons.length === 0;

  useEffect(() => {
    if (!campaignId || !canViewCampaignPage) {
      setCampaign(null);
      setTemplates([]);
      return;
    }

    setLoading(true);
    apiClient
      .get(`/campaigns/${campaignId}`)
      .then(async (campaignRes) => {
        const campaignData = campaignRes.data as any;
        setCampaign(campaignData);

        const workspaceId =
          campaignData?.workspace_id || campaignData?.workspaceId || activeWorkspace?.workspace_id;
        const projectId =
          campaignData?.project_id || campaignData?.projectId || activeProject?.id;
        if (projectId && workspaceId && activeProject?.id !== projectId) {
          setActiveProject({
            id: projectId,
            workspace_id: workspaceId,
            name: campaignData?.project_name || activeProject?.name || "Project",
            status: campaignData?.project_status || activeProject?.status || "active",
          });
        }

        const templatesRes = await apiClient.get("/templates", {
          params: {
            workspaceId,
            projectId,
          },
        });
        setTemplates(Array.isArray(templatesRes.data) ? templatesRes.data : []);
      })
      .catch((err: any) => {
        console.error("Failed to load launch screen", err);
        setCampaign(null);
        setTemplates([]);
        setError(err?.response?.data?.error || "Failed to load launch screen");
      })
      .finally(() => setLoading(false));
  }, [campaignId, canViewCampaignPage, activeWorkspace?.workspace_id, activeProject?.id, activeProject?.name, activeProject?.status, setActiveProject]);

  return (
    <DashboardLayout>
      {!canViewCampaignPage ? (
        <PageAccessNotice
          title="Campaign launch is restricted for this role"
          description="Campaign pages are only available to users with campaign or assigned project access."
          href="/campaigns"
          ctaLabel="Open campaigns"
        />
      ) : (
        <div className="mx-auto max-w-6xl space-y-6">
          <BackButtonStrip href={`/campaigns/${campaignId}/audience`} label="Back to audience" />
          <section className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)]">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
                  Launch
                </div>
                <h1 className="mt-3 text-[1.6rem] font-semibold tracking-tight text-[var(--text)]">
                  Launch {campaign?.name || "campaign"}
                </h1>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                  Use approved templates, a selected bot, and target leads from the active project to launch this campaign.
                </p>
              </div>
              <SectionTabs items={tabs} currentPath={router.asPath.split("?")[0] || ""} />
            </div>
          </section>

          {error ? <section className="rounded-[1.5rem] border border-rose-300/55 bg-rose-500/12 p-4 text-sm font-medium text-rose-800">{error}</section> : null}

          <section className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)]">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-[1.2rem] border border-[var(--line)] bg-[var(--surface-strong)] p-4">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Approved templates</div>
                <div className="mt-3 text-2xl font-semibold text-[var(--text)]">
                  {approvedTemplates.length}
                </div>
              </div>
              <div className="rounded-[1.2rem] border border-[var(--line)] bg-[var(--surface-strong)] p-4">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Campaign lists</div>
                <div className="mt-3 text-2xl font-semibold text-[var(--text)]">{campaign?.lists?.length || 0}</div>
              </div>
              <div className="rounded-[1.2rem] border border-[var(--line)] bg-[var(--surface-strong)] p-4">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Channels</div>
                <div className="mt-3 text-2xl font-semibold text-[var(--text)]">{campaign?.channels?.length || 0}</div>
              </div>
            </div>

            <div className="mt-6 rounded-[1.2rem] border border-[var(--line)] bg-[var(--surface-strong)] p-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                Launch readiness
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {launchRequirements.map((item) => (
                  <div
                    key={item.label}
                    className={`rounded-xl border px-4 py-3 text-sm ${
                      item.met
                        ? "border-emerald-300/45 bg-emerald-500/12 text-emerald-800"
                        : "border-rose-300/45 bg-rose-500/12 text-rose-800"
                    }`}
                  >
                    <div className="font-semibold">{item.label}</div>
                    <div className="mt-1 text-xs opacity-90">
                      {item.met ? "Ready" : item.hint}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {!isLaunchReady ? (
              <div className="mt-6 rounded-[1.2rem] border border-[var(--line)] bg-[var(--surface-muted)] px-4 py-4 text-sm text-[var(--muted)]">
                Complete the missing launch requirements before sending this campaign from a test environment.
              </div>
            ) : null}

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setIsLaunchOpen(true)}
                disabled={!isLaunchReady || loading}
                className="rounded-2xl border border-[rgba(129,140,248,0.4)] bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] px-5 py-3 text-[11px] font-black uppercase tracking-[0.2em] text-white shadow-[0_18px_30px_var(--accent-glow)] disabled:cursor-not-allowed disabled:border-slate-300/60 disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none disabled:opacity-100"
              >
                Launch campaign
              </button>
            </div>
          </section>

          <CampaignSenderModal
            isOpen={isLaunchOpen}
            onClose={() => setIsLaunchOpen(false)}
            templates={approvedTemplates}
            canLaunchCampaign={canLaunchProjectCampaign && isLaunchReady}
          />
        </div>
      )}
    </DashboardLayout>
  );
}
