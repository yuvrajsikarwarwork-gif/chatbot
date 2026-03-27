import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";

import PageAccessNotice from "../../../components/access/PageAccessNotice";
import DashboardLayout from "../../../components/layout/DashboardLayout";
import BackButtonStrip from "../../../components/navigation/BackButtonStrip";
import SectionTabs from "../../../components/navigation/SectionTabs";
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
  const { canViewPage } = useVisibility();
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
    canEditCampaign || projectRole === "project_admin" || projectRole === "editor";

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
          <section className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)]">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
                  Campaign Overview
                </div>
                <h1 className="mt-3 text-[1.6rem] font-semibold tracking-tight text-[var(--text)]">
                  {campaign?.name || "Campaign"}
                </h1>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                  Keep high-level campaign identity and status here. Routing and audience setup now live in dedicated child pages.
                </p>
              </div>
              <SectionTabs items={tabs} currentPath={router.asPath.split("?")[0] || ""} />
            </div>
          </section>

          {error ? (
            <section className="rounded-[1.5rem] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </section>
          ) : null}

          {success ? (
            <section className="rounded-[1.5rem] border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
              {success}
            </section>
          ) : null}

          <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
            <section className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                    Campaign name
                  </label>
                  <input
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
                    value={form.name}
                    disabled={!canEditProjectCampaign || loading}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                    Description
                  </label>
                  <textarea
                    className="min-h-[120px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
                    value={form.description}
                    disabled={!canEditProjectCampaign || loading}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, description: event.target.value }))
                    }
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                      Status
                    </label>
                    <select
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
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
                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                      Start
                    </label>
                    <input
                      type="date"
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
                      value={form.startDate}
                      disabled={!canEditProjectCampaign || loading}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, startDate: event.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                      End
                    </label>
                    <input
                      type="date"
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
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
                  className="rounded-2xl bg-slate-900 px-4 py-3 text-[11px] font-black uppercase tracking-[0.2em] text-white disabled:opacity-50"
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
                    className="rounded-[1.2rem] border border-[var(--line)] bg-[var(--surface)] px-4 py-4 shadow-sm transition hover:border-[var(--line-strong)]"
                  >
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                      {card.label}
                    </div>
                    <div className="mt-3 text-2xl font-semibold text-[var(--text)]">{card.value}</div>
                  </Link>
                ))}
              </div>

              <div className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                  Campaign path
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {tabs.slice(1).map((tab) => (
                    <Link
                      key={tab.href}
                      href={tab.href}
                      className="rounded-[1.1rem] border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-4 text-sm text-[var(--text)] transition hover:border-[var(--line-strong)]"
                    >
                      {tab.label}
                    </Link>
                  ))}
                </div>
              </div>
            </section>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
