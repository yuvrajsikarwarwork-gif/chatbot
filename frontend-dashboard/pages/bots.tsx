import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import {
  Activity,
  Edit3,
  Copy,
  Loader2,
  Lock,
  Plus,
  Power,
  Rocket,
  Send,
  ShieldCheck,
  Trash2,
} from "lucide-react";

import PageAccessNotice from "../components/access/PageAccessNotice";
import RequirePermission from "../components/access/RequirePermission";
import DashboardLayout from "../components/layout/DashboardLayout";
import BotCreationModal from "../components/forms/BotCreationModal";
import BotCopyModal from "../components/forms/BotCopyModal";
import EditBotModal from "../components/forms/EditBotModal";
import { useVisibility } from "../hooks/useVisibility";
import { botService } from "../services/botService";
import { projectService } from "../services/projectService";
import { workspaceService } from "../services/workspaceService";
import { useAuthStore } from "../store/authStore";
import { useBotStore } from "../store/botStore";
import { confirmAction, notify } from "../store/uiStore";

function normalizeBotList(payload: any) {
  if (Array.isArray(payload)) {
    return payload;
  }

  const candidate = payload?.data || payload?.bots || payload?.items || payload?.list;
  return Array.isArray(candidate) ? candidate : [];
}

export default function BotsPage() {
  const router = useRouter();
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);
  const activeProject = useAuthStore((state) => state.activeProject);
  const hasWorkspacePermission = useAuthStore((state) => state.hasWorkspacePermission);
  const getProjectRole = useAuthStore((state) => state.getProjectRole);
  const setActiveWorkspace = useAuthStore((state) => state.setActiveWorkspace);
  const setActiveProject = useAuthStore((state) => state.setActiveProject);
  const { canViewPage, isReadOnly } = useVisibility();
  const [bots, setBots] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isActivating, setIsActivating] = useState<string | null>(null);
  const [isToggling, setIsToggling] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCopyModalOpen, setIsCopyModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingBot, setEditingBot] = useState<any>(null);
  const [copyingBot, setCopyingBot] = useState<any>(null);
  const [hydratedWorkspaceId, setHydratedWorkspaceId] = useState<string | null>(null);
  const [hydratedProjectId, setHydratedProjectId] = useState<string | null>(null);

  const { unlockedBotIds, setBotUnlock, setBotLock, syncUnlockedBots, checkLockStatus } =
    useBotStore();

  const canCreateBots = hasWorkspacePermission(activeWorkspace?.workspace_id, "create_bots");
  const canEditBots = hasWorkspacePermission(activeWorkspace?.workspace_id, "edit_bots");
  const canDeleteBots = hasWorkspacePermission(activeWorkspace?.workspace_id, "delete_bots");
  const canEditWorkflow = hasWorkspacePermission(activeWorkspace?.workspace_id, "edit_workflow");
  const projectRole = getProjectRole(activeProject?.id);
  const canCreateProjectBots =
    !isReadOnly && (canCreateBots || projectRole === "project_admin" || projectRole === "editor");
  const canEditProjectBots =
    !isReadOnly && (canEditBots || projectRole === "project_admin" || projectRole === "editor");
  const canDeleteProjectBots = !isReadOnly && (canDeleteBots || projectRole === "project_admin");
  const canEditProjectWorkflow =
    !isReadOnly && (canEditWorkflow || projectRole === "project_admin" || projectRole === "editor");
  const canViewBotsPage = canViewPage("bots");
  const resolvedWorkspaceId = activeWorkspace?.workspace_id || hydratedWorkspaceId;
  const currentProjectId = activeProject?.id || hydratedProjectId || null;

  const load = async () => {
    if (!resolvedWorkspaceId) {
      setBots([]);
      return;
    }

    setLoading(true);
    checkLockStatus();
    try {
      const requestProjectId = currentProjectId || undefined;
      let data = normalizeBotList(
        await botService.getBots({
        workspaceId: resolvedWorkspaceId || undefined,
        projectId: requestProjectId,
        })
      );

      if (!requestProjectId && Array.isArray(data) && data.length === 0) {
        const fallbackData = normalizeBotList(await botService.list());
        if (Array.isArray(fallbackData) && fallbackData.length > 0) {
          data = fallbackData;
        }
      }

      setBots(data);
      syncUnlockedBots(data.map((bot: any) => String(bot.id)));

      if (!currentProjectId) {
        const firstProjectId = Array.isArray(data)
          ? String(data.find((bot: any) => String(bot.project_id || "").trim())?.project_id || "").trim()
          : "";
        if (firstProjectId) {
          try {
            const project = await projectService.get(firstProjectId);
            setActiveProject({
              id: project.id,
              workspace_id: project.workspace_id,
              name: project.name,
              status: project.status,
              is_default: project.is_default,
            });
          } catch (err) {
            console.error("Failed to hydrate active project from loaded bots", err);
          }
        }
      }
    } catch (err) {
      console.error("Fetch failed", err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async (botId: string, currentStatus: string) => {
    setIsToggling(botId);
    try {
      const newStatus = currentStatus === "active" ? "inactive" : "active";
      await botService.updateBot(botId, { status: newStatus });
      await load();
    } catch (err) {
      console.error("Status toggle failed", err);
    } finally {
      setIsToggling(null);
    }
  };

  const handleUnlockToggle = async (bot: any) => {
    const isCurrentlyUnlocked = unlockedBotIds.includes(bot.id);

    if (isCurrentlyUnlocked) {
      setBotLock(bot.id);
      return;
    }

    setIsActivating(bot.id);
    try {
      await botService.activateBot(bot.id);
      setBotUnlock(bot.id);
    } catch (err) {
      console.error("Unlock failed", err);
    } finally {
      setIsActivating(null);
    }
  };

  useEffect(() => {
    if (!canViewBotsPage) {
      setBots([]);
      return;
    }
    load();
    const interval = setInterval(checkLockStatus, 10000);
    return () => clearInterval(interval);
  }, [resolvedWorkspaceId, currentProjectId, canViewBotsPage]);

  useEffect(() => {
    if (!canViewBotsPage) {
      return;
    }

    let cancelled = false;

    const hydrateContext = async () => {
      const workspaceId = resolvedWorkspaceId || null;

      if (workspaceId && activeProject?.id) {
        return;
      }

      if (workspaceId && !activeProject?.id) {
        const projectRows = await projectService.list(workspaceId);
        const projectList = Array.isArray(projectRows) ? projectRows : [];
        const firstProject = projectList[0] || null;

        if (!cancelled && firstProject) {
          setHydratedProjectId(firstProject.id);
          setActiveProject({
            id: firstProject.id,
            workspace_id: firstProject.workspace_id,
            name: firstProject.name,
            status: firstProject.status,
            is_default: firstProject.is_default,
          });
        }
        return;
      }

      const workspaceRows = await workspaceService.list();
      const workspaceList = Array.isArray(workspaceRows) ? workspaceRows : [];
      const firstWorkspace = workspaceList[0] || null;

      if (!firstWorkspace || cancelled) {
        return;
      }

      setHydratedWorkspaceId(firstWorkspace.id);
      setActiveWorkspace(firstWorkspace.id);

      const projectRows = await projectService.list(firstWorkspace.id);
      const projectList = Array.isArray(projectRows) ? projectRows : [];
      const firstProject = projectList[0] || null;

      if (!cancelled && firstProject) {
        setHydratedProjectId(firstProject.id);
        setActiveProject({
          id: firstProject.id,
          workspace_id: firstProject.workspace_id,
          name: firstProject.name,
          status: firstProject.status,
          is_default: firstProject.is_default,
        });
      }
    };

    hydrateContext().catch((err) => {
      console.error("Failed to hydrate bots context", err);
    });

    return () => {
      cancelled = true;
    };
  }, [
    resolvedWorkspaceId,
    activeProject?.id,
    canViewBotsPage,
    setActiveProject,
    setActiveWorkspace,
  ]);

  useEffect(() => {
    if (!router.isReady || !Array.isArray(bots) || bots.length === 0) {
      return;
    }

    const editBotId = typeof router.query.editBot === "string" ? router.query.editBot : "";
    if (!editBotId) {
      return;
    }

    const matchedBot = bots.find((bot) => String(bot.id) === String(editBotId));
    if (!matchedBot) {
      return;
    }

    setEditingBot(matchedBot);
    setIsEditModalOpen(true);
  }, [bots, router.isReady, router.query.editBot]);

  const hasActiveProject = Boolean(currentProjectId);
  const getBotProjectId = (bot: any) => String(bot.project_id || bot.projectId || "").trim();
  const targetProjectId = String(currentProjectId || "").trim();
  let connectedBots = hasActiveProject
    ? bots.filter((bot) => getBotProjectId(bot) === targetProjectId)
    : bots.filter((bot) => getBotProjectId(bot));

  if (hasActiveProject && connectedBots.length === 0) {
    const anyProjectBots = bots.filter((bot) => getBotProjectId(bot));
    if (anyProjectBots.length > 0) {
      connectedBots = anyProjectBots;
    }
  }

  const unassignedBots = bots.filter((bot) => !getBotProjectId(bot));
  const activeBots = connectedBots.filter((bot) => bot.status === "active");
  const inactiveBots = connectedBots.filter((bot) => bot.status !== "active");

  const BotCard = ({ bot }: { bot: any }) => {
    const getCardProjectId = (b: any) => String(b?.project_id || b?.projectId || "").trim();
    const isUnlocked = (unlockedBotIds || []).includes(bot?.id);
    const isLive = bot?.status === "active";
    const activating = isActivating === bot?.id;
    const toggling = isToggling === bot?.id;
    const isUnassigned = !getCardProjectId(bot);
    const canToggleLive = canEditProjectBots && !isUnassigned;
    const canUseBuilderSlot = canEditProjectBots && !isUnassigned;

    return (
      <div
        className={`group relative overflow-hidden rounded-[2rem] border p-8 shadow-sm transition-all duration-500 ${
          isUnlocked
            ? "scale-[1.02] border-primary bg-surface"
            : "border-border-main bg-surface hover:-translate-y-1 hover:border-primary/30"
        } ${!isLive ? "grayscale-[0.6] opacity-75" : ""}`}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.08),transparent_60%)]" />
        <div
          className={`absolute right-0 top-0 flex items-center gap-1.5 rounded-bl-2xl px-4 py-1.5 text-[9px] font-black uppercase tracking-widest shadow-sm ${
            isUnlocked
              ? "bg-primary text-white"
              : "bg-canvas text-text-muted"
          }`}
        >
          {isUnlocked ? (
            <>
              <ShieldCheck size={10} /> Builder Slot Active
            </>
          ) : (
            <>
              <Lock size={10} /> Slot Locked
            </>
          )}
        </div>

        <div className="mb-6 flex items-start justify-between">
          <div className="flex gap-3 opacity-60 transition-opacity group-hover:opacity-100">
            <RequirePermission permissionKey="delete_bots">
            {canDeleteProjectBots ? (
              <button
                onClick={async () => {
                  if (await confirmAction("Delete bot", "This bot instance will be removed.", "Delete")) {
                    console.log("Attempting to delete bot:", bot?.id);
                    try {
                      setBotLock(bot?.id);
                      const response = await botService.deleteBot(bot?.id);
                      console.log("Delete API Success:", response);
                      notify("Bot deleted successfully", "success");
                      await load();
                    } catch (err: any) {
                      console.error("Delete API Failed:", err?.response?.data || err?.message || err);
                      notify(`Delete Failed: ${err?.response?.data?.message || "Server Error"}`, "error");
                    }
                  }
                }}
                className="rounded-xl border border-border-main bg-canvas p-2 text-text-main transition-colors hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
              >
                <Trash2 size={16} />
              </button>
            ) : null}
            </RequirePermission>
            <RequirePermission permissionKey="edit_bots">
            {canEditProjectBots ? (
              <button
                onClick={() => {
                  setEditingBot(bot);
                  setIsEditModalOpen(true);
                }}
                className="rounded-xl border border-border-main bg-canvas p-2 text-text-main transition-colors hover:border-primary/30 hover:bg-surface hover:text-text-main"
              >
                <Edit3 size={16} />
              </button>
            ) : null}
            </RequirePermission>
            <RequirePermission permissionKey="create_bots">
            {canEditProjectBots ? (
              <button
                onClick={() => {
                  setCopyingBot(bot);
                  setIsCopyModalOpen(true);
                }}
                className="rounded-xl border border-border-main bg-canvas p-2 text-text-main transition-colors hover:border-primary/30 hover:bg-surface hover:text-primary"
                title="Copy bot flow JSON"
              >
                <Copy size={16} />
              </button>
            ) : null}
            </RequirePermission>
            <button
              onClick={() => {
                notify("Manual bot testing is not wired to a backend route in this build.", "info");
              }}
              className="rounded-xl border border-border-main bg-canvas p-2 text-text-main transition-colors hover:border-primary/30 hover:bg-surface hover:text-primary"
              title="Manual bot testing is currently unavailable"
            >
              <Send size={16} />
            </button>
          </div>

          <button
            onClick={() => handleToggleStatus(bot?.id, bot?.status)}
            disabled={toggling || !canToggleLive}
            className={`flex items-center gap-2 rounded-full px-3 py-1.5 transition-all active:scale-90 ${
              isUnassigned
                ? "border border-amber-200 bg-amber-50 text-amber-700"
                : isLive
                ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border border-border-main bg-canvas text-text-muted"
            }`}
            title={isUnassigned ? "Reconnect this bot to a project before making it live." : undefined}
          >
            {toggling ? <Loader2 size={12} className="animate-spin" /> : <Power size={12} />}
            <span className="text-[9px] font-black uppercase tracking-widest">
              {isUnassigned ? "Disconnected" : isLive ? "Live" : "Off"}
            </span>
          </button>
        </div>

        <div className="mb-2 flex items-center gap-3">
          <h3 className="truncate text-xl font-black uppercase tracking-tight text-text-main">
            {bot?.name || "Unnamed"}
          </h3>
          {isLive ? <Activity size={16} className="animate-pulse text-emerald-500" /> : null}
        </div>
        <div className="mb-3 flex flex-wrap gap-2">
          <span
            className={`rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-[0.18em] ${
              isUnassigned
                ? "border border-amber-200 bg-amber-50 text-amber-700"
                : "border border-border-main bg-canvas text-text-muted"
            }`}
          >
            {isUnassigned ? "Disconnected" : "Connected"}
          </span>
            <span className="rounded-full border border-border-main bg-canvas px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-text-muted">
            {isUnassigned ? "No project" : activeProject?.name || "Project linked"}
          </span>
        </div>
          <p className="mb-6 truncate text-[10px] font-bold uppercase tracking-widest text-text-muted">
            Trigger: {bot?.trigger_keywords || "None"}
          </p>

        <div className="space-y-3">
          <button
            onClick={() => handleUnlockToggle(bot)}
            disabled={activating || !canUseBuilderSlot}
            className={`flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-[10px] font-black uppercase tracking-[0.15em] shadow-md transition-all active:scale-95 ${
              isUnassigned
                ? "border border-amber-200 bg-amber-50 text-amber-700"
                : isUnlocked
                ? "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                : "border border-primary bg-primary text-white shadow-sm hover:-translate-y-0.5"
            }`}
            title={isUnassigned ? "Reconnect this bot to a project before using a builder slot." : undefined}
          >
            {activating ? (
              <Loader2 size={12} className="animate-spin" />
            ) : isUnassigned ? (
              "Reconnect To Use Builder"
            ) : isUnlocked ? (
              "Release Builder Slot"
            ) : (
              `Unlock Builder (${unlockedBotIds?.length || 0}/5)`
            )}
          </button>

          {isUnlocked && canEditProjectWorkflow ? (
            <button
              onClick={() => router.push(`/flows?botId=${bot?.id}`)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-primary bg-primary py-4 text-[10px] font-black uppercase tracking-[0.15em] text-white shadow-sm animate-in fade-in duration-500 hover:-translate-y-0.5"
            >
              <Rocket size={14} /> Open Flow Designer
            </button>
          ) : null}
        </div>
      </div>
    );
  };

  return !canViewBotsPage ? (
    <PageAccessNotice
      title="Bots are restricted for this role"
      description="Bot management is available to workspace admins and project operators who can edit automation."
      href="/"
      ctaLabel="Open dashboard"
    />
  ) : (
    <div className="flex-1 flex flex-col h-full w-full overflow-y-auto">
      <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col px-4 pb-20">
        <section className="mb-8 rounded-[1.9rem] border border-border-main bg-surface p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-[1.75rem] font-black tracking-[-0.03em] text-text-main">
              Bot Instances
            </h1>
            <div className="mt-2 flex gap-4">
            <p className="rounded-full border border-border-main bg-canvas px-3 py-1 text-[9px] font-semibold uppercase text-text-muted">
                {activeBots.length} active in project
              </p>
              <p className="rounded-full border border-primary/20 bg-primary-fade px-3 py-1 text-[9px] font-semibold uppercase text-primary">
                {connectedBots.length}/5 slots used
              </p>
              <p className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[9px] font-semibold uppercase text-amber-700">
                {unassignedBots.length} disconnected
              </p>
            </div>
            <p className="mt-3 text-sm text-text-muted">
              Bots stay visible at the workspace level. Unassigned bots are shown as disconnected
              until they are linked back to a project.
            </p>
          </div>
          <RequirePermission permissionKey="create_bots">
          {canCreateProjectBots ? (
            <button
              onClick={() => setIsModalOpen(true)}
              disabled={!activeWorkspace?.workspace_id || !activeProject?.id}
              className="flex items-center justify-center gap-2 rounded-xl border border-primary bg-primary px-6 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-white shadow-sm transition-all active:scale-95 disabled:opacity-50"
            >
              <Plus size={14} /> Provision Bot
            </button>
          ) : null}
          </RequirePermission>
        </div>
        </section>

        {!activeWorkspace?.workspace_id ? (
          <div className="mb-8 rounded-[1.5rem] border border-dashed border-border-main bg-canvas p-8 text-sm text-text-muted">
            Select a workspace first. To create a new bot, also select a project. The current flow is{" "}
            <span className="font-medium">workspace -&gt; project -&gt; integration -&gt; campaign -&gt; bot</span>.
          </div>
        ) : null}

        {activeWorkspace?.workspace_id && !hasActiveProject ? (
          <div className="mb-8 rounded-[1.5rem] border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            No project is selected right now. Showing all project-linked bots in this workspace so you can still find them.
          </div>
        ) : null}

        <div className="mb-16">
          <h2 className="mb-6 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted">
            <div className="h-2 w-2 rounded-full bg-primary animate-ping" />
            Live Network
          </h2>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
            {activeBots.map((bot) => (
              <BotCard key={bot.id} bot={bot} />
            ))}
            {activeBots.length === 0 && !loading ? (
              <div className="col-span-full flex flex-col items-center justify-center rounded-[3rem] border border-dashed border-border-main bg-canvas py-20 text-text-muted">
                <Activity size={48} className="mb-4 opacity-10" />
                <span className="text-[10px] font-black uppercase tracking-[0.3em]">
                  No Active Bot Logic
                </span>
              </div>
            ) : null}
          </div>
        </div>

        {inactiveBots.length > 0 ? (
          <div className="border-t border-border-main pt-12">
            <h2 className="mb-6 text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted">
              Parked / Drafts
            </h2>
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
              {inactiveBots.map((bot) => (
                <BotCard key={bot.id} bot={bot} />
              ))}
            </div>
          </div>
        ) : null}

        {unassignedBots.length > 0 ? (
          <div className="border-t border-border-main pt-12">
            <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted">
              Disconnected / No Project
            </h2>
            <p className="mb-6 max-w-2xl text-sm text-text-muted">
              These bots are still in this workspace, but they are not linked to any project right now.
              Reassign them from edit to connect them again.
            </p>
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
              {unassignedBots.map((bot) => (
                <BotCard key={bot.id} bot={bot} />
              ))}
            </div>
          </div>
        ) : null}

        {loading ? (
          <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-canvas text-text-main backdrop-blur-md">
            <Loader2 className="animate-spin" size={40} />
            <span className="animate-pulse text-[10px] font-black uppercase tracking-widest">
              Syncing Database...
            </span>
          </div>
        ) : null}

        <BotCreationModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSuccess={load}
        />
        <BotCopyModal
          isOpen={isCopyModalOpen}
          sourceBot={copyingBot}
          onClose={() => {
            setIsCopyModalOpen(false);
            setCopyingBot(null);
          }}
        />
        <EditBotModal
          isOpen={isEditModalOpen}
          onClose={() => {
            setIsEditModalOpen(false);
            setEditingBot(null);
            if (router.query.editBot) {
              void router.replace("/bots");
            }
          }}
          bot={editingBot}
          onSuccess={load}
        />
      </div>
      </div>
  );
}

(BotsPage as any).getLayout = (page: any) => <DashboardLayout>{page}</DashboardLayout>;
