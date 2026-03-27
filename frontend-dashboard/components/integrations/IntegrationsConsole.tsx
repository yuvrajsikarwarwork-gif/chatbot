import { useCallback, useEffect, useMemo, useState } from "react";
import { Globe2, KeyRound, Pencil, Plus, Radio, Trash2, X } from "lucide-react";

import PageAccessNotice from "../access/PageAccessNotice";
import DashboardLayout from "../layout/DashboardLayout";
import { useVisibility } from "../../hooks/useVisibility";
import WorkspaceStatusBanner from "../workspace/WorkspaceStatusBanner";
import { useAuthStore } from "../../store/authStore";
import {
  PlatformAccount,
  platformAccountService,
} from "../../services/platformAccountService";
import { confirmAction } from "../../store/uiStore";
import { projectService, type ProjectSummary } from "../../services/projectService";

const PLATFORMS = ["whatsapp", "website", "facebook", "instagram", "api", "telegram"];

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
  const projectAccesses = useAuthStore((state) => state.projectAccesses);
  const setActiveProject = useAuthStore((state) => state.setActiveProject);
  const hasWorkspacePermission = useAuthStore((state) => state.hasWorkspacePermission);
  const getProjectRole = useAuthStore((state) => state.getProjectRole);
  const { canViewPage } = useVisibility();

  const [accounts, setAccounts] = useState<PlatformAccount[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activePlatform, setActivePlatform] = useState("whatsapp");

  const activeWorkspaceId = activeWorkspace?.workspace_id || "";
  const selectedProjectRole = getProjectRole(selectedProjectId);
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
    canManageSelectedWorkspace || selectedProjectRole === "project_admin";
  const canViewIntegrationsPage =
    canViewPage("integrations") ||
    canViewSelectedWorkspaceIntegrations ||
    hasAnyProjectAdminInWorkspace;

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

  const filteredAccounts = useMemo(
    () => accounts.filter((account) => account.platform_type === activePlatform),
    [accounts, activePlatform]
  );

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

  const selectedProject =
    projects.find((project) => project.id === selectedProjectId) || null;
  const platformFieldCopy = getPlatformFieldCopy(form.platformType, editingId);

  return (
    <DashboardLayout>
      {!canViewIntegrationsPage ? (
        <PageAccessNotice
          title="Integrations are restricted for this role"
          description="Only workspace admins and project operators with integration access can open project integrations."
          href="/"
          ctaLabel="Open dashboard"
        />
      ) : (
        <div className="mx-auto max-w-7xl space-y-6">
          <WorkspaceStatusBanner workspace={activeWorkspace} />
          <section className="rounded-[1.35rem] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-sm">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0 flex items-center gap-3 text-sm text-[var(--muted)]">
                <Radio size={16} className="text-[var(--accent)]" />
                <span>{accounts.length} channels connected in the selected project.</span>
              </div>

              <div className="grid gap-3 sm:grid-cols-[minmax(220px,280px)_auto] xl:min-w-[520px]">
                <select
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
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

                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] px-3 py-2">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                    {selectedProject?.name || "No project"}
                  </span>
                  <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white">
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
                      ? "bg-slate-900 text-white shadow-sm"
                      : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                  }`}
                >
                  {platform}
                </button>
              ))}
            </div>
          </section>

          {!activeWorkspaceId || !selectedProjectId ? (
            <div className="rounded-[1.5rem] border border-dashed border-[var(--line)] bg-[var(--surface)] p-12 text-center shadow-sm">
              <div className="text-lg font-semibold tracking-tight text-[var(--text)]">
                Select a workspace project first
              </div>
              <div className="mt-2 text-sm leading-6 text-[var(--muted)]">
                Integrations now belong to projects, so this page stays empty until a project is selected.
              </div>
            </div>
          ) : (
            <div className="grid gap-5 xl:grid-cols-[290px_minmax(0,1fr)]">
              <section className="rounded-[1.35rem] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-sm">
                <div className="mb-5 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-white">
                    <KeyRound size={18} />
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                      Integration Editor
                    </div>
                    <div className="text-base font-semibold tracking-tight text-[var(--text)]">
                      {canManageSelectedProjectIntegrations
                        ? editingId
                          ? "Update project integration"
                          : "Connect a project integration"
                        : "Project integrations are read only"}
                    </div>
                    <div className="mt-1 text-xs text-[var(--muted)]">
                      {editingId
                        ? `Editing ${form.platformType} integration`
                        : `Adding ${activePlatform} integration`}
                    </div>
                  </div>
                </div>

                <div className="space-y-3 rounded-[1.1rem] border border-[var(--line)] bg-[var(--surface-strong)] p-3">
                  <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs text-slate-600">
                    <div className="truncate">
                      Workspace: <strong>{activeWorkspace?.workspace_name || activeWorkspaceId}</strong>
                    </div>
                    <div className="mt-1 truncate">
                      Project: <strong>{selectedProject?.name || selectedProjectId}</strong>
                    </div>
                  </div>
                  {canManageSelectedProjectIntegrations ? (
                    <>
                      <div className="rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-3 text-xs leading-5 text-slate-700">
                        {platformFieldCopy.intro}
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-600">
                        Platform: <strong className="uppercase">{form.platformType}</strong>
                      </div>
                      <input
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-400"
                        placeholder="Integration name"
                        value={form.name}
                        onChange={(event) =>
                          setForm((prev) => ({ ...prev, name: event.target.value }))
                        }
                      />
                      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                        {platformFieldCopy.accountLabel}
                        {platformFieldCopy.accountRequired ? " *" : ""}
                      </div>
                      <input
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-400"
                        placeholder={platformFieldCopy.accountPlaceholder}
                        value={form.accountId}
                        onChange={(event) =>
                          setForm((prev) => ({ ...prev, accountId: event.target.value }))
                        }
                      />
                      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                        {platformFieldCopy.tokenLabel}
                        {platformFieldCopy.tokenRequired ? " *" : ""}
                      </div>
                      <input
                        type="password"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-400"
                        placeholder={platformFieldCopy.tokenPlaceholder}
                        value={form.token}
                        onChange={(event) =>
                          setForm((prev) => ({ ...prev, token: event.target.value }))
                        }
                      />
                      {platformFieldCopy.showPhoneField ? (
                        <>
                          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                            {platformFieldCopy.phoneLabel || "Phone Number"}
                          </div>
                          <input
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-400"
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
                          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                            {platformFieldCopy.businessLabel || "Business Account ID"}
                            {platformFieldCopy.businessRequired ? " *" : ""}
                          </div>
                          <input
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-400"
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
                          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                            {platformFieldCopy.metaBusinessLabel || "Meta Business ID"}
                          </div>
                          <input
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-400"
                            placeholder={platformFieldCopy.metaBusinessPlaceholder}
                            value={form.metaBusinessId}
                            onChange={(event) =>
                              setForm((prev) => ({ ...prev, metaBusinessId: event.target.value }))
                            }
                          />
                        </>
                      ) : null}
                      <select
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-400"
                        value={form.status}
                        onChange={(event) =>
                          setForm((prev) => ({ ...prev, status: event.target.value }))
                        }
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                        <option value="paused">Paused</option>
                      </select>
                    </>
                  ) : (
                    <div className="rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface)] px-3 py-3 text-sm text-[var(--muted)]">
                      You can review integrations for this project, but only workspace integration managers and project admins can add or edit them.
                    </div>
                  )}
                  {error ? (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">
                      {error}
                    </div>
                  ) : null}
                  {canManageSelectedProjectIntegrations ? (
                    <button
                      onClick={handleSave}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-[11px] font-black uppercase tracking-[0.2em] text-white transition hover:bg-slate-800"
                    >
                      {editingId ? <Pencil size={14} /> : <Plus size={14} />}
                      {editingId ? "Save Integration" : "Add Integration"}
                    </button>
                  ) : null}
                  {editingId && canManageSelectedProjectIntegrations ? (
                    <button
                      onClick={resetForm}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[11px] font-black uppercase tracking-[0.2em] text-slate-600"
                    >
                      <X size={14} />
                      Cancel Edit
                    </button>
                  ) : null}
                </div>
              </section>

              <section className="space-y-4">
                <div className="rounded-[1.2rem] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                        <Globe2 size={16} />
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                          {activePlatform}
                        </div>
                        <div className="text-sm font-semibold text-[var(--text)]">
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
                      className="group rounded-[1.2rem] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] p-4 shadow-sm transition hover:border-slate-300 hover:shadow-md"
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="text-base font-black tracking-tight text-slate-900">
                            {account.name}
                          </div>
                          <div className="mt-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                            {account.platform_type}
                          </div>
                          <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2 xl:grid-cols-4">
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
                          <div className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-600">
                            {account.status}
                          </div>
                          {canManageSelectedProjectIntegrations ? (
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
                              className="rounded-full border border-[var(--line)] bg-[var(--surface-strong)] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text)]"
                            >
                              {account.status === "active" ? "Disconnect" : "Reconnect"}
                            </button>
                          ) : null}
                          {canManageSelectedProjectIntegrations ? (
                            <button
                              onClick={() => startEdit(account)}
                              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-700 hover:border-slate-300"
                            >
                              Edit
                            </button>
                          ) : null}
                          {canManageSelectedProjectIntegrations ? (
                            <button
                              onClick={() => handleDelete(account.id).catch(console.error)}
                              className="rounded-full border border-red-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-red-700 hover:bg-red-50"
                            >
                              Delete
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {filteredAccounts.length === 0 ? (
                  <div className="rounded-[1.5rem] border border-dashed border-[var(--line)] bg-[var(--surface)] p-12 text-center shadow-sm">
                    <div className="text-lg font-semibold tracking-tight text-[var(--text)]">
                      No integrations for {activePlatform} in this project yet
                    </div>
                    <div className="mt-2 text-sm leading-6 text-[var(--muted)]">
                      Add one from the editor and it will stay isolated to {selectedProject?.name || "this project"}.
                    </div>
                  </div>
                ) : null}
              </section>
            </div>
          )}
        </div>
      )}
    </DashboardLayout>
  );
}
