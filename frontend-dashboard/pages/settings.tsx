import { useEffect, useMemo, useState } from "react";
import {
  MessageSquareMore,
  ShieldCheck,
} from "lucide-react";

import PageAccessNotice from "../components/access/PageAccessNotice";
import DashboardLayout from "../components/layout/DashboardLayout";
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
import { workspaceService, type Workspace } from "../services/workspaceService";
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
  const {
    user,
    activeWorkspace: activeWorkspaceMembership,
    activeProject,
    hasWorkspacePermission,
  } = useAuthStore();
  const { canViewPage } = useVisibility();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [campaignDetail, setCampaignDetail] = useState<CampaignDetail | null>(null);
  const [form, setForm] = useState<SettingsForm>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<SettingsFieldErrors>({});
  const canViewSettingsPage = canViewPage("settings");

  useEffect(() => {
    if (!canViewSettingsPage) {
      setWorkspaces([]);
      setPlans([]);
      return;
    }
    Promise.all([workspaceService.list(), planService.list()])
      .then(([workspaceData, planData]) => {
        setWorkspaces(workspaceData);
        setPlans(planData);
      })
      .catch((err) => {
        console.error("Failed to load settings context", err);
      });
  }, [canViewSettingsPage]);

  const activeWorkspace = useMemo(
    () =>
      workspaces.find((workspace) => workspace.id === activeWorkspaceMembership?.workspace_id) ||
      workspaces[0] ||
      null,
    [activeWorkspaceMembership?.workspace_id, workspaces]
  );

  const activePlan = useMemo(
    () =>
      plans.find((plan) => plan.id === activeWorkspace?.plan_id) ||
      plans.find((plan) => plan.id === "starter") ||
      null,
    [activeWorkspace?.plan_id, plans]
  );

  const canManageSettings = activeWorkspace
    ? hasWorkspacePermission(activeWorkspace.id, "manage_workspace")
    : false;

  const settingsTabs = useMemo(
    () => [
      { label: "Workspace Settings", href: "/settings" },
      ...(activeProject?.id
        ? [{ label: "Project Settings", href: `/projects/${activeProject.id}/settings?from=settings` }]
        : []),
      ...(activeWorkspace?.id ? [{ label: "Billing", href: `/workspaces/${activeWorkspace.id}/billing` }] : []),
    ],
    [activeProject?.id, activeWorkspace?.id]
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
    if (!activeWorkspace?.id) {
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
      conversationSettingsService.get(activeWorkspace.id),
      canManageSettings ? workspaceMembershipService.list(activeWorkspace.id) : Promise.resolve([]),
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
              normalizeCampaignWorkspaceId(campaign) === activeWorkspace.id &&
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
  }, [activeWorkspace?.id, activeProject?.id, canManageSettings, canViewSettingsPage]);

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
    if (!activeWorkspace?.id) {
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
      const saved = await conversationSettingsService.update(activeWorkspace.id, {
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

  return (
    <DashboardLayout>
      {!canViewSettingsPage ? (
        <PageAccessNotice
          title="Workspace settings are restricted for this role"
          description="Workspace settings are only available to workspace admins inside the active workspace."
          href="/"
          ctaLabel="Open dashboard"
        />
      ) : (
      <div className="mx-auto max-w-6xl space-y-6">
        <WorkspaceStatusBanner workspace={activeWorkspace} />

        <section className="rounded-[1.25rem] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)]">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
            Settings
          </div>
          <h1 className="mt-2 text-[1.35rem] font-semibold tracking-tight text-[var(--text)]">
            Workspace and project controls
          </h1>
          <SectionTabs items={settingsTabs} currentPath="/settings" className="mt-4" />
        </section>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-[1.25rem] border border-[var(--line)] bg-[var(--surface)] px-5 py-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
              User
            </div>
            <div className="mt-2 text-sm font-semibold text-[var(--text)]">{user?.name || "Unnamed User"}</div>
            <div className="mt-1 text-xs text-[var(--muted)]">{user?.role || "user"}</div>
          </div>
          <div className="rounded-[1.25rem] border border-[var(--line)] bg-[var(--surface)] px-5 py-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
              Active Workspace
            </div>
            <div className="mt-2 text-sm font-semibold text-[var(--text)]">{activeWorkspace?.name || "Not linked"}</div>
            <div className="mt-1 text-xs text-[var(--muted)]">{activeWorkspace?.status || "n/a"}</div>
          </div>
          <div className="rounded-[1.25rem] border border-[var(--line)] bg-[var(--surface)] px-5 py-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
              Active Plan
            </div>
            <div className="mt-2 text-sm font-semibold text-[var(--text)]">{activePlan?.name || "Starter"}</div>
            <div className="mt-1 text-xs text-[var(--muted)]">INR {activePlan?.monthly_price_inr || 0}/mo</div>
          </div>
        </div>

        <section className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
                <MessageSquareMore size={16} />
                Workspace conversation settings
              </div>
            </div>
            <div className="rounded-full border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
              {canManageSettings ? "Editable" : "Read only"}
            </div>
          </div>

          {loading ? (
            <div className="mt-6 rounded-[1.25rem] border border-dashed border-[var(--line)] bg-[var(--surface-strong)] p-8 text-sm text-[var(--muted)]">
              Loading conversation settings...
            </div>
          ) : (
            <div className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-6">
                <div className="rounded-[1.25rem] border border-[var(--line)] bg-[var(--surface-strong)] p-5">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
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
                        className="flex items-center justify-between rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text)]"
                      >
                        <span>{label}</span>
                        <input
                          type="checkbox"
                          checked={Boolean(form[key as keyof SettingsForm])}
                          disabled={!canManageSettings}
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

                <div className="rounded-[1.25rem] border border-[var(--line)] bg-[var(--surface-strong)] p-5">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
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
                        className="flex items-center justify-between rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text)]"
                      >
                        <span>{label}</span>
                        <input
                          type="checkbox"
                          checked={Boolean(form[key as keyof SettingsForm])}
                          disabled={!canManageSettings}
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

                <div className="rounded-[1.25rem] border border-[var(--line)] bg-[var(--surface-strong)] p-5">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                    Routing Defaults
                  </div>
                  <div className="mt-4 grid gap-4">
                    <label className="block">
                      <span className="mb-2 block text-xs font-medium text-[var(--muted)]">Default agent</span>
                      <select
                        value={form.default_agent || ""}
                        disabled={!canManageSettings}
                        onChange={(event) =>
                          {
                            setFieldErrors((current) => ({ ...current, default_agent: undefined }));
                            setForm((current) => ({
                              ...current,
                              default_agent: event.target.value || null,
                            }));
                          }
                        }
                        className={`w-full rounded-2xl border bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text)] outline-none ${
                          fieldErrors.default_agent ? "border-red-300" : "border-[var(--line)]"
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
                        <span className="mt-2 block text-xs text-[var(--muted)]">
                          Default agent must be active inside this workspace.
                        </span>
                      )}
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-xs font-medium text-[var(--muted)]">Default campaign</span>
                      <select
                        value={form.default_campaign_id || ""}
                        disabled={!canManageSettings}
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
                        className={`w-full rounded-2xl border bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text)] outline-none ${
                          fieldErrors.default_campaign_id ? "border-red-300" : "border-[var(--line)]"
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
                        <span className="mt-2 block text-xs text-[var(--muted)]">
                          Only campaigns in the active workspace and project can be selected.
                        </span>
                      )}
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-xs font-medium text-[var(--muted)]">Default list</span>
                      <select
                        value={form.default_list_id || ""}
                        disabled={!canManageSettings || !form.default_campaign_id}
                        onChange={(event) =>
                          {
                            setFieldErrors((current) => ({ ...current, default_list_id: undefined }));
                            setForm((current) => ({
                              ...current,
                              default_list_id: event.target.value || null,
                            }));
                          }
                        }
                        className={`w-full rounded-2xl border bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text)] outline-none ${
                          fieldErrors.default_list_id ? "border-red-300" : "border-[var(--line)]"
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
                        <span className="mt-2 block text-xs text-[var(--muted)]">
                          Default list comes from the selected default campaign.
                        </span>
                      )}
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-xs font-medium text-[var(--muted)]">Max open chats per agent</span>
                      <input
                        type="number"
                        min={1}
                        max={500}
                        value={form.max_open_chats}
                        disabled={!canManageSettings}
                        onChange={(event) =>
                          {
                            setFieldErrors((current) => ({ ...current, max_open_chats: undefined }));
                            setForm((current) => ({
                              ...current,
                              max_open_chats: Number(event.target.value || 0),
                            }));
                          }
                        }
                        className={`w-full rounded-2xl border bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text)] outline-none ${
                          fieldErrors.max_open_chats ? "border-red-300" : "border-[var(--line)]"
                        }`}
                      />
                      {fieldErrors.max_open_chats ? (
                        <span className="mt-2 block text-xs text-red-600">{fieldErrors.max_open_chats}</span>
                      ) : (
                        <span className="mt-2 block text-xs text-[var(--muted)]">
                          Used by auto-assignment to prevent overloading a single agent.
                        </span>
                      )}
                    </label>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="rounded-[1.25rem] border border-[var(--line)] bg-[var(--surface-strong)] p-5">
                  <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                    <ShieldCheck size={14} />
                    Allowed Platforms
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {allowedPlatformsByPlan.map((platform) => (
                      <button
                        key={platform}
                        type="button"
                        disabled={!canManageSettings}
                        onClick={() => togglePlatform(platform)}
                        className={`rounded-2xl border px-4 py-3 text-left text-sm transition ${
                          form.allowed_platforms.includes(platform)
                            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                            : "border-[var(--line)] bg-[var(--surface)] text-[var(--text)]"
                        }`}
                      >
                        <div className="font-medium capitalize">{platform}</div>
                        <div className="mt-1 text-xs text-[var(--muted)]">
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
                  <div className="mt-4 text-xs leading-5 text-[var(--muted)]">
                    Plan limit: {allowedPlatformsByPlan.join(", ")}
                  </div>
                </div>

                <div className="rounded-[1.25rem] border border-[var(--line)] bg-[var(--surface-strong)] p-5">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                    Current Summary
                  </div>
                  <div className="mt-4 space-y-3 text-sm text-[var(--text)]">
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
                  disabled={!canManageSettings || saving || loading}
                  className="w-full rounded-2xl bg-slate-900 px-5 py-3 text-[11px] font-black uppercase tracking-[0.2em] text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {saving ? "Saving..." : "Save Conversation Settings"}
                </button>
              </div>
            </div>
          )}
        </section>

      </div>
      )}
    </DashboardLayout>
  );
}
