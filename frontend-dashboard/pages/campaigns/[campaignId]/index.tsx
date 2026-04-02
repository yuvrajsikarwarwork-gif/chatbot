import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";

import PageAccessNotice from "../../../components/access/PageAccessNotice";
import CampaignHeader from "../../../components/campaign/CampaignHeader";
import DashboardLayout from "../../../components/layout/DashboardLayout";
import BackButtonStrip from "../../../components/navigation/BackButtonStrip";
import FormHelpHint from "../../../components/forms/FormHelpHint";
import { useVisibility } from "../../../hooks/useVisibility";
import { campaignService } from "../../../services/campaignService";
import { useAuthStore } from "../../../store/authStore";

export default function CampaignOverviewPage() {
  const router = useRouter();
  const { campaignId } = router.query;
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);
  const activeProject = useAuthStore((state) => state.activeProject);
  const setActiveProject = useAuthStore((state) => state.setActiveProject);
  const hasWorkspacePermission = useAuthStore((state) => state.hasWorkspacePermission);
  const getProjectRole = useAuthStore((state) => state.getProjectRole);
  const { canViewPage, isReadOnly } = useVisibility();
  const [campaign, setCampaign] = useState<any>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    status: "draft",
    startDate: "",
    endDate: "",
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const canViewCampaignPage = canViewPage("campaigns");
  const selectedWorkspaceId =
    campaign?.workspace_id || campaign?.workspaceId || activeWorkspace?.workspace_id || "";
  const selectedProjectId =
    campaign?.project_id || campaign?.projectId || activeProject?.id || "";
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

  useEffect(() => {
    if (!campaignId || !canViewCampaignPage) {
      setCampaign(null);
      return;
    }

    setLoading(true);
    setError("");
    campaignService
      .get(String(campaignId))
      .then((detail) => {
        const campaignDetail = detail as any;
        setCampaign(campaignDetail);
        const detailProjectId = campaignDetail.project_id || campaignDetail.projectId;
        const detailWorkspaceId = campaignDetail.workspace_id || campaignDetail.workspaceId;
        if (detailProjectId && detailWorkspaceId && activeProject?.id !== detailProjectId) {
          setActiveProject({
            id: detailProjectId,
            workspace_id: detailWorkspaceId,
            name: campaignDetail.project_name || activeProject?.name || "Project",
            status: campaignDetail.project_status || activeProject?.status || "active",
          });
        }
        setForm({
          name: campaignDetail.name || "",
          description: campaignDetail.description || "",
          status: campaignDetail.status || "draft",
          startDate: campaignDetail.start_date?.slice(0, 10) || "",
          endDate: campaignDetail.end_date?.slice(0, 10) || "",
        });
      })
      .catch((err: any) => {
        console.error("Failed to load campaign overview", err);
        setCampaign(null);
        setError(err?.response?.data?.error || "Failed to load campaign");
      })
      .finally(() => setLoading(false));
  }, [campaignId, canViewCampaignPage, activeProject?.id, activeProject?.name, activeProject?.status, setActiveProject]);

  const handleSave = async () => {
    if (!campaignId) {
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");
      const saved = await campaignService.update(String(campaignId), {
        name: form.name,
        description: form.description || null,
        status: form.status,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
      });
      setCampaign((current: any) => ({ ...current, ...saved }));
      setSuccess("Campaign overview updated.");
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to save campaign");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout>
      {!canViewCampaignPage ? (
        <PageAccessNotice
          title="Campaign overview is restricted for this role"
          description="Campaign pages are only available to users with campaign or assigned project access."
          href="/campaigns"
          ctaLabel="Open campaigns"
        />
      ) : (
        <div className="mx-auto max-w-7xl space-y-6">
          <BackButtonStrip href="/campaigns" label="Back to campaigns" />
          <CampaignHeader
            campaignName={campaign?.name}
            pageTitle="Campaign Overview"
            description="Keep high-level campaign identity and status here. Routing and audience setup now live in dedicated child pages."
            tabs={tabs}
            currentPath={router.asPath.split("?")[0] || ""}
          />

          {error ? (
            <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
              {error}
            </section>
          ) : null}

          {success ? (
            <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
              {success}
            </section>
          ) : null}

          <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
            <section className="rounded-[2rem] border border-border-main bg-surface p-8 shadow-sm">
              <div className="space-y-4">
                <div>
                  <FormHelpHint label="Campaign name" hint="A clear, unique name to identify this campaign internally." />
                  <input
                    className="w-full rounded-xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50"
                    value={form.name}
                    disabled={!canEditProjectCampaign || loading}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  />
                </div>
                <div>
                  <FormHelpHint label="Description" hint="Internal notes about the campaign's goals or audience." />
                  <textarea
                    className="min-h-[120px] w-full rounded-xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50"
                    value={form.description}
                    disabled={!canEditProjectCampaign || loading}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, description: event.target.value }))
                    }
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <FormHelpHint label="Status" hint="Drafts are inactive. Active campaigns process entries. Archived campaigns are read-only." />
                    <select
                      className="w-full rounded-xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50"
                      value={form.status}
                      disabled={!canEditProjectCampaign || loading}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, status: event.target.value }))
                      }
                    >
                      <option value="draft">draft</option>
                      <option value="active">active</option>
                      <option value="paused">paused</option>
                      <option value="archived">archived</option>
                    </select>
                  </div>
                  <div>
                    <FormHelpHint label="Start date" hint="When this campaign should begin processing users." />
                    <input
                      type="date"
                      className="w-full rounded-xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50"
                      value={form.startDate}
                      disabled={!canEditProjectCampaign || loading}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, startDate: event.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <FormHelpHint label="End date" hint="When this campaign automatically stops. Leave blank to run indefinitely." />
                    <input
                      type="date"
                      className="w-full rounded-xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50"
                      value={form.endDate}
                      disabled={!canEditProjectCampaign || loading}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, endDate: event.target.value }))
                      }
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!canEditProjectCampaign || saving || loading}
                  className="rounded-2xl border border-primary bg-primary px-6 py-3 text-[10px] font-black uppercase tracking-[0.15em] text-white shadow-sm transition-all hover:-translate-y-0.5 active:scale-95 disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save overview"}
                </button>
              </div>
            </section>

            <section className="space-y-6">
              <div className="grid gap-4 md:grid-cols-3">
                {[
                  { label: "Channels", value: campaign?.channels?.length || 0, href: `/campaigns/${campaignId}/channels` },
                  { label: "Entry points", value: campaign?.entryPoints?.length || 0, href: `/campaigns/${campaignId}/entries` },
                  { label: "Lists", value: campaign?.lists?.length || 0, href: `/campaigns/${campaignId}/audience` },
                ].map((card) => (
                  <Link
                    key={card.label}
                    href={card.href}
                    className="rounded-[2rem] border border-border-main bg-surface px-4 py-4 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/30 hover:bg-primary/5"
                  >
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">
                      {card.label}
                    </div>
                    <div className="mt-3 text-2xl font-semibold text-text-main">{card.value}</div>
                  </Link>
                ))}
              </div>
            </section>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
