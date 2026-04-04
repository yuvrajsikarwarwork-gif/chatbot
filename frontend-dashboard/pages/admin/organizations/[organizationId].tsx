import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  ArrowLeft,
  Building2,
  CloudDownload,
  CloudUpload,
  ExternalLink,
  Layers3,
  RefreshCcw,
  Shield,
  Sparkles,
  Workflow,
} from "lucide-react";

import DashboardLayout from "../../../components/layout/DashboardLayout";
import PageAccessNotice from "../../../components/access/PageAccessNotice";
import ApiKeyManager from "../../../components/admin/ApiKeyManager";
import QuotaIntervention from "../../../components/admin/QuotaIntervention";
import TimeWindowSelector from "../../../components/admin/TimeWindowSelector";
import UsageBreakdown from "../../../components/admin/UsageBreakdown";
import TemplatePreview from "../../../components/templates/TemplatePreview";
import { useAuthStore } from "../../../store/authStore";
import { useAdminAnalyticsStore } from "../../../store/adminAnalyticsStore";
import { useVisibility } from "../../../hooks/useVisibility";
import { adminService, type OrganizationTemplate, type OrganizationUsageBreakdown, type OrganizationWorkspace } from "../../../services/adminService";
import { authService } from "../../../services/authService";
import { notify } from "../../../store/uiStore";

type DetailTab = "overview" | "quotas" | "keys" | "templates" | "workspaces" | "breakdown";

function isDetailTab(value: string | null | undefined): value is DetailTab {
  return value === "overview" || value === "quotas" || value === "keys" || value === "templates" || value === "workspaces" || value === "breakdown";
}

export default function OrganizationDetailPage() {
  const router = useRouter();
  const { organizationId } = router.query;
  const user = useAuthStore((state) => state.user);
  const { canViewPage } = useVisibility();
  const [org, setOrg] = useState<any | null>(null);
  const [workspaces, setWorkspaces] = useState<OrganizationWorkspace[]>([]);
  const [templates, setTemplates] = useState<OrganizationTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [templateLoading, setTemplateLoading] = useState(true);
  const [error, setError] = useState("");
  const [templateError, setTemplateError] = useState("");
  const [breakdown, setBreakdown] = useState<OrganizationUsageBreakdown[]>([]);
  const [breakdownLoading, setBreakdownLoading] = useState(false);
  const [breakdownError, setBreakdownError] = useState("");
  const [activeTab, setActiveTab] = useState<DetailTab>("overview");
  const [selectedPlatform, setSelectedPlatform] = useState("whatsapp");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [syncingTemplateId, setSyncingTemplateId] = useState<string>("");
  const [impersonatingOrg, setImpersonatingOrg] = useState(false);
  const adminTimeWindow = useAdminAnalyticsStore((state) => state.adminTimeWindow);
  const setAdminTimeWindow = useAdminAnalyticsStore((state) => state.setAdminTimeWindow);

  const isSuperAdmin = String(user?.role || "").trim().toLowerCase() === "super_admin";
  const queryTab = typeof router.query.tab === "string" ? router.query.tab.toLowerCase() : null;
  const queryFocus = typeof router.query.focus === "string" ? router.query.focus : null;
  const queryFocusType = typeof router.query.focusType === "string" ? router.query.focusType.toLowerCase() : null;

  useEffect(() => {
    if (!router.isReady) {
      return;
    }

    if (isDetailTab(queryTab)) {
      setActiveTab(queryTab);
      return;
    }

    if (queryFocusType === "key") {
      setActiveTab("keys");
      return;
    }

    if (queryFocusType === "workspace") {
      setActiveTab("workspaces");
      return;
    }

    if (queryFocusType === "breakdown") {
      setActiveTab("breakdown");
    }
  }, [queryFocusType, queryTab, router.isReady]);

  useEffect(() => {
    if (!router.isReady || !organizationId || typeof organizationId !== "string") {
      return;
    }

    if (!isSuperAdmin) {
      setLoading(false);
      setTemplateLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setTemplateLoading(true);
    setError("");
    setTemplateError("");

    adminService
      .getOrganization(organizationId)
      .then((result) => {
        if (cancelled) {
          return;
        }

        setOrg(result.organization);
        setWorkspaces(result.workspaces || []);
      })
      .catch((err: any) => {
        if (!cancelled) {
          setError(err?.response?.data?.error || "Failed to load organization");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    adminService
      .listOrganizationTemplates(organizationId, selectedPlatform)
      .then((rows) => {
        if (cancelled) {
          return;
        }

        setTemplates(rows);
        setSelectedTemplateId((current) => current || rows[0]?.id || "");
      })
      .catch((err: any) => {
        if (!cancelled) {
          setTemplateError(err?.response?.data?.error || "Failed to load templates");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setTemplateLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isSuperAdmin, organizationId, router.isReady, selectedPlatform]);

  useEffect(() => {
    if (!router.isReady || !organizationId || typeof organizationId !== "string") {
      return;
    }

    if (!isSuperAdmin || activeTab !== "breakdown") {
      return;
    }

    let cancelled = false;
    setBreakdownLoading(true);
    setBreakdownError("");

    adminService
      .getOrganizationUsageBreakdown(organizationId, adminTimeWindow)
      .then((rows) => {
        if (!cancelled) {
          setBreakdown(rows);
        }
      })
      .catch((err: any) => {
        if (!cancelled) {
          setBreakdown([]);
          setBreakdownError(err?.response?.data?.error || "Failed to load usage breakdown");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setBreakdownLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, adminTimeWindow, isSuperAdmin, organizationId, router.isReady]);

  useEffect(() => {
    if (!router.isReady || !queryFocus || queryFocusType !== "workspace") {
      return;
    }

    const target = document.getElementById(`workspace-row-${queryFocus}`);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [queryFocus, queryFocusType, workspaces, router.isReady, activeTab]);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) || templates[0] || null,
    [templates, selectedTemplateId]
  );

  const metrics = useMemo(() => {
    const approved = templates.filter((template) => String(template.status || "").toLowerCase() === "approved").length;
    const inReview = templates.filter((template) => String(template.status || "").toLowerCase() === "in_review" || String(template.status || "").toLowerCase() === "pending").length;
    const rejected = templates.filter((template) => String(template.status || "").toLowerCase() === "rejected").length;
    const linked = templates.filter((template) => Boolean(template.meta_template_id || template.meta_template_name)).length;

    return {
      templates: templates.length,
      approved,
      inReview,
      rejected,
      linked,
      workspaces: workspaces.length,
    };
  }, [templates, workspaces.length]);

  const handleSyncTemplate = async (template: OrganizationTemplate) => {
    try {
      setSyncingTemplateId(template.id);
      await adminService.syncTemplateFromMeta(template);
      notify("Template status synced from Meta.", "success");
      const refreshed = await adminService.listOrganizationTemplates(String(organizationId), selectedPlatform);
      setTemplates(refreshed);
      if (!selectedTemplateId && refreshed[0]?.id) {
        setSelectedTemplateId(refreshed[0].id);
      }
    } catch (err: any) {
      notify(err?.response?.data?.error || "Failed to sync template from Meta.", "error");
    } finally {
      setSyncingTemplateId("");
    }
  };

  const handleOrganizationUpdated = (updatedOrganization: any) => {
    setOrg((current: any) => ({
      ...(current || {}),
      ...updatedOrganization,
    }));
  };

  const handleStartOrganizationImpersonation = async () => {
    if (!org?.id) {
      return;
    }

    try {
      setImpersonatingOrg(true);
      await authService.startOrganizationImpersonation(org.id);
      notify(`Entered full organization mode for ${org.name}.`, "success");
      router.push("/workspaces").catch(() => undefined);
    } catch (err: any) {
      notify(err?.response?.data?.error || "Failed to impersonate organization.", "error");
    } finally {
      setImpersonatingOrg(false);
    }
  };

  if (!isSuperAdmin) {
    return (
      <DashboardLayout title="Control Tower | Organization Detail">
        <PageAccessNotice
          title="Organization detail is restricted"
          description="Only super admin users can inspect organization governance, quotas, and templates."
          href={canViewPage("workspaces") ? "/workspaces" : "/"}
          ctaLabel={canViewPage("workspaces") ? "Open workspaces" : "Open dashboard"}
        />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title={`Control Tower | ${org?.name || "Organization"}`}>
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-[1.9rem] border border-border-main bg-[linear-gradient(180deg,rgba(91,33,182,0.07),rgba(255,255,255,0.98))] p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <Link
                href="/admin/organizations"
                className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.24em] text-text-muted transition hover:text-primary"
              >
                <ArrowLeft size={12} />
                Back to directory
              </Link>
              <div className="mt-3 text-[10px] font-black uppercase tracking-[0.3em] text-text-muted">
                Control Tower / Organization Detail
              </div>
              <h1 className="mt-2 text-[2rem] font-black tracking-[-0.04em] text-text-main">
                {org?.name || "Loading organization..."}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-text-muted">
                Inspect workspaces, monitor template readiness, and manage Meta-linked assets from one high-density support surface.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <MetricCard label="Workspaces" value={metrics.workspaces} icon={<Building2 size={16} />} />
              <MetricCard label="Templates" value={metrics.templates} icon={<Layers3 size={16} />} />
              <MetricCard label="Linked" value={metrics.linked} icon={<Shield size={16} />} />
            </div>
            <div className="mt-4 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={handleStartOrganizationImpersonation}
                disabled={impersonatingOrg}
                className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-amber-800 transition hover:border-amber-300 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {impersonatingOrg ? (
                  <RefreshCcw size={12} className="animate-spin" />
                ) : (
                  <Shield size={12} />
                )}
                {impersonatingOrg ? "Entering..." : "Impersonate Org"}
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-border-main bg-surface shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-main px-6 py-4">
            <div className="flex flex-wrap items-center gap-2">
              {(["overview", "quotas", "keys", "templates", "workspaces", "breakdown"] as DetailTab[]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] transition ${
                    activeTab === tab
                      ? "border border-primary/30 bg-primary-fade text-primary"
                      : "border border-transparent text-text-muted hover:bg-canvas hover:text-text-main"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">
                Template channel
              </label>
              <select
                value={selectedPlatform}
                onChange={(event) => setSelectedPlatform(event.target.value)}
                className="rounded-xl border border-border-main bg-surface px-3 py-2 text-xs font-semibold text-text-main outline-none"
              >
                <option value="whatsapp">WhatsApp</option>
                <option value="telegram">Telegram</option>
                <option value="email">Email</option>
                <option value="facebook">Facebook</option>
                <option value="instagram">Instagram</option>
              </select>
              <TimeWindowSelector value={adminTimeWindow} onChange={setAdminTimeWindow} />
            </div>
          </div>

          <div className="p-6">
            {loading ? (
              <div className="rounded-2xl border border-dashed border-border-main bg-canvas p-8 text-sm text-text-muted">
                Loading organization data...
              </div>
            ) : error ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                {error}
              </div>
            ) : null}

            {!loading && !error ? (
              <>
                {activeTab === "overview" ? (
                  <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                    <section className="rounded-[1.5rem] border border-border-main bg-canvas p-5 shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <div className="text-[10px] font-black uppercase tracking-[0.22em] text-text-muted">
                            Organization profile
                          </div>
                          <div className="mt-2 text-xl font-bold tracking-tight text-text-main">
                            {org?.name || "Organization"}
                          </div>
                          <div className="mt-2 text-sm text-text-muted">
                            Slug: <span className="font-mono text-text-main">{org?.slug || "n/a"}</span>
                          </div>
                        </div>
                        <div className={`rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-[0.2em] ${
                          org?.is_active === false
                            ? "border-rose-200 bg-rose-50 text-rose-700"
                            : "border-emerald-200 bg-emerald-50 text-emerald-700"
                        }`}>
                          {org?.is_active === false ? "Suspended" : "Active"}
                        </div>
                      </div>

                      <div className="mt-5 grid gap-3 md:grid-cols-2">
                        <InfoCard label="Plan tier" value={String(org?.plan_tier || "free").replace(/_/g, " ")} />
                        <InfoCard label="Message quota" value={String(org?.quota_messages ?? 0)} />
                        <InfoCard label="AI token quota" value={String(org?.quota_ai_tokens ?? 0)} />
                        <InfoCard label="Updated at" value={org?.updated_at ? new Date(org.updated_at).toLocaleString() : "n/a"} />
                      </div>

                      <div className="mt-5 rounded-[1.25rem] border border-border-main bg-white p-4">
                        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">
                          Template health
                        </div>
                        <div className="mt-3 grid gap-3 sm:grid-cols-3">
                          <StatChip label="Approved" value={metrics.approved} tone="emerald" />
                          <StatChip label="In review" value={metrics.inReview} tone="amber" />
                          <StatChip label="Rejected" value={metrics.rejected} tone="rose" />
                        </div>
                      </div>
                    </section>

                    <section className="space-y-4">
                  <div className="rounded-[1.5rem] border border-border-main bg-canvas p-5 shadow-sm">
                        <div className="text-[10px] font-black uppercase tracking-[0.22em] text-text-muted">
                          Workspaces
                        </div>
                        <div className="mt-4 space-y-3">
                          {workspaces.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-border-main bg-surface px-4 py-5 text-sm text-text-muted">
                              No workspaces linked to this organization yet.
                            </div>
                          ) : (
                            workspaces.map((workspace) => (
                              <div
                                key={workspace.id}
                                id={`workspace-row-${workspace.id}`}
                                className={`rounded-xl border px-4 py-3 shadow-sm transition ${
                                  queryFocusType === "workspace" && queryFocus === workspace.id
                                    ? "border-primary bg-primary-fade/40 ring-2 ring-primary/20"
                                    : "border-border-main bg-surface"
                                }`}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <div className="font-semibold text-text-main">{workspace.name}</div>
                                    <div className="mt-1 text-[10px] font-mono text-text-muted">{workspace.id}</div>
                                  </div>
                                  <span className="rounded-full border border-border-main bg-canvas px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-text-muted">
                                    {workspace.status || "unknown"}
                                  </span>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      <div className="rounded-[1.5rem] border border-border-main bg-canvas p-5 shadow-sm">
                        <div className="text-[10px] font-black uppercase tracking-[0.22em] text-text-muted">
                          Support notes
                        </div>
                        <p className="mt-3 text-sm leading-6 text-text-muted">
                          Use this view to validate whether a quota issue is really capacity-related or whether the org should be sent back to the Optimizer for template or flow tuning.
                        </p>
                      </div>
                    </section>
                  </div>
                ) : activeTab === "quotas" ? (
                  <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                    <QuotaIntervention organization={org} onUpdated={handleOrganizationUpdated} />

                    <section className="space-y-4">
                      <div className="rounded-[1.5rem] border border-border-main bg-canvas p-5 shadow-sm">
                        <div className="text-[10px] font-black uppercase tracking-[0.22em] text-text-muted">
                          Governance notes
                        </div>
                        <p className="mt-3 text-sm leading-6 text-text-muted">
                          Quotas are the active guardrails for this organization. Lowering them can stop runaway usage, but it may also block traffic if the org is already consuming near capacity.
                        </p>
                      </div>

                      <div className="rounded-[1.5rem] border border-border-main bg-surface p-5 shadow-sm">
                        <div className="text-[10px] font-black uppercase tracking-[0.22em] text-text-muted">
                          Change policy
                        </div>
                        <div className="mt-3 space-y-3 text-sm leading-6 text-text-muted">
                          <div className="flex items-start gap-3">
                            <Sparkles size={16} className="mt-0.5 shrink-0 text-primary" />
                            Every change requires a reason and is written to the audit log.
                          </div>
                          <div className="flex items-start gap-3">
                            <Shield size={16} className="mt-0.5 shrink-0 text-primary" />
                            The active quota value is what the runtime will use after you commit the override.
                          </div>
                          <div className="flex items-start gap-3">
                            <CloudUpload size={16} className="mt-0.5 shrink-0 text-primary" />
                            Use the sliders to make a quick intervention, then let the Control Tower track the result.
                          </div>
                        </div>
                      </div>
                    </section>
                  </div>
                ) : activeTab === "keys" ? (
                  <ApiKeyManager organization={org} workspaces={workspaces} focusKeyId={queryFocusType === "key" ? queryFocus : null} />
                ) : activeTab === "templates" ? (
                  <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                    <section className="rounded-[1.5rem] border border-border-main bg-canvas shadow-sm">
                      <div className="flex items-center justify-between border-b border-border-main px-5 py-4">
                        <div>
                          <div className="text-[10px] font-black uppercase tracking-[0.22em] text-text-muted">
                            Meta template manager
                          </div>
                          <div className="mt-1 text-lg font-semibold tracking-tight text-text-main">
                            {selectedPlatform} templates
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">
                          <CloudDownload size={14} />
                          Read-only directory
                        </div>
                      </div>

                      {templateLoading ? (
                        <div className="p-6 text-sm text-text-muted">Loading templates...</div>
                      ) : templateError ? (
                        <div className="p-6 text-sm text-rose-700">{templateError}</div>
                      ) : templates.length === 0 ? (
                        <div className="p-6 text-sm text-text-muted">No templates found for this organization and channel.</div>
                      ) : (
                        <div className="overflow-hidden">
                          <table className="w-full border-collapse text-left">
                            <thead className="bg-white text-[10px] font-black uppercase tracking-[0.22em] text-text-muted">
                              <tr>
                                <th className="px-5 py-4">Template</th>
                                <th className="px-5 py-4">Workspace</th>
                                <th className="px-5 py-4">State</th>
                                <th className="px-5 py-4 text-right">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border-main bg-surface">
                              {templates.map((template) => (
                                <tr
                                  key={template.id}
                                  className={`cursor-pointer transition hover:bg-primary-fade/40 ${
                                    selectedTemplateId === template.id ? "bg-primary-fade/50" : ""
                                  }`}
                                  onClick={() => setSelectedTemplateId(template.id)}
                                >
                                  <td className="px-5 py-4">
                                    <div className="flex flex-col">
                                      <div className="font-semibold text-text-main">{template.name}</div>
                                      <div className="mt-1 text-[10px] font-mono text-text-muted">
                                        {template.meta_template_name || template.meta_template_id || "Unlinked"}
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-5 py-4 text-sm text-text-main">
                                    <div className="flex flex-col">
                                      <span className="font-medium">{template.workspace_name || "No workspace"}</span>
                                      <span className="text-[10px] font-mono text-text-muted">{template.project_name || "No project"}</span>
                                    </div>
                                  </td>
                                  <td className="px-5 py-4">
                                    <TemplateStateChip template={template} />
                                  </td>
                                  <td className="px-5 py-4 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                      <Link
                                        href={`/templates/${template.id}`}
                                        className="inline-flex items-center gap-2 rounded-xl border border-border-main bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-text-main transition hover:border-primary/30 hover:bg-primary-fade hover:text-primary"
                                        onClick={(event) => event.stopPropagation()}
                                      >
                                        <ExternalLink size={12} />
                                        Open
                                      </Link>
                                      <button
                                        type="button"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          handleSyncTemplate(template).catch(console.error);
                                        }}
                                        disabled={syncingTemplateId === template.id}
                                        className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
                                      >
                                        {syncingTemplateId === template.id ? (
                                          <RefreshCcw size={12} className="animate-spin" />
                                        ) : (
                                          <CloudUpload size={12} />
                                        )}
                                        Sync
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </section>

                    <section className="space-y-4">
                      <div className="rounded-[1.5rem] border border-border-main bg-surface p-5 shadow-sm">
                        <div className="text-[10px] font-black uppercase tracking-[0.22em] text-text-muted">
                          Selected template
                        </div>
                        {selectedTemplate ? (
                          <>
                            <div className="mt-2 text-lg font-semibold tracking-tight text-text-main">
                              {selectedTemplate.name}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <TemplateStateChip template={selectedTemplate} />
                              <span className="rounded-full border border-border-main bg-canvas px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-text-muted">
                                {selectedTemplate.platform_type || selectedPlatform}
                              </span>
                            </div>
                            <div className="mt-4 rounded-[1.25rem] border border-border-main bg-canvas p-4">
                              <TemplatePreview template={selectedTemplate} />
                            </div>
                            <div className="mt-4 grid gap-3 text-sm text-text-muted">
                              <DetailLine label="Workspace" value={selectedTemplate.workspace_name || "n/a"} />
                              <DetailLine label="Project" value={selectedTemplate.project_name || "n/a"} />
                              <DetailLine label="Runtime readiness" value={selectedTemplate.runtime_readiness || "ready"} />
                              <DetailLine label="Meta template" value={selectedTemplate.meta_template_name || selectedTemplate.meta_template_id || "unlinked"} />
                            </div>
                          </>
                        ) : (
                          <div className="mt-4 rounded-xl border border-dashed border-border-main bg-canvas px-4 py-6 text-sm text-text-muted">
                            Select a template to inspect its preview and Meta linkage.
                          </div>
                        )}
                      </div>

                      <div className="rounded-[1.5rem] border border-border-main bg-canvas p-5 shadow-sm">
                        <div className="text-[10px] font-black uppercase tracking-[0.22em] text-text-muted">
                          Actions
                        </div>
                        <div className="mt-3 space-y-3 text-sm text-text-muted">
                          <div className="flex items-start gap-3">
                            <Workflow size={16} className="mt-0.5 shrink-0 text-primary" />
                            Templates stay workspace-scoped in runtime, while this view aggregates them org-wide for support and governance.
                          </div>
                          <div className="flex items-start gap-3">
                            <Sparkles size={16} className="mt-0.5 shrink-0 text-primary" />
                            Sync pushes the latest Meta status back into the same template record the workspace already uses.
                          </div>
                        </div>
                      </div>
                    </section>
                  </div>
                ) : activeTab === "breakdown" ? (
                  <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
                    <UsageBreakdown
                      breakdown={breakdown}
                      loading={breakdownLoading}
                      timeWindowLabel={
                        adminTimeWindow === "30 days"
                          ? "Billing Cycle"
                          : adminTimeWindow === "7 days"
                            ? "Last 7d"
                            : "Last 24h"
                      }
                    />

                    <section className="space-y-4">
                      <div className="rounded-[1.5rem] border border-border-main bg-canvas p-5 shadow-sm">
                        <div className="text-[10px] font-black uppercase tracking-[0.22em] text-text-muted">
                          Signal context
                        </div>
                        <div className="mt-3 space-y-3 text-sm leading-6 text-text-muted">
                          <div className="flex items-start gap-3">
                            <Sparkles size={16} className="mt-0.5 shrink-0 text-primary" />
                            Human traffic usually maps to operator behavior inside workspaces.
                          </div>
                          <div className="flex items-start gap-3">
                            <Shield size={16} className="mt-0.5 shrink-0 text-primary" />
                            Machine traffic is commonly driven by API keys or automation jobs.
                          </div>
                          <div className="flex items-start gap-3">
                            <Workflow size={16} className="mt-0.5 shrink-0 text-primary" />
                            Use this view to spot which workspace or credential is driving a load spike.
                          </div>
                        </div>
                      </div>

                      <div className="rounded-[1.5rem] border border-border-main bg-surface p-5 shadow-sm">
                        <div className="text-[10px] font-black uppercase tracking-[0.22em] text-text-muted">
                          Drill-down policy
                        </div>
                        <p className="mt-3 text-sm leading-6 text-text-muted">
                          If a credential row dominates the table, jump to the API Keys tab and rotate it. If a workspace row dominates, inspect that workspace’s runtime or template health before changing quotas.
                        </p>
                        {breakdownError ? (
                          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                            {breakdownError}
                          </div>
                        ) : null}
                      </div>
                    </section>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="rounded-[1.5rem] border border-border-main bg-canvas p-5 shadow-sm">
                      <div className="text-[10px] font-black uppercase tracking-[0.22em] text-text-muted">
                        Workspaces in this organization
                      </div>
                      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {workspaces.length === 0 ? (
                          <div className="rounded-xl border border-dashed border-border-main bg-surface px-4 py-5 text-sm text-text-muted">
                            No workspaces linked yet.
                          </div>
                        ) : (
                            workspaces.map((workspace) => (
                              <div
                                key={workspace.id}
                                id={`workspace-row-${workspace.id}`}
                                className={`rounded-[1.25rem] border p-4 shadow-sm transition ${
                                  queryFocusType === "workspace" && queryFocus === workspace.id
                                    ? "border-primary bg-primary-fade/40 ring-2 ring-primary/20"
                                    : "border-border-main bg-surface"
                                }`}
                              >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="font-semibold text-text-main">{workspace.name}</div>
                                  <div className="mt-1 text-[10px] font-mono text-text-muted">{workspace.id}</div>
                                </div>
                                <span className="rounded-full border border-border-main bg-canvas px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-text-muted">
                                  {workspace.status || "unknown"}
                                </span>
                              </div>
                              <div className="mt-3 text-xs text-text-muted">
                                Org-scoped workspaces remain the runtime boundary for flows, bots, and templates.
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : null}
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}

function MetricCard({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
  return (
    <div className="rounded-[1.25rem] border border-border-main bg-white/85 px-4 py-3 shadow-sm backdrop-blur">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[9px] font-black uppercase tracking-[0.22em] text-text-muted">{label}</div>
        <div className="rounded-lg border border-border-main bg-canvas p-1.5 text-text-muted">{icon}</div>
      </div>
      <div className="mt-3 text-2xl font-black tracking-tight text-text-main">{value}</div>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1rem] border border-border-main bg-white px-4 py-3">
      <div className="text-[9px] font-black uppercase tracking-[0.2em] text-text-muted">{label}</div>
      <div className="mt-1 text-sm font-semibold text-text-main">{value}</div>
    </div>
  );
}

function StatChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "emerald" | "amber" | "rose";
}) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-rose-200 bg-rose-50 text-rose-700";

  return (
    <div className={`rounded-[1rem] border px-4 py-3 ${toneClass}`}>
      <div className="text-[9px] font-black uppercase tracking-[0.2em] opacity-80">{label}</div>
      <div className="mt-1 text-xl font-black">{value}</div>
    </div>
  );
}

function TemplateStateChip({ template }: { template: OrganizationTemplate }) {
  const status = String(template.status || "").toLowerCase();
  const readiness = String(template.runtime_readiness || "").toLowerCase();
  const hasMeta = Boolean(template.meta_template_id || template.meta_template_name);

  if (status === "approved") {
    return <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-emerald-700">Approved</span>;
  }
  if (status === "rejected") {
    return <span className="inline-flex rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-rose-700">Rejected</span>;
  }
  if (status === "paused") {
    return <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-amber-700">Paused</span>;
  }
  if (readiness === "broken_meta_link") {
    return <span className="inline-flex rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-rose-700">Broken Meta link</span>;
  }
  if (readiness === "missing_runtime_asset") {
    return <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-amber-700">Missing asset</span>;
  }
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.18em] ${
      hasMeta
        ? "border border-sky-200 bg-sky-50 text-sky-700"
        : "border border-border-main bg-canvas text-text-muted"
    }`}>
      {hasMeta ? "Meta linked" : "Local"}
    </span>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[1rem] border border-border-main bg-white px-4 py-3">
      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">{label}</span>
      <span className="truncate text-sm font-semibold text-text-main">{value}</span>
    </div>
  );
}
