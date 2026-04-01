import { useCallback, useEffect, useMemo, useState } from "react";
import { Globe2, KeyRound, Loader2, Mail, Pencil, Plus, Radio, Trash2, X } from "lucide-react";

import { useVisibility } from "../../hooks/useVisibility";
import WorkspaceStatusBanner from "../workspace/WorkspaceStatusBanner";
import { useAuthStore } from "../../store/authStore";
import { useBotStore } from "../../store/botStore";
import {
  PlatformAccount,
  platformAccountService,
} from "../../services/platformAccountService";
import apiClient from "../../services/apiClient";
import { botService } from "../../services/botService";
import { confirmAction, notify } from "../../store/uiStore";
import { projectService, type ProjectSummary } from "../../services/projectService";
import {
  workspaceService,
  type WorkspaceMailSettings,
  type WorkspaceMailTestResult,
} from "../../services/workspaceService";

const PLATFORMS = ["whatsapp", "email", "website", "facebook", "instagram", "api", "telegram"];

const EMPTY_FORM = {
  platformType: "whatsapp",
  name: "",
  accountId: "",
  phoneNumber: "",
  businessId: "",
  metaBusinessId: "",
  token: "",
  status: "active",
};

function getPlatformFieldCopy(platformType: string, editingId: string | null) {
  if (platformType === "whatsapp") {
    return {
      intro:
        "WhatsApp setup needs the phone number ID for sending, the WABA ID for template operations, an access token with WhatsApp permissions, and an optional Meta Business ID for admin reference.",
      accountLabel: "Phone Number ID",
      accountPlaceholder: "WhatsApp phone number ID",
      accountRequired: true,
      tokenLabel: "Access Token",
      tokenPlaceholder: editingId ? "Replace access token (optional)" : "Access token",
      tokenRequired: !editingId,
      phoneLabel: "Display Phone Number",
      phonePlaceholder: "Display phone number (optional)",
      businessLabel: "WABA ID",
      businessPlaceholder: "WhatsApp Business Account ID",
      metaBusinessLabel: "Meta Business ID",
      metaBusinessPlaceholder: "Meta business manager ID (optional)",
      showPhoneField: true,
      showBusinessField: true,
      showMetaBusinessField: true,
      businessRequired: true,
    };
  }

  if (platformType === "telegram") {
    return {
      intro:
        "Telegram mainly needs the bot token. You can add a bot username or chat identifier as a secondary reference.",
      accountLabel: "Bot Username / Chat ID",
      accountPlaceholder: "@bot_username or chat id (optional)",
      accountRequired: false,
      tokenLabel: "Bot Token",
      tokenPlaceholder: editingId ? "Replace bot token (optional)" : "Bot token",
      tokenRequired: !editingId,
      phoneLabel: "",
      phonePlaceholder: "",
      businessLabel: "",
      businessPlaceholder: "",
      metaBusinessLabel: "",
      metaBusinessPlaceholder: "",
      showPhoneField: false,
      showBusinessField: false,
      showMetaBusinessField: false,
      businessRequired: false,
    };
  }

  if (platformType === "instagram") {
    return {
      intro:
        "Instagram requires the Instagram business account ID and an access token. Add the business account reference first, then the token.",
      accountLabel: "Instagram Account ID",
      accountPlaceholder: "Instagram business account ID",
      accountRequired: true,
      tokenLabel: "Access Token",
      tokenPlaceholder: editingId ? "Replace access token (optional)" : "Access token",
      tokenRequired: !editingId,
      phoneLabel: "",
      phonePlaceholder: "",
      businessLabel: "Meta Business ID",
      businessPlaceholder: "Meta business ID (optional)",
      metaBusinessLabel: "",
      metaBusinessPlaceholder: "",
      showPhoneField: false,
      showBusinessField: true,
      showMetaBusinessField: false,
      businessRequired: false,
    };
  }

  if (platformType === "facebook") {
    return {
      intro:
        "Facebook Messenger requires the page ID and an access token. Keep the page identifier as the main account field.",
      accountLabel: "Page ID",
      accountPlaceholder: "Facebook page ID",
      accountRequired: true,
      tokenLabel: "Page Access Token",
      tokenPlaceholder: editingId ? "Replace page token (optional)" : "Page access token",
      tokenRequired: !editingId,
      phoneLabel: "",
      phonePlaceholder: "",
      businessLabel: "Meta Business ID",
      businessPlaceholder: "Meta business ID (optional)",
      metaBusinessLabel: "",
      metaBusinessPlaceholder: "",
      showPhoneField: false,
      showBusinessField: true,
      showMetaBusinessField: false,
      businessRequired: false,
    };
  }

  if (platformType === "website") {
    return {
      intro:
        "Website integrations usually need a channel name first. Add a site identifier or domain only if you use one for internal routing.",
      accountLabel: "Site / Widget ID",
      accountPlaceholder: "Domain, widget id, or internal key (optional)",
      accountRequired: false,
      tokenLabel: "Secret / Verify Token",
      tokenPlaceholder: editingId ? "Replace secret (optional)" : "Secret (optional)",
      tokenRequired: false,
      phoneLabel: "",
      phonePlaceholder: "",
      businessLabel: "",
      businessPlaceholder: "",
      metaBusinessLabel: "",
      metaBusinessPlaceholder: "",
      showPhoneField: false,
      showBusinessField: false,
      showMetaBusinessField: false,
      businessRequired: false,
    };
  }

  if (platformType === "api") {
    return {
      intro:
        "API integrations usually use an external account key and shared secret. Add those only if your external system requires them.",
      accountLabel: "External Account ID",
      accountPlaceholder: "External account or client ID (optional)",
      accountRequired: false,
      tokenLabel: "API Secret / Token",
      tokenPlaceholder: editingId ? "Replace API token (optional)" : "API token (optional)",
      tokenRequired: false,
      phoneLabel: "",
      phonePlaceholder: "",
      businessLabel: "",
      businessPlaceholder: "",
      metaBusinessLabel: "",
      metaBusinessPlaceholder: "",
      showPhoneField: false,
      showBusinessField: false,
      showMetaBusinessField: false,
      businessRequired: false,
    };
  }

  return {
    intro:
      "Add the main platform credentials first. Optional phone or business fields can be filled only if this platform uses them.",
    accountLabel: "Account / Page / External ID",
    accountPlaceholder: "Phone number / page id / account id",
    accountRequired: false,
    tokenLabel: "Token",
    tokenPlaceholder: editingId ? "Replace token (optional)" : "Token (optional)",
    tokenRequired: false,
    phoneLabel: "Phone Number",
    phonePlaceholder: "Phone number (optional)",
    businessLabel: "Business ID",
    businessPlaceholder: "Business id (optional)",
    metaBusinessLabel: "",
    metaBusinessPlaceholder: "",
    showPhoneField: true,
    showBusinessField: true,
    showMetaBusinessField: false,
    businessRequired: false,
  };
}

function getMetaBusinessId(account: PlatformAccount | null | undefined) {
  if (!account?.metadata || typeof account.metadata !== "object") {
    return "";
  }

  const value = (account.metadata as Record<string, unknown>).metaBusinessId;
  return typeof value === "string" ? value : "";
}

export default function IntegrationsConsole() {
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);
  const activeProject = useAuthStore((state) => state.activeProject);
  const user = useAuthStore((state) => state.user);
  const projectAccesses = useAuthStore((state) => state.projectAccesses);
  const setActiveProject = useAuthStore((state) => state.setActiveProject);
  const hasWorkspacePermission = useAuthStore((state) => state.hasWorkspacePermission);
  const getProjectRole = useAuthStore((state) => state.getProjectRole);
  const { canViewPage, canManageWorkspace, isPlatformOperator, isWorkspaceAdmin, isReadOnly } = useVisibility();
  const activeBotId = useBotStore((state) => state.activeBotId);

  const [accounts, setAccounts] = useState<PlatformAccount[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectBots, setProjectBots] = useState<Array<{ id: string; name: string; project_id?: string | null }>>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activePlatform, setActivePlatform] = useState("whatsapp");
  const [isMetaBusy, setIsMetaBusy] = useState(false);
  const [mailSettings, setMailSettings] = useState<WorkspaceMailSettings | null>(null);
  const [mailLoading, setMailLoading] = useState(false);
  const [mailSaving, setMailSaving] = useState(false);
  const [mailTesting, setMailTesting] = useState(false);
  const [mailError, setMailError] = useState("");
  const [mailTestResult, setMailTestResult] = useState<WorkspaceMailTestResult | null>(null);
  const [mailForm, setMailForm] = useState({
    smtpHost: "",
    smtpPort: "587",
    smtpUser: "",
    smtpFrom: "",
    smtpPass: "",
  });
  const metaSignupReady = false;
  const metaSignupHint =
    "Embedded signup is optional and disabled in this environment. Use the manual integration form below.";

  const activeWorkspaceId = activeWorkspace?.workspace_id || "";
  const selectedProjectRole = getProjectRole(selectedProjectId);
  const isEmailChannel = activePlatform === "email";
  const hasAnyProjectAdminInWorkspace = projectAccesses.some(
    (access) =>
      access.workspace_id === activeWorkspaceId &&
      access.status === "active" &&
      ["project_admin", "workspace_owner", "admin"].includes(access.role)
  );
  const canManageSelectedWorkspace = hasWorkspacePermission(
    activeWorkspaceId || undefined,
    "can_manage_platform_accounts"
  );
  const canViewSelectedWorkspaceIntegrations =
    hasWorkspacePermission(activeWorkspaceId || undefined, "view_platform_accounts") ||
    canManageSelectedWorkspace;
  const canManageSelectedProjectIntegrations =
    !isReadOnly && (isPlatformOperator || canManageWorkspace || isWorkspaceAdmin);
  const canViewIntegrationsPage =
    canViewPage("integrations") ||
    canViewSelectedWorkspaceIntegrations ||
    hasAnyProjectAdminInWorkspace;
  const canEditWorkspaceMailSettings = Boolean(mailSettings?.canEdit) && !isReadOnly;

  useEffect(() => {
    if (!canViewIntegrationsPage || !activeWorkspaceId) {
      setProjects([]);
      setSelectedProjectId("");
      return;
    }

    projectService
      .list(activeWorkspaceId)
      .then((rows) => {
        setProjects(rows);
        const nextProjectId =
          rows.find((project) => project.id === selectedProjectId)?.id ||
          activeProject?.id ||
          rows.find((project) => project.is_default)?.id ||
          rows[0]?.id ||
          "";
        setSelectedProjectId(nextProjectId);

        const nextProject = rows.find((project) => project.id === nextProjectId);
        if (nextProject) {
          setActiveProject({
            id: nextProject.id,
            workspace_id: nextProject.workspace_id,
            name: nextProject.name,
            status: nextProject.status,
            is_default: nextProject.is_default,
          });
        }
      })
      .catch((err) => {
        console.error("Failed to load projects", err);
        setProjects([]);
        setSelectedProjectId("");
      });
  }, [activeWorkspaceId, activeProject?.id, canViewIntegrationsPage, selectedProjectId, setActiveProject]);

  useEffect(() => {
    if (!activeWorkspaceId || !selectedProjectId) {
      setProjectBots([]);
      return;
    }

    botService
      .getBots({ workspaceId: activeWorkspaceId, projectId: selectedProjectId })
      .then((rows) => {
        setProjectBots(Array.isArray(rows) ? rows : []);
      })
      .catch((err) => {
        console.error("Failed to load project bots", err);
        setProjectBots([]);
      });
  }, [activeWorkspaceId, selectedProjectId]);

  const loadAccounts = useCallback(async (projectId: string) => {
    if (!activeWorkspaceId || !projectId) {
      setAccounts([]);
      return;
    }

    try {
      const data = await platformAccountService.list({
        workspaceId: activeWorkspaceId,
        projectId,
      });
      setAccounts(data);
    } catch (err) {
      console.error("Failed to load platform accounts", err);
      setAccounts([]);
    }
  }, [activeWorkspaceId]);

  useEffect(() => {
    if (!canViewIntegrationsPage) {
      setAccounts([]);
      return;
    }
    loadAccounts(selectedProjectId).catch(console.error);
  }, [canViewIntegrationsPage, loadAccounts, selectedProjectId]);

  useEffect(() => {
    if (!activeWorkspaceId || !canViewIntegrationsPage) {
      setMailSettings(null);
      setMailLoading(false);
      setMailError("");
      setMailTestResult(null);
      setMailForm({
        smtpHost: "",
        smtpPort: "587",
        smtpUser: "",
        smtpFrom: "",
        smtpPass: "",
      });
      return;
    }

    let cancelled = false;
    setMailLoading(true);
    setMailError("");
    setMailTestResult(null);

    workspaceService
      .getMailSettings(activeWorkspaceId)
      .then((data) => {
        if (cancelled) {
          return;
        }

        setMailSettings(data);
        setMailForm({
          smtpHost: data.smtpHost || "",
          smtpPort: String(data.smtpPort || 587),
          smtpUser: data.smtpUser || "",
          smtpFrom: data.smtpFrom || "",
          smtpPass: "",
        });
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("Failed to load workspace mail settings", err);
          setMailSettings(null);
          setMailError(err?.response?.data?.error || "Failed to load workspace mail settings");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setMailLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeWorkspaceId, canViewIntegrationsPage]);

  const filteredAccounts = useMemo(
    () => accounts.filter((account) => account.platform_type === activePlatform),
    [accounts, activePlatform]
  );
  const reconnectRequiredAccounts = useMemo(
    () =>
      accounts.filter((account) => {
        const metadata =
          account.metadata && typeof account.metadata === "object"
            ? (account.metadata as Record<string, unknown>)
            : {};
        return (
          String(account.status || "").toLowerCase() === "inactive" &&
          String(metadata.softDeleteRevocationReason || "") === "workspace_scheduled_for_deletion"
        );
      }),
    [accounts]
  );
  const selectedBotId =
    (activeBotId &&
    projectBots.some(
      (bot) =>
        String(bot.id || "") === String(activeBotId) &&
        String(bot.project_id || "") === String(selectedProjectId)
    )
      ? activeBotId
      : projectBots[0]?.id) || null;
  const platformStyles: Record<string, any> = {
    whatsapp: {
      active: "bg-emerald-700 text-white shadow-sm",
      badge: "bg-emerald-100 text-emerald-900",
      card: "bg-gradient-to-br from-emerald-50 via-white to-emerald-50",
    },
    telegram: {
      active: "bg-sky-700 text-white shadow-sm",
      badge: "bg-sky-100 text-sky-900",
      card: "bg-gradient-to-br from-sky-50 via-white to-sky-50",
    },
    facebook: {
      active: "bg-blue-700 text-white shadow-sm",
      badge: "bg-blue-100 text-blue-900",
      card: "bg-gradient-to-br from-blue-50 via-white to-blue-50",
    },
    instagram: {
      active: "bg-pink-700 text-white shadow-sm",
      badge: "bg-pink-100 text-pink-900",
      card: "bg-gradient-to-br from-pink-50 via-white to-pink-50",
    },
    email: {
      active: "bg-violet-700 text-white shadow-sm",
      badge: "bg-violet-100 text-violet-900",
      card: "bg-gradient-to-br from-violet-50 via-white to-violet-50",
    },
    sms: {
      active: "bg-indigo-700 text-white shadow-sm",
      badge: "bg-indigo-100 text-indigo-900",
      card: "bg-gradient-to-br from-indigo-50 via-white to-indigo-50",
    },
    website: {
      active: "bg-primary text-white shadow-sm",
      badge: "bg-canvas text-text-main",
      card: "bg-gradient-to-br from-slate-50 via-white to-slate-50",
    },
  };
  const activePlatformClass = platformStyles[activePlatform]?.active ?? "bg-primary text-white shadow-sm";
  const platformBadgeClass = (platformType: string) =>
    platformStyles[platformType]?.badge ?? "bg-canvas text-text-main";
  const platformCardClass = (platformType: string) =>
    platformStyles[platformType]?.card ?? "bg-gradient-to-br from-slate-50 via-white to-slate-50";
  const canUseMetaSignup =
    canManageSelectedProjectIntegrations &&
    ["whatsapp", "facebook", "instagram"].includes(activePlatform) &&
    Boolean(selectedBotId) &&
    metaSignupReady !== false;

  const resetForm = () => {
    setEditingId(null);
    setError("");
    setForm({
      ...EMPTY_FORM,
      platformType: activePlatform,
    });
  };

  useEffect(() => {
    if (editingId) {
      return;
    }

    setForm((prev) => ({
      ...prev,
      platformType: activePlatform,
    }));
  }, [activePlatform, editingId]);

  const handleSave = async () => {
    if (!activeWorkspaceId || !selectedProjectId) {
      setError("Select a project before adding integrations.");
      return;
    }

    if (!form.name.trim()) {
      setError("Integration name is required");
      return;
    }

    if (form.platformType === "whatsapp" && !form.accountId.trim()) {
      setError("WhatsApp phone number ID is required");
      return;
    }

    if (form.platformType === "whatsapp" && !editingId && !form.token.trim()) {
      setError("WhatsApp access token is required");
      return;
    }

    if (form.platformType === "whatsapp" && !form.businessId.trim()) {
      setError("WhatsApp business account ID is required");
      return;
    }

    if (form.platformType === "telegram" && !editingId && !form.token.trim()) {
      setError("Telegram bot token is required");
      return;
    }

    if (form.platformType === "instagram" && !form.accountId.trim()) {
      setError("Instagram account ID is required");
      return;
    }

    if (form.platformType === "instagram" && !editingId && !form.token.trim()) {
      setError("Instagram access token is required");
      return;
    }

    if (form.platformType === "facebook" && !form.accountId.trim()) {
      setError("Facebook page ID is required");
      return;
    }

    if (form.platformType === "facebook" && !editingId && !form.token.trim()) {
      setError("Facebook page access token is required");
      return;
    }

    try {
      setError("");
      const payload = {
        platformType: form.platformType,
        workspaceId: activeWorkspaceId,
        projectId: selectedProjectId,
        name: form.name,
        accountId: form.accountId || undefined,
        phoneNumber: form.phoneNumber || undefined,
        businessId: form.businessId || undefined,
        token: form.token || undefined,
        status: form.status,
        metadata:
          form.platformType === "whatsapp"
            ? { metaBusinessId: form.metaBusinessId.trim() || null }
            : undefined,
      };

      if (editingId) {
        await platformAccountService.update(editingId, payload);
      } else {
        await platformAccountService.create(payload);
      }

      resetForm();
      await loadAccounts(selectedProjectId);
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to save integration");
    }
  };

  const startEdit = (account: PlatformAccount) => {
    setEditingId(account.id);
    setError("");
    setActivePlatform(account.platform_type);
    setForm({
      platformType: account.platform_type,
      name: account.name || "",
      accountId: account.account_id || "",
      phoneNumber: account.phone_number || "",
      businessId: account.business_id || "",
      metaBusinessId: getMetaBusinessId(account),
      token: "",
      status: account.status || "active",
    });
  };

  const handleDelete = async (id: string) => {
    if (
      !(await confirmAction(
        "Delete integration",
        "This removes the selected project integration channel.",
        "Delete"
      ))
    ) {
      return;
    }

    try {
      await platformAccountService.delete(id);
      if (editingId === id) {
        resetForm();
      }
      await loadAccounts(selectedProjectId);
    } catch (err) {
      console.error("Failed to delete platform account", err);
    }
  };

  const handleStartMetaConnect = async () => {
    if (!selectedBotId) {
      setError("Select a project with at least one bot before connecting Meta.");
      return;
    }

    if (metaSignupReady === false) {
      setError(
        "Embedded signup is not configured here. Add the WhatsApp integration manually using the form below."
      );
      return;
    }

    try {
      setIsMetaBusy(true);
      setError("");
      const redirectUri =
        typeof window !== "undefined"
          ? `${window.location.origin}/settings?tab=integrations`
          : undefined;
      const response = await apiClient.post("/integrations/meta/signup-session", {
        botId: selectedBotId,
        platform: activePlatform,
        redirectUri,
      });
      const signupUrl = String(response?.data?.signupUrl || "").trim();
      if (!signupUrl) {
        throw new Error("Meta signup session did not return a signup URL.");
      }
      window.location.href = signupUrl;
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || "Failed to start Meta signup.");
    } finally {
      setIsMetaBusy(false);
    }
  };

  useEffect(() => {
    if (!selectedProjectId || !selectedBotId || typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    if (!code || !state) {
      return;
    }

    let cancelled = false;

    const completeSignup = async () => {
      try {
        setIsMetaBusy(true);
        await apiClient.post("/integrations/meta/complete", {
          code,
          state,
          platform: activePlatform,
          accountId: form.accountId || undefined,
          phoneNumberId: form.platformType === "whatsapp" ? form.accountId || undefined : undefined,
          businessId: form.businessId || undefined,
          metaBusinessId: form.metaBusinessId || undefined,
          name: form.name || undefined,
        });
        if (!cancelled) {
          notify("Meta integration connected.", "success");
          await loadAccounts(selectedProjectId);
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.response?.data?.error || "Failed to complete Meta signup.");
        }
      } finally {
        if (!cancelled) {
          setIsMetaBusy(false);
        }
      }
    };

    completeSignup().catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [
    activePlatform,
    form.accountId,
    form.businessId,
    form.metaBusinessId,
    form.name,
    form.platformType,
    loadAccounts,
    selectedBotId,
    selectedProjectId,
  ]);

  const selectedProject =
    projects.find((project) => project.id === selectedProjectId) || null;
  const platformFieldCopy = getPlatformFieldCopy(form.platformType, editingId);

  const handleMailSave = async () => {
    if (!activeWorkspaceId || !canEditWorkspaceMailSettings) {
      return;
    }

    try {
      setMailSaving(true);
      setMailError("");
      setMailTestResult(null);
      const saved = await workspaceService.updateMailSettings(activeWorkspaceId, {
        smtpHost: mailForm.smtpHost,
        smtpPort: Number(mailForm.smtpPort || 587),
        smtpUser: mailForm.smtpUser,
        smtpFrom: mailForm.smtpFrom,
        smtpPass: mailForm.smtpPass,
      });
      setMailSettings(saved);
      setMailForm({
        smtpHost: saved.smtpHost || "",
        smtpPort: String(saved.smtpPort || 587),
        smtpUser: saved.smtpUser || "",
        smtpFrom: saved.smtpFrom || "",
        smtpPass: "",
      });
      notify(
        saved.workspaceMailConfigured
          ? "Workspace mail configuration saved."
          : "Saved workspace mail settings. System default will be used until all SMTP fields are filled.",
        "success"
      );
    } catch (err: any) {
      const message = err?.response?.data?.error || "Failed to save workspace mail settings";
      setMailError(message);
      notify(message, "error");
    } finally {
      setMailSaving(false);
    }
  };

  const handleMailTest = async () => {
    if (!activeWorkspaceId || !canEditWorkspaceMailSettings || mailTesting) {
      return;
    }

    const recipientEmail = String(user?.email || "").trim();
    if (!recipientEmail) {
      const message = "No user email is available for the test connection.";
      setMailError(message);
      notify(message, "error");
      return;
    }

    try {
      setMailTesting(true);
      setMailError("");
      setMailTestResult(null);
      const result = await workspaceService.testMailSettings(activeWorkspaceId, {
        smtpHost: mailForm.smtpHost,
        smtpPort: Number(mailForm.smtpPort || 587),
        smtpUser: mailForm.smtpUser,
        smtpPass: mailForm.smtpPass,
        smtpFrom: mailForm.smtpFrom,
        recipientEmail,
      });
      setMailTestResult(result);
      notify(
        {
          title: "SMTP test successful",
          message: result.detail,
          details: [recipientEmail],
        },
        "success"
      );
    } catch (err: any) {
      const message =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        "Failed to test SMTP connection";
      setMailError(message);
      setMailTestResult(null);
      notify(
        {
          title: "SMTP test failed",
          message,
        },
        "error"
      );
    } finally {
      setMailTesting(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <WorkspaceStatusBanner workspace={activeWorkspace} />
          {reconnectRequiredAccounts.length ? (
            <section className="rounded-[1.35rem] border border-amber-200 bg-amber-50 p-5 shadow-sm">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                    Reconnect Required
                  </div>
                  <div className="mt-2 text-base font-semibold tracking-tight text-amber-950">
                    {reconnectRequiredAccounts.length} integration
                    {reconnectRequiredAccounts.length === 1 ? "" : "s"} still need fresh credentials.
                  </div>
                  <div className="mt-1 text-sm leading-6 text-amber-800">
                    This workspace was previously scheduled for deletion, so stored provider tokens were revoked and cleared. Reconnect each affected channel before sending or receiving live traffic again.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActivePlatform(String(reconnectRequiredAccounts[0]?.platform_type || "whatsapp"))}
                  className="rounded-xl border border-amber-300 bg-surface px-4 py-2 text-sm font-medium text-amber-900 transition hover:bg-amber-100"
                >
                  Review affected channels
                </button>
              </div>
            </section>
          ) : null}
          <section className="rounded-[1.35rem] border border-border-main bg-surface p-5 shadow-sm">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0 flex items-center gap-3 text-sm text-text-muted">
                <Radio size={16} className="text-primary" />
                <span>{accounts.length} channels connected in the selected project.</span>
              </div>

              <div className="grid gap-3 sm:grid-cols-[minmax(220px,280px)_auto] xl:min-w-[520px]">
                <select
                  className="w-full rounded-xl border border-border-main bg-surface px-4 py-3 text-sm outline-none"
                  value={selectedProjectId}
                  onChange={(event) => {
                    const nextProjectId = event.target.value;
                    setSelectedProjectId(nextProjectId);
                    const nextProject = projects.find((project) => project.id === nextProjectId);
                    if (nextProject) {
                      setActiveProject({
                        id: nextProject.id,
                        workspace_id: nextProject.workspace_id,
                        name: nextProject.name,
                        status: nextProject.status,
                        is_default: nextProject.is_default,
                      });
                    }
                  }}
                >
                  <option value="">Select project</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>

                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border-main bg-canvas px-3 py-2">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                    {selectedProject?.name || "No project"}
                  </span>
                  <span className="rounded-full bg-primary px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white">
                    {accounts.length} visible
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {PLATFORMS.map((platform) => (
                <button
                  key={platform}
                  onClick={() => setActivePlatform(platform)}
                  className={`rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] transition ${
                    activePlatform === platform
                      ? activePlatformClass
                      : "border border-border-main bg-surface text-text-muted hover:border-border-main"
                  }`}
                >
                  {platform}
                </button>
              ))}
            </div>
          </section>

          {!activeWorkspaceId || !selectedProjectId ? (
            <div className="rounded-[1.5rem] border border-dashed border-border-main bg-canvas p-12 text-center shadow-sm">
              <div className="text-lg font-semibold tracking-tight text-text-main">
                Select a workspace project first
              </div>
              <div className="mt-2 text-sm leading-6 text-text-muted">
                Integrations now belong to projects, so this page stays empty until a project is selected.
              </div>
            </div>
          ) : (
            <div className="grid gap-5 xl:grid-cols-[290px_minmax(0,1fr)]">
              <section className="rounded-[1.35rem] border border-border-main bg-surface p-4 shadow-sm">
                <div className="mb-5 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-white">
                    {isEmailChannel ? <Mail size={18} /> : <KeyRound size={18} />}
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                      {isEmailChannel ? "Mail Configuration" : "Integration Editor"}
                    </div>
                    <div className="text-base font-semibold tracking-tight text-text-main">
                      {isEmailChannel
                        ? "Configure workspace email delivery"
                        : canManageSelectedProjectIntegrations
                          ? editingId
                            ? "Update project integration"
                            : "Connect a project integration"
                          : "Project integrations are read only"}
                    </div>
                    <div className="mt-1 text-xs text-text-muted">
                      {isEmailChannel
                        ? "Manage SMTP credentials for transactional mail"
                        : editingId
                          ? `Editing ${form.platformType} integration`
                          : `Adding ${activePlatform} integration`}
                    </div>
                  </div>
                </div>

                <div className="space-y-3 rounded-[1.1rem] border border-border-main bg-canvas p-3">
                  <div className="rounded-xl border border-border-main bg-surface px-3 py-3 text-xs text-text-muted">
                    <div className="truncate">
                      Workspace: <strong>{activeWorkspace?.workspace_name || activeWorkspaceId}</strong>
                    </div>
                    <div className="mt-1 truncate">
                      Project: <strong>{selectedProject?.name || selectedProjectId}</strong>
                    </div>
                  </div>
                  {canManageSelectedProjectIntegrations ? (
                    activePlatform === "email" ? (
                      mailLoading ? (
                        <div className="rounded-xl border border-dashed border-border-main bg-canvas px-3 py-3 text-sm text-text-muted">
                          Loading mail configuration...
                        </div>
                      ) : (
                      <div className="space-y-3">
                        <div className="rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-3 text-xs leading-5 text-text-muted">
                          Customer-facing email can use workspace SMTP credentials when the plan allows it. Otherwise the system default sender is used.
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <label className="block">
                            <span className="mb-2 block text-xs font-medium text-text-muted">SMTP Host</span>
                            <input
                              type="text"
                              value={mailForm.smtpHost}
                              onChange={(event) =>
                                setMailForm((current) => ({
                                  ...current,
                                  smtpHost: event.target.value,
                                }))
                              }
                              placeholder="smtp.example.com"
                              className="w-full rounded-2xl border border-border-main bg-surface px-3 py-2.5 text-sm text-text-main outline-none"
                            />
                          </label>
                          <label className="block">
                            <span className="mb-2 block text-xs font-medium text-text-muted">SMTP Port</span>
                            <input
                              type="number"
                              min={1}
                              max={65535}
                              value={mailForm.smtpPort}
                              onChange={(event) =>
                                setMailForm((current) => ({
                                  ...current,
                                  smtpPort: event.target.value,
                                }))
                              }
                              placeholder="587"
                              className="w-full rounded-2xl border border-border-main bg-surface px-3 py-2.5 text-sm text-text-main outline-none"
                            />
                          </label>
                          <label className="block">
                            <span className="mb-2 block text-xs font-medium text-text-muted">SMTP User</span>
                            <input
                              type="text"
                              value={mailForm.smtpUser}
                              onChange={(event) =>
                                setMailForm((current) => ({
                                  ...current,
                                  smtpUser: event.target.value,
                                }))
                              }
                              placeholder="user@example.com"
                              className="w-full rounded-2xl border border-border-main bg-surface px-3 py-2.5 text-sm text-text-main outline-none"
                            />
                          </label>
                          <label className="block">
                            <span className="mb-2 block text-xs font-medium text-text-muted">SMTP From</span>
                            <input
                              type="text"
                              value={mailForm.smtpFrom}
                              onChange={(event) =>
                                setMailForm((current) => ({
                                  ...current,
                                  smtpFrom: event.target.value,
                                }))
                              }
                              placeholder="noreply@example.com"
                              className="w-full rounded-2xl border border-border-main bg-surface px-3 py-2.5 text-sm text-text-main outline-none"
                            />
                          </label>
                          <label className="block md:col-span-2">
                            <span className="mb-2 block text-xs font-medium text-text-muted">SMTP Password</span>
                            <input
                              type="password"
                              value={mailForm.smtpPass}
                              onChange={(event) =>
                                setMailForm((current) => ({
                                  ...current,
                                  smtpPass: event.target.value,
                                }))
                              }
                              placeholder="••••••••"
                              className="w-full rounded-2xl border border-border-main bg-surface px-3 py-2.5 text-sm text-text-main outline-none"
                            />
                          </label>
                        </div>
                        <div className="rounded-xl border border-dashed border-border-main bg-canvas px-3 py-2.5 text-xs leading-5 text-text-muted">
                          Leave the password blank to keep the stored credential. If any SMTP field is incomplete, the platform keeps using the system default sender.
                        </div>
                        {mailSettings?.restrictionMessage && !canEditWorkspaceMailSettings ? (
                          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm font-medium text-amber-900">
                            {mailSettings.restrictionMessage}
                          </div>
                        ) : null}
                        {mailError ? (
                          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                            {mailError}
                          </div>
                        ) : null}
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={handleMailSave}
                            disabled={!canEditWorkspaceMailSettings || mailSaving}
                            className="rounded-full bg-primary px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em] text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {mailSaving ? "Saving..." : "Save Mail Configuration"}
                          </button>
                          <button
                            type="button"
                            onClick={handleMailTest}
                            disabled={!canEditWorkspaceMailSettings || mailTesting}
                            className="inline-flex items-center gap-2 rounded-full border border-border-main bg-canvas px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em] text-text-main transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {mailTesting ? <Loader2 size={14} className="animate-spin" /> : null}
                            {mailTesting ? "Testing..." : "Test Connection"}
                          </button>
                        </div>
                        <div className="rounded-xl border border-border-main bg-canvas px-3 py-2.5 text-xs leading-5 text-text-muted">
                          <div>Sender source: {mailSettings?.source === "workspace" ? "workspace SMTP" : "system default"}</div>
                          <div>SMTP host: {mailSettings?.smtpHost || "Not configured"}</div>
                          <div>SMTP user: {mailSettings?.smtpUser || "Not configured"}</div>
                          <div>SMTP from: {mailSettings?.smtpFrom || "Not configured"}</div>
                          <div>Password: {mailSettings?.smtpPassConfigured ? "Configured" : "Missing"}</div>
                        </div>
                        {mailTestResult ? (
                          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
                            {mailTestResult.detail}
                          </div>
                        ) : null}
                      </div>
                      )
                    ) : (
                      <>
                        <div className="rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-3 text-xs leading-5 text-text-muted">
                          {platformFieldCopy.intro}
                        </div>
                        <div className="rounded-xl border border-border-main bg-surface px-3 py-2.5 text-sm text-text-muted">
                          Platform: <strong className="uppercase">{form.platformType}</strong>
                        </div>
                        {["whatsapp", "facebook", "instagram"].includes(form.platformType) ? (
                          <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-3 text-xs leading-5 text-text-muted">
                            Meta connect can bootstrap this integration from OAuth instead of manual token copy-paste.
                          </div>
                        ) : null}
                        <input
                          className="w-full rounded-xl border border-border-main bg-surface px-3 py-2.5 text-sm outline-none transition focus:border-teal-400"
                          placeholder="Integration name"
                          value={form.name}
                          onChange={(event) =>
                            setForm((prev) => ({ ...prev, name: event.target.value }))
                          }
                        />
                        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                          {platformFieldCopy.accountLabel}
                          {platformFieldCopy.accountRequired ? " *" : ""}
                        </div>
                        <input
                          className="w-full rounded-xl border border-border-main bg-surface px-3 py-2.5 text-sm outline-none transition focus:border-teal-400"
                          placeholder={platformFieldCopy.accountPlaceholder}
                          value={form.accountId}
                          onChange={(event) =>
                            setForm((prev) => ({ ...prev, accountId: event.target.value }))
                          }
                        />
                        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                          {platformFieldCopy.tokenLabel}
                          {platformFieldCopy.tokenRequired ? " *" : ""}
                        </div>
                        <input
                          type="password"
                          className="w-full rounded-xl border border-border-main bg-surface px-3 py-2.5 text-sm outline-none transition focus:border-teal-400"
                          placeholder={platformFieldCopy.tokenPlaceholder}
                          value={form.token}
                          onChange={(event) =>
                            setForm((prev) => ({ ...prev, token: event.target.value }))
                          }
                        />
                        {platformFieldCopy.showPhoneField ? (
                          <>
                            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                              {platformFieldCopy.phoneLabel || "Phone Number"}
                            </div>
                            <input
                              className="w-full rounded-xl border border-border-main bg-surface px-3 py-2.5 text-sm outline-none transition focus:border-teal-400"
                              placeholder={platformFieldCopy.phonePlaceholder}
                              value={form.phoneNumber}
                              onChange={(event) =>
                                setForm((prev) => ({ ...prev, phoneNumber: event.target.value }))
                              }
                            />
                          </>
                        ) : null}
                        {platformFieldCopy.showBusinessField ? (
                          <>
                            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                              {platformFieldCopy.businessLabel || "Business Account ID"}
                              {platformFieldCopy.businessRequired ? " *" : ""}
                            </div>
                            <input
                              className="w-full rounded-xl border border-border-main bg-surface px-3 py-2.5 text-sm outline-none transition focus:border-teal-400"
                              placeholder={platformFieldCopy.businessPlaceholder}
                              value={form.businessId}
                              onChange={(event) =>
                                setForm((prev) => ({ ...prev, businessId: event.target.value }))
                              }
                            />
                          </>
                        ) : null}
                        {platformFieldCopy.showMetaBusinessField ? (
                          <>
                            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                              {platformFieldCopy.metaBusinessLabel || "Meta Business ID"}
                            </div>
                            <input
                              className="w-full rounded-xl border border-border-main bg-surface px-3 py-2.5 text-sm outline-none transition focus:border-teal-400"
                              placeholder={platformFieldCopy.metaBusinessPlaceholder}
                              value={form.metaBusinessId}
                              onChange={(event) =>
                                setForm((prev) => ({ ...prev, metaBusinessId: event.target.value }))
                              }
                            />
                          </>
                        ) : null}
                        <select
                          className="w-full rounded-xl border border-border-main bg-surface px-3 py-2.5 text-sm outline-none transition focus:border-teal-400"
                          value={form.status}
                          onChange={(event) =>
                            setForm((prev) => ({ ...prev, status: event.target.value }))
                          }
                        >
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                          <option value="paused">Paused</option>
                        </select>
                        {metaSignupHint ? (
                          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                            {metaSignupHint}
                          </div>
                        ) : null}
                      </>
                    )
                  ) : (
                    <div className="rounded-xl border border-dashed border-border-main bg-canvas px-3 py-3 text-sm text-text-muted">
                      You can review integrations for this project, but only workspace integration managers and project admins can add or edit them.
                    </div>
                  )}
                  {error ? (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">
                      {error}
                    </div>
                  ) : null}
                  {activePlatform !== "email" &&
                  canManageSelectedProjectIntegrations &&
                  ["whatsapp", "facebook", "instagram"].includes(form.platformType) ? (
                    <button
                      onClick={handleStartMetaConnect}
                      disabled={!canUseMetaSignup || isMetaBusy}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-600 px-4 py-3 text-[11px] font-black uppercase tracking-[0.2em] text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Radio size={14} />
                      {isMetaBusy ? "Connecting Meta..." : metaSignupReady === false ? "Embedded Signup Unavailable" : "Connect with Meta"}
                    </button>
                  ) : null}
                  {activePlatform !== "email" && canManageSelectedProjectIntegrations ? (
                    <button
                      onClick={handleSave}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-[11px] font-black uppercase tracking-[0.2em] text-white transition hover:opacity-90"
                    >
                      {editingId ? <Pencil size={14} /> : <Plus size={14} />}
                      {editingId ? "Save Integration" : "Add Integration"}
                    </button>
                  ) : null}
                  {activePlatform !== "email" && editingId && canManageSelectedProjectIntegrations ? (
                    <button
                      onClick={resetForm}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border border-border-main bg-surface px-4 py-3 text-[11px] font-black uppercase tracking-[0.2em] text-text-muted"
                    >
                      <X size={14} />
                      Cancel Edit
                    </button>
                  ) : null}
                </div>
              </section>

              <section className="space-y-4">
                <div className="rounded-[1.2rem] border border-border-main bg-surface p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                        <Globe2 size={16} />
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                          {activePlatform}
                        </div>
                        <div className="text-sm font-semibold text-text-main">
                          {filteredAccounts.length} channel{filteredAccounts.length === 1 ? "" : "s"}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  {filteredAccounts.map((account) => (
                    <div
                      key={account.id}
                      className={`group rounded-[1.2rem] border border-border-main ${platformCardClass(account.platform_type)} p-4 shadow-sm transition hover:border-border-main hover:shadow-md`}
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="text-base font-black tracking-tight text-text-main">
                            {account.name}
                          </div>
                          <div className="mt-1 text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">
                            {account.platform_type}
                          </div>
                          <div className="mt-3 grid gap-2 text-sm text-text-muted sm:grid-cols-2 xl:grid-cols-4">
                            <div className="truncate">
                              {account.platform_type === "whatsapp" ? "Phone Number ID" : "Account"}: {account.account_id || "n/a"}
                            </div>
                            <div className="truncate">
                              {account.platform_type === "whatsapp" ? "Display Phone" : "Phone"}: {account.phone_number || "n/a"}
                            </div>
                            <div className="truncate">
                              {account.platform_type === "whatsapp" ? "WABA ID" : "Business"}: {account.business_id || "n/a"}
                            </div>
                            <div className="truncate">
                              {account.platform_type === "whatsapp"
                                ? `Meta Business ID: ${getMetaBusinessId(account) || "n/a"}`
                                : `Project: ${selectedProject?.name || "n/a"}`}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                          <div className={`inline-flex rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${platformBadgeClass(account.platform_type)}`}>
                            {account.status}
                          </div>
                          {canManageSelectedProjectIntegrations ? (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  platformAccountService
                                    .update(account.id, {
                                      status: account.status === "active" ? "inactive" : "active",
                                      projectId: selectedProjectId,
                                      workspaceId: activeWorkspaceId,
                                      platformType: account.platform_type,
                                      name: account.name,
                                      accountId: account.account_id || undefined,
                                      phoneNumber: account.phone_number || undefined,
                                      businessId: account.business_id || undefined,
                                      metadata:
                                        account.platform_type === "whatsapp" &&
                                        getMetaBusinessId(account)
                                          ? { metaBusinessId: getMetaBusinessId(account) }
                                          : undefined,
                                    })
                                    .then(() => loadAccounts(selectedProjectId))
                                    .catch((err) => {
                                      console.error("Failed to update integration status", err);
                                      setError("Failed to update integration status");
                                    })
                                }
                                className="rounded-full border border-border-main bg-canvas px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-text-main"
                              >
                                {account.status === "active" ? "Disconnect" : "Reconnect"}
                              </button>
                              <button
                                onClick={() => startEdit(account)}
                                className="rounded-full border border-border-main bg-surface px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-text-muted hover:border-border-main"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDelete(account.id).catch(console.error)}
                                className="rounded-full border border-red-200 bg-surface px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-red-700 hover:bg-red-50"
                              >
                                Delete
                              </button>
                            </>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {filteredAccounts.length === 0 ? (
                  <div className="rounded-[1.5rem] border border-dashed border-border-main bg-canvas p-12 text-center shadow-sm">
                    <div className="text-lg font-semibold tracking-tight text-text-main">
                      No integrations for {activePlatform} in this project yet
                    </div>
                    <div className="mt-2 text-sm leading-6 text-text-muted">
                      Add one from the editor and it will stay isolated to {selectedProject?.name || "this project"}.
                    </div>
                  </div>
                ) : null}
              </section>
            </div>
          )}
    </div>
  );
}

