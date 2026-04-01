import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import {
  MessageSquareMore,
  ShieldCheck,
} from "lucide-react";

import PageAccessNotice from "../components/access/PageAccessNotice";
import DashboardLayout from "../components/layout/DashboardLayout";
import IntegrationsConsole from "../components/integrations/IntegrationsConsole";
import { useVisibility } from "../hooks/useVisibility";
import WorkspaceStatusBanner from "../components/workspace/WorkspaceStatusBanner";
import SectionTabs from "../components/navigation/SectionTabs";
import { campaignService, type CampaignDetail, type CampaignSummary } from "../services/campaignService";
import {
  conversationSettingsService,
  type ConversationSettings,
} from "../services/conversationSettingsService";
import { planService, type Plan } from "../services/planService";
import { workspaceMembershipService, type WorkspaceMember } from "../services/workspaceMembershipService";
import {
  workspaceService,
  type Workspace,
} from "../services/workspaceService";
import { useAuthStore } from "../store/authStore";
import { notify } from "../store/uiStore";

const DEFAULT_SETTINGS: Omit<ConversationSettings, "workspace_id"> = {
  auto_assign: false,
  default_agent: null,
  allow_manual_reply: true,
  allow_agent_takeover: true,
  allow_bot_resume: false,
  show_campaign: true,
  show_flow: true,
  show_list: true,
  max_open_chats: 25,
  allowed_platforms: [],
  default_campaign_id: null,
  default_list_id: null,
};

type SettingsForm = Omit<ConversationSettings, "workspace_id">;
type SettingsField =
  | "default_agent"
  | "default_campaign_id"
  | "default_list_id"
  | "allowed_platforms"
  | "max_open_chats";
type SettingsFieldErrors = Partial<Record<SettingsField, string>>;

function normalizeCampaignWorkspaceId(campaign: CampaignSummary) {
  return campaign.workspace_id || campaign.workspaceId || null;
}

function getBackendFieldError(message: string): SettingsFieldErrors {
  const normalized = message.toLowerCase();

  if (normalized.includes("default agent")) {
    return { default_agent: message };
  }
  if (normalized.includes("default campaign")) {
    return { default_campaign_id: message };
  }
  if (normalized.includes("default list")) {
    return { default_list_id: message };
  }
  if (normalized.includes("platforms not allowed") || normalized.includes("current plan")) {
    return { allowed_platforms: message };
  }
  if (normalized.includes("maxopenchats") || normalized.includes("max open chats")) {
    return { max_open_chats: message };
  }

  return {};
}

export default function SettingsPage() {
  const router = useRouter();
  const {
    user,
    activeWorkspace: activeWorkspaceMembership,
    activeProject,
    hasWorkspacePermission,
  } = useAuthStore();
  const { canViewPage, isPlatformOperator, isReadOnly } = useVisibility();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [campaignDetail, setCampaignDetail] = useState<CampaignDetail | null>(null);
  const [form, setForm] = useState<SettingsForm>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [supportRequestSubmitting, setSupportRequestSubmitting] = useState(false);
  const [supportRequestSent, setSupportRequestSent] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<SettingsFieldErrors>({});
  const [activeTab, setActiveTab] = useState<"general" | "integrations">("general");
  const canViewSettingsPage = canViewPage("settings");

  useEffect(() => {
    if (!canViewSettingsPage) {
      setWorkspaces([]);
      setPlans([]);
      return;
    }
    Promise.all([
      workspaceService.list(),
      isPlatformOperator ? planService.list() : Promise.resolve([]),
    ])
      .then(([workspaceData, planData]) => {
        setWorkspaces(workspaceData);
        setPlans(planData);
      })
      .catch((err) => {
        console.error("Failed to load settings context", err);
      });
  }, [canViewSettingsPage, isPlatformOperator]);

  const activeWorkspace = useMemo(
    () => {
      const selected =
        workspaces.find((workspace) => workspace.id === activeWorkspaceMembership?.workspace_id) || null;

      if (selected) {
        return selected;
      }

      if (isPlatformOperator) {
        return null;
      }

      return workspaces[0] || null;
    },
    [activeWorkspaceMembership?.workspace_id, isPlatformOperator, workspaces]
  );

  const activePlan = useMemo(
    () =>
      plans.find((plan) => plan.id === activeWorkspace?.plan_id) ||
      plans.find((plan) => plan.id === "starter") ||
      null,
    [activeWorkspace?.plan_id, plans]
  );
  const activeWorkspaceId = activeWorkspace?.id || null;
  const canOpenSettingsShell = Boolean(user);
  const canManageSettings = activeWorkspace
    ? hasWorkspacePermission(activeWorkspaceId, "manage_workspace")
    : false;
  const canEditWorkspaceSettings = canManageSettings && !isReadOnly;
  const isPlatformWithoutWorkspace = isPlatformOperator && !activeWorkspaceId;
  const canViewWorkspaceSettings =
    isPlatformOperator || canViewSettingsPage || canManageSettings;
  const canRequestPlatformSupport =
    Boolean(activeWorkspaceId) &&
    !isPlatformOperator &&
    canViewSettingsPage;
  const canViewIntegrationsTab =
    canManageSettings || canViewPage("integrations") || isPlatformOperator;

  useEffect(() => {
    if (router.query.tab === "integrations") {
      setActiveTab("integrations");
      return;
    }

    if (router.query.tab === "general") {
      setActiveTab("general");
    }
  }, [router.query.tab]);

  const settingsTabs = useMemo(
    () => [
      ...(!isPlatformWithoutWorkspace ? [{ label: "Workspace Settings", href: "/settings" }] : []),
      ...(!isPlatformWithoutWorkspace && activeProject?.id
        ? [{ label: "Project Settings", href: `/projects/${activeProject.id}/settings?from=settings` }]
        : []),
      ...(activeWorkspaceId ? [{ label: "Billing", href: `/workspaces/${activeWorkspaceId}/billing` }] : []),
    ],
    [activeProject?.id, activeWorkspaceId, isPlatformWithoutWorkspace]
  );

  useEffect(() => {
    if (!canViewSettingsPage) {
      setForm(DEFAULT_SETTINGS);
      setMembers([]);
      setCampaigns([]);
      setCampaignDetail(null);
      setFieldErrors({});
      setLoading(false);
      return;
    }
    if (!activeWorkspaceId) {
      setForm(DEFAULT_SETTINGS);
      setMembers([]);
      setCampaigns([]);
      setCampaignDetail(null);
      setFieldErrors({});
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");
    setFieldErrors({});

    Promise.all([
      conversationSettingsService.get(activeWorkspaceId),
      canManageSettings ? workspaceMembershipService.list(activeWorkspaceId) : Promise.resolve([]),
      campaignService.list(),
    ])
      .then(([settingsData, memberData, campaignData]) => {
        if (cancelled) {
          return;
        }

        setForm({
          auto_assign: settingsData.auto_assign,
          default_agent: settingsData.default_agent,
          allow_manual_reply: settingsData.allow_manual_reply,
          allow_agent_takeover: settingsData.allow_agent_takeover,
          allow_bot_resume: settingsData.allow_bot_resume,
          show_campaign: settingsData.show_campaign,
          show_flow: settingsData.show_flow,
          show_list: settingsData.show_list,
          max_open_chats: settingsData.max_open_chats,
          allowed_platforms: settingsData.allowed_platforms,
          default_campaign_id: settingsData.default_campaign_id,
          default_list_id: settingsData.default_list_id,
        });
        setMembers(memberData);
        setCampaigns(
          campaignData.filter(
            (campaign) =>
              normalizeCampaignWorkspaceId(campaign) === activeWorkspaceId &&
              (!activeProject?.id ||
                (campaign.project_id || campaign.projectId || null) === activeProject.id)
          )
        );
      })
      .catch((err: any) => {
        if (!cancelled) {
          console.error("Failed to load conversation settings", err);
          setError(err?.response?.data?.error || "Failed to load conversation settings");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeWorkspaceId, activeProject?.id, canManageSettings, canViewSettingsPage]);

  useEffect(() => {
    if (!form.default_campaign_id) {
      setCampaignDetail(null);
      return;
    }

    let cancelled = false;

    campaignService
      .get(form.default_campaign_id)
      .then((detail) => {
        if (!cancelled) {
          setCampaignDetail(detail);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("Failed to load campaign detail", err);
          setCampaignDetail(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [form.default_campaign_id]);

  const allowedPlatformsByPlan = useMemo(
    () => activePlan?.allowed_platforms || ["whatsapp", "website", "facebook", "instagram", "api", "telegram"],
    [activePlan]
  );

  const eligibleAgents = useMemo(
    () =>
      members.filter(
        (member) =>
          member.status === "active" &&
          ["workspace_admin", "agent"].includes(member.role)
      ),
    [members]
  );

  const selectedCampaignLists = useMemo(
    () => campaignDetail?.lists || [],
    [campaignDetail]
  );

  const validationSummary = useMemo(
    () => Object.values(fieldErrors).filter(Boolean),
    [fieldErrors]
  );

  const togglePlatform = (platform: string) => {
    setForm((current) => {
      const exists = current.allowed_platforms.includes(platform);
      return {
        ...current,
        allowed_platforms: exists
          ? current.allowed_platforms.filter((item) => item !== platform)
          : [...current.allowed_platforms, platform],
      };
    });
    setFieldErrors((current) => ({ ...current, allowed_platforms: undefined }));
  };

  const validateForm = () => {
    const nextErrors: SettingsFieldErrors = {};

    if (form.max_open_chats < 1 || form.max_open_chats > 500 || Number.isNaN(Number(form.max_open_chats))) {
      nextErrors.max_open_chats = "Max open chats must be between 1 and 500.";
    }

    if (form.default_agent && !eligibleAgents.some((member) => member.user_id === form.default_agent)) {
      nextErrors.default_agent = "Choose an active workspace admin or agent.";
    }

    if (
      form.default_campaign_id &&
      !campaigns.some((campaign) => campaign.id === form.default_campaign_id)
    ) {
      nextErrors.default_campaign_id = "Default campaign must belong to the active workspace and project.";
    }

    if (
      form.default_list_id &&
      !selectedCampaignLists.some((list: any) => list.id === form.default_list_id)
    ) {
      nextErrors.default_list_id = "Default list must belong to the selected default campaign.";
    }

    const disallowedPlatforms = form.allowed_platforms.filter(
      (platform) => !allowedPlatformsByPlan.includes(platform)
    );
    if (disallowedPlatforms.length > 0) {
      nextErrors.allowed_platforms = `These platforms are not allowed on the current plan: ${disallowedPlatforms.join(", ")}.`;
    }

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSave = async () => {
    if (!activeWorkspaceId || !canEditWorkspaceSettings) {
      return;
    }

    if (!validateForm()) {
      setError("Please fix the highlighted settings before saving.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      setFieldErrors({});
      const saved = await conversationSettingsService.update(activeWorkspaceId, {
        autoAssign: form.auto_assign,
        defaultAgent: form.default_agent,
        allowManualReply: form.allow_manual_reply,
        allowAgentTakeover: form.allow_agent_takeover,
        allowBotResume: form.allow_bot_resume,
        showCampaign: form.show_campaign,
        showFlow: form.show_flow,
        showList: form.show_list,
        maxOpenChats: Number(form.max_open_chats),
        allowedPlatforms: form.allowed_platforms,
        defaultCampaignId: form.default_campaign_id,
        defaultListId: form.default_list_id,
      });

      setForm({
        auto_assign: saved.auto_assign,
        default_agent: saved.default_agent,
        allow_manual_reply: saved.allow_manual_reply,
        allow_agent_takeover: saved.allow_agent_takeover,
        allow_bot_resume: saved.allow_bot_resume,
        show_campaign: saved.show_campaign,
        show_flow: saved.show_flow,
        show_list: saved.show_list,
        max_open_chats: saved.max_open_chats,
        allowed_platforms: saved.allowed_platforms,
        default_campaign_id: saved.default_campaign_id,
        default_list_id: saved.default_list_id,
      });
      setFieldErrors({});
      notify("Conversation settings saved.", "success");
    } catch (err: any) {
      console.error("Failed to save conversation settings", err);
      const message = err?.response?.data?.error || "Failed to save conversation settings";
      const mappedFieldErrors = getBackendFieldError(message);
      setFieldErrors(mappedFieldErrors);
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleRequestPlatformSupport = async () => {
    if (!activeWorkspaceId || !canRequestPlatformSupport || supportRequestSubmitting) {
      return;
    }

    try {
      setSupportRequestSubmitting(true);
      setError("");
      await workspaceService.createSupportRequest(activeWorkspaceId, {
        reason: "Request platform support from workspace settings",
      });
      setSupportRequestSent(true);
      notify("Support request sent to platform operators.", "success");
    } catch (err: any) {
      const message = err?.response?.data?.error || "Failed to request platform support";
      setError(message);
      notify(message, "error");
    } finally {
      setSupportRequestSubmitting(false);
    }
  };

  return (
    <DashboardLayout>
      {!canOpenSettingsShell ? (
        <PageAccessNotice
          title="Settings are restricted for this role"
          description="Sign in with a valid account to access workspace and account settings."
          href="/login"
          ctaLabel="Open login"
        />
      ) : (
      <div className="mx-auto max-w-6xl space-y-6">
        {activeWorkspace ? <WorkspaceStatusBanner workspace={activeWorkspace} /> : null}

        <section className="rounded-[1.25rem] border border-border-main bg-surface p-5 shadow-sm transition-all duration-300">
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("general")}
              className={`rounded-full border px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em] transition ${
                activeTab === "general"
                  ? "border-primary bg-primary-fade text-primary"
                  : "border-border-main bg-canvas text-text-muted"
              }`}
            >
              General
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("integrations")}
              disabled={!canViewIntegrationsTab}
              className={`rounded-full border px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em] transition disabled:cursor-not-allowed disabled:opacity-50 ${
                activeTab === "integrations"
                  ? "border-primary bg-primary-fade text-primary"
                  : "border-border-main bg-canvas text-text-muted"
              }`}
              >
              Integrations
            </button>
          </div>
          {activeTab === "general" && canViewWorkspaceSettings && settingsTabs.length > 0 ? (
            <SectionTabs items={settingsTabs} currentPath="/settings" className="mt-4" />
          ) : null}
        </section>

        {activeTab === "integrations" ? (
          canViewIntegrationsTab ? (
            <IntegrationsConsole />
          ) : (
            <PageAccessNotice
              title="Integrations are restricted for this role"
              description="Only workspace admins and project operators with integration access can open the integrations console."
              href="/settings"
              ctaLabel="Open settings"
            />
          )
        ) : (
          <>

        {isPlatformWithoutWorkspace ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-[1.25rem] border border-border-main bg-surface px-5 py-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                User
              </div>
              <div className="mt-2 text-sm font-semibold text-text-main">{user?.name || "Unnamed User"}</div>
              <div className="mt-1 text-xs text-text-muted">{user?.role || "user"}</div>
            </div>
            <div className="rounded-[1.25rem] border border-border-main bg-surface px-5 py-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                Scope
              </div>
              <div className="mt-2 text-sm font-semibold text-text-main">Platform only</div>
              <div className="mt-1 text-xs text-text-muted">
                No workspace is attached to this account session.
              </div>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-[1.25rem] border border-border-main bg-surface px-5 py-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                User
              </div>
              <div className="mt-2 text-sm font-semibold text-text-main">{user?.name || "Unnamed User"}</div>
              <div className="mt-1 text-xs text-text-muted">{user?.role || "user"}</div>
            </div>
            <div className="rounded-[1.25rem] border border-border-main bg-surface px-5 py-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                Active Workspace
              </div>
              <div className="mt-2 text-sm font-semibold text-text-main">{activeWorkspace?.name || "Not linked"}</div>
              <div className="mt-1 text-xs text-text-muted">{activeWorkspace?.status || "n/a"}</div>
            </div>
            <div className="rounded-[1.25rem] border border-border-main bg-surface px-5 py-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                Active Plan
              </div>
              <div className="mt-2 text-sm font-semibold text-text-main">{activePlan?.name || "Starter"}</div>
              <div className="mt-1 text-xs text-text-muted">INR {activePlan?.monthly_price_inr || 0}/mo</div>
            </div>
          </div>
        )}

        {canRequestPlatformSupport ? (
          <section className="rounded-[1.5rem] border border-amber-200 bg-amber-50 p-5 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-800">
                  Request Platform Support
                </div>
                <div className="mt-2 text-sm leading-6 text-amber-900">
                  Send a support request to platform operators. This will notify the super admin team and unlock support entry once it is acknowledged.
                </div>
              </div>
              <button
                type="button"
                onClick={handleRequestPlatformSupport}
                disabled={supportRequestSubmitting || supportRequestSent}
                className="rounded-[1rem] border border-amber-700 bg-amber-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition duration-200 hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {supportRequestSubmitting
                  ? "Sending..."
                  : supportRequestSent
                    ? "Support Requested"
                    : "Request Platform Support"}
              </button>
            </div>
          </section>
        ) : null}

        {!canViewWorkspaceSettings ? (
          <section className="rounded-[1.5rem] border border-dashed border-border-main bg-canvas p-8 text-sm text-text-muted shadow-sm">
            {!activeWorkspaceId
              ? "Basic account details are available above. Select a workspace to open workspace settings."
              : "Basic account details are available above. Workspace settings are only editable for workspace admins and platform operators."}
          </section>
        ) : null}

        {isPlatformWithoutWorkspace ? (
          <section className="rounded-[1.5rem] border border-border-main bg-surface p-6 shadow-sm">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
              Platform Account
            </div>
            <h2 className="mt-3 text-[1.35rem] font-semibold tracking-tight text-text-main">
              Platform account controls
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">
              This page stays platform-only for super admin and developer sessions. Workspace internals, plans, and routing controls are hidden until you explicitly enter a workspace management route.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <a
                href="/workspaces"
                className="rounded-2xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main transition hover:bg-surface hover:border-primary/30"
              >
                Manage Workspaces
              </a>
              <a
                href="/users-access/platform-users"
                className="rounded-2xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main transition hover:bg-surface hover:border-primary/30"
              >
                Manage Platform Users
              </a>
              <a
                href="/users-access/roles"
                className="rounded-2xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main transition hover:bg-surface hover:border-primary/30"
              >
                Manage Permissions
              </a>
            </div>
          </section>
        ) : null}

        {!isPlatformWithoutWorkspace ? (
        <section className="rounded-[1.5rem] border border-border-main bg-surface p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-text-main">
                <MessageSquareMore size={16} />
                Workspace conversation settings
              </div>
            </div>
            {canViewWorkspaceSettings ? (
              <div className="rounded-full border border-border-main bg-primary-fade px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                {canEditWorkspaceSettings ? "Editable" : "Read only"}
              </div>
            ) : null}
          </div>

          {!canViewWorkspaceSettings ? (
            <div className="mt-6 rounded-[1.25rem] border border-dashed border-border-main bg-canvas p-8 text-sm text-text-muted shadow-sm">
              Workspace conversation controls are not available for the current account scope.
            </div>
          ) : loading ? (
            <div className="mt-6 rounded-[1.25rem] border border-dashed border-border-main bg-canvas p-8 text-sm text-text-muted shadow-sm">
              Loading conversation settings...
            </div>
          ) : (
            <div className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-6">
                <div className="rounded-[1.25rem] border border-border-main bg-canvas p-5">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                    Automation
                  </div>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    {[
                      ["Auto assign", "auto_assign"],
                      ["Manual reply", "allow_manual_reply"],
                      ["Agent takeover", "allow_agent_takeover"],
                      ["Bot resume", "allow_bot_resume"],
                    ].map(([label, key]) => (
                      <label
                        key={key}
                        className="flex items-center justify-between rounded-2xl border border-border-main bg-surface px-4 py-3 text-sm text-text-main"
                      >
                        <span>{label}</span>
                        <input
                          type="checkbox"
                          checked={Boolean(form[key as keyof SettingsForm])}
                          disabled={!canEditWorkspaceSettings}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              [key]: event.target.checked,
                            }))
                          }
                        />
                      </label>
                    ))}
                  </div>
                </div>

                <div className="rounded-[1.25rem] border border-border-main bg-canvas p-5">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                    Visibility
                  </div>
                  <div className="mt-4 grid gap-4 sm:grid-cols-3">
                    {[
                      ["Show campaign", "show_campaign"],
                      ["Show flow", "show_flow"],
                      ["Show list", "show_list"],
                    ].map(([label, key]) => (
                      <label
                        key={key}
                        className="flex items-center justify-between rounded-2xl border border-border-main bg-surface px-4 py-3 text-sm text-text-main"
                      >
                        <span>{label}</span>
                        <input
                          type="checkbox"
                          checked={Boolean(form[key as keyof SettingsForm])}
                          disabled={!canEditWorkspaceSettings}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              [key]: event.target.checked,
                            }))
                          }
                        />
                      </label>
                    ))}
                  </div>
                </div>

                <div className="rounded-[1.25rem] border border-border-main bg-canvas p-5">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                    Routing Defaults
                  </div>
                  <div className="mt-4 grid gap-4">
                    <label className="block">
                      <span className="mb-2 block text-xs font-medium text-text-muted">Default agent</span>
                      <select
                        value={form.default_agent || ""}
                        disabled={!canEditWorkspaceSettings}
                        onChange={(event) =>
                          {
                            setFieldErrors((current) => ({ ...current, default_agent: undefined }));
                            setForm((current) => ({
                              ...current,
                              default_agent: event.target.value || null,
                            }));
                          }
                        }
                        className={`w-full rounded-2xl border bg-surface px-4 py-3 text-sm text-text-main outline-none ${
                          fieldErrors.default_agent ? "border-red-300" : "border-border-main"
                        }`}
                      >
                        <option value="">No default agent</option>
                        {eligibleAgents.map((member) => (
                          <option key={member.user_id} value={member.user_id}>
                            {member.name || member.email} ({member.role})
                          </option>
                        ))}
                      </select>
                      {fieldErrors.default_agent ? (
                        <span className="mt-2 block text-xs text-red-600">{fieldErrors.default_agent}</span>
                      ) : (
                        <span className="mt-2 block text-xs text-text-muted">
                          Default agent must be active inside this workspace.
                        </span>
                      )}
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-xs font-medium text-text-muted">Default campaign</span>
                      <select
                        value={form.default_campaign_id || ""}
                        disabled={!canEditWorkspaceSettings}
                        onChange={(event) =>
                          {
                            setFieldErrors((current) => ({
                              ...current,
                              default_campaign_id: undefined,
                              default_list_id: undefined,
                            }));
                            setForm((current) => ({
                              ...current,
                              default_campaign_id: event.target.value || null,
                              default_list_id: null,
                            }));
                          }
                        }
                        className={`w-full rounded-2xl border bg-surface px-4 py-3 text-sm text-text-main outline-none ${
                          fieldErrors.default_campaign_id ? "border-red-300" : "border-border-main"
                        }`}
                      >
                        <option value="">No default campaign</option>
                        {campaigns.map((campaign) => (
                          <option key={campaign.id} value={campaign.id}>
                            {campaign.name}
                          </option>
                        ))}
                      </select>
                      {fieldErrors.default_campaign_id ? (
                        <span className="mt-2 block text-xs text-red-600">{fieldErrors.default_campaign_id}</span>
                      ) : (
                        <span className="mt-2 block text-xs text-text-muted">
                          Only campaigns in the active workspace and project can be selected.
                        </span>
                      )}
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-xs font-medium text-text-muted">Default list</span>
                      <select
                        value={form.default_list_id || ""}
                        disabled={!canEditWorkspaceSettings || !form.default_campaign_id}
                        onChange={(event) =>
                          {
                            setFieldErrors((current) => ({ ...current, default_list_id: undefined }));
                            setForm((current) => ({
                              ...current,
                              default_list_id: event.target.value || null,
                            }));
                          }
                        }
                        className={`w-full rounded-2xl border bg-surface px-4 py-3 text-sm text-text-main outline-none ${
                          fieldErrors.default_list_id ? "border-red-300" : "border-border-main"
                        }`}
                      >
                        <option value="">No default list</option>
                        {selectedCampaignLists.map((list: any) => (
                          <option key={list.id} value={list.id}>
                            {list.name}
                          </option>
                        ))}
                      </select>
                      {fieldErrors.default_list_id ? (
                        <span className="mt-2 block text-xs text-red-600">{fieldErrors.default_list_id}</span>
                      ) : (
                        <span className="mt-2 block text-xs text-text-muted">
                          Default list comes from the selected default campaign.
                        </span>
                      )}
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-xs font-medium text-text-muted">Max open chats per agent</span>
                      <input
                        type="number"
                        min={1}
                        max={500}
                        value={form.max_open_chats}
                        disabled={!canEditWorkspaceSettings}
                        onChange={(event) =>
                          {
                            setFieldErrors((current) => ({ ...current, max_open_chats: undefined }));
                            setForm((current) => ({
                              ...current,
                              max_open_chats: Number(event.target.value || 0),
                            }));
                          }
                        }
                        className={`w-full rounded-2xl border bg-surface px-4 py-3 text-sm text-text-main outline-none ${
                          fieldErrors.max_open_chats ? "border-red-300" : "border-border-main"
                        }`}
                      />
                      {fieldErrors.max_open_chats ? (
                        <span className="mt-2 block text-xs text-red-600">{fieldErrors.max_open_chats}</span>
                      ) : (
                        <span className="mt-2 block text-xs text-text-muted">
                          Used by auto-assignment to prevent overloading a single agent.
                        </span>
                      )}
                    </label>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="rounded-[1.25rem] border border-border-main bg-canvas p-5">
                  <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                    <ShieldCheck size={14} />
                    Allowed Platforms
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {allowedPlatformsByPlan.map((platform) => (
                      <button
                        key={platform}
                        type="button"
                        disabled={!canEditWorkspaceSettings}
                        onClick={() => togglePlatform(platform)}
                        className={`rounded-2xl border px-4 py-3 text-left text-sm transition ${
                          form.allowed_platforms.includes(platform)
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-border-main bg-surface text-text-main"
                        }`}
                      >
                        <div className="font-medium capitalize">{platform}</div>
                        <div className="mt-1 text-xs text-text-muted">
                          {form.allowed_platforms.includes(platform) ? "Enabled" : "Disabled"}
                        </div>
                      </button>
                    ))}
                  </div>
                  {fieldErrors.allowed_platforms ? (
                    <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
                      {fieldErrors.allowed_platforms}
                    </div>
                  ) : null}
                  <div className="mt-4 text-xs leading-5 text-text-muted">
                    Plan limit: {allowedPlatformsByPlan.join(", ")}
                  </div>
                </div>

                <div className="rounded-[1.25rem] border border-border-main bg-canvas p-5">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                    Current Summary
                  </div>
                  <div className="mt-4 space-y-3 text-sm text-text-main">
                    <div>Auto assign: {form.auto_assign ? "On" : "Off"}</div>
                    <div>Manual reply: {form.allow_manual_reply ? "Allowed" : "Blocked"}</div>
                    <div>Agent takeover: {form.allow_agent_takeover ? "Allowed" : "Blocked"}</div>
                    <div>Bot resume: {form.allow_bot_resume ? "Allowed" : "Blocked"}</div>
                    <div>Default agent: {eligibleAgents.find((member) => member.user_id === form.default_agent)?.name || eligibleAgents.find((member) => member.user_id === form.default_agent)?.email || "None"}</div>
                    <div>Default campaign: {campaigns.find((campaign) => campaign.id === form.default_campaign_id)?.name || "None"}</div>
                    <div>Default list: {selectedCampaignLists.find((list: any) => list.id === form.default_list_id)?.name || "None"}</div>
                    <div>Max open chats: {form.max_open_chats}</div>
                  </div>
                </div>

                {error ? (
                  <div className="rounded-[1.25rem] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                    {error}
                  </div>
                ) : null}

                {validationSummary.length > 0 ? (
                  <div className="rounded-[1.25rem] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                    <div className="font-semibold">Please review these settings before saving:</div>
                    <div className="mt-2 space-y-1">
                      {validationSummary.map((message) => (
                        <div key={message}>- {message}</div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!canEditWorkspaceSettings || saving || loading}
                  className="w-full rounded-2xl bg-primary px-5 py-3 text-[11px] font-black uppercase tracking-[0.2em] text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:bg-canvas"
                >
                  {saving ? "Saving..." : "Save Conversation Settings"}
                </button>
              </div>
            </div>
          )}
        </section>
        ) : null}

          </>
        )}

      </div>
      )}
    </DashboardLayout>
  );
}

