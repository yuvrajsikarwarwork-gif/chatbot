import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import {
  Activity,
  Edit3,
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
import DashboardLayout from "../components/layout/DashboardLayout";
import BotCreationModal from "../components/forms/BotCreationModal";
import EditBotModal from "../components/forms/EditBotModal";
import { useVisibility } from "../hooks/useVisibility";
import { botService } from "../services/botService";
import { useAuthStore } from "../store/authStore";
import { useBotStore } from "../store/botStore";
import { confirmAction, notify } from "../store/uiStore";

export default function BotsPage() {
  const router = useRouter();
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);
  const activeProject = useAuthStore((state) => state.activeProject);
  const hasWorkspacePermission = useAuthStore((state) => state.hasWorkspacePermission);
  const getProjectRole = useAuthStore((state) => state.getProjectRole);
  const { canViewPage } = useVisibility();
  const [bots, setBots] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isActivating, setIsActivating] = useState<string | null>(null);
  const [isToggling, setIsToggling] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingBot, setEditingBot] = useState<any>(null);

  const { unlockedBotIds, setBotUnlock, setBotLock, syncUnlockedBots, checkLockStatus } =
    useBotStore();

  const canCreateBots = hasWorkspacePermission(activeWorkspace?.workspace_id, "create_bots");
  const canEditBots = hasWorkspacePermission(activeWorkspace?.workspace_id, "edit_bots");
  const canDeleteBots = hasWorkspacePermission(activeWorkspace?.workspace_id, "delete_bots");
  const canEditWorkflow = hasWorkspacePermission(activeWorkspace?.workspace_id, "edit_workflow");
  const projectRole = getProjectRole(activeProject?.id);
  const canCreateProjectBots =
    canCreateBots || projectRole === "project_admin" || projectRole === "editor";
  const canEditProjectBots =
    canEditBots || projectRole === "project_admin" || projectRole === "editor";
  const canDeleteProjectBots = canDeleteBots || projectRole === "project_admin";
  const canEditProjectWorkflow =
    canEditWorkflow || projectRole === "project_admin" || projectRole === "editor";
  const canViewBotsPage = canViewPage("bots");
  const currentProjectId = activeProject?.id || null;

  const load = async () => {
    if (!activeWorkspace?.workspace_id) {
      setBots([]);
      return;
    }

    setLoading(true);
    checkLockStatus();
    try {
      const data = await botService.getBots({
        workspaceId: activeWorkspace?.workspace_id || undefined,
        projectId: "",
      });
      setBots(data);
      syncUnlockedBots(data.map((bot: any) => String(bot.id)));
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
  }, [activeWorkspace?.workspace_id, activeProject?.id, canViewBotsPage]);

  const connectedBots = bots.filter((bot) => String(bot.project_id || "").trim() === currentProjectId);
  const unassignedBots = bots.filter((bot) => !String(bot.project_id || "").trim());
  const activeBots = connectedBots.filter((bot) => bot.status === "active");
  const inactiveBots = connectedBots.filter((bot) => bot.status !== "active");

  const BotCard = ({ bot }: { bot: any }) => {
    const isUnlocked = unlockedBotIds.includes(bot.id);
    const isLive = bot.status === "active";
    const activating = isActivating === bot.id;
    const toggling = isToggling === bot.id;
    const isUnassigned = !String(bot.project_id || "").trim();
    const canToggleLive = canEditProjectBots && !isUnassigned;
    const canUseBuilderSlot = canEditProjectBots && !isUnassigned;

    return (
      <div
        className={`group relative overflow-hidden rounded-[2rem] border p-8 shadow-[var(--shadow-soft)] backdrop-blur-xl transition-all duration-500 ${
          isUnlocked
            ? "scale-[1.02] border-[rgba(129,140,248,0.4)] bg-[var(--glass-surface-strong)] shadow-[0_26px_60px_var(--accent-glow)]"
            : "border-[var(--glass-border)] bg-[var(--glass-surface)] hover:-translate-y-1 hover:border-[var(--line-strong)]"
        } ${!isLive ? "grayscale-[0.6] opacity-75" : ""}`}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.16),transparent_60%)]" />
        <div
          className={`absolute right-0 top-0 flex items-center gap-1.5 rounded-bl-2xl px-4 py-1.5 text-[9px] font-black uppercase tracking-widest shadow-sm ${
            isUnlocked
              ? "bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] text-white"
              : "bg-[var(--glass-surface-strong)] text-[var(--muted)]"
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
            {canDeleteProjectBots ? (
              <button
                onClick={async () => {
                  if (await confirmAction("Delete bot", "This bot instance will be removed.", "Delete")) {
                    try {
                      setBotLock(bot.id);
                      await botService.deleteBot(bot.id);
                    } catch (err: any) {
                      const message = err?.response?.data?.message || "";
                      if (String(message).toLowerCase().includes("not found")) {
                        // Treat missing rows as already deleted and refresh the list.
                      } else {
                        throw err;
                      }
                    } finally {
                      load();
                    }
                  }
                }}
                className="rounded-xl border border-transparent bg-transparent p-2 text-[var(--muted)] transition-colors hover:border-rose-300/40 hover:bg-rose-500/10 hover:text-rose-300"
              >
                <Trash2 size={16} />
              </button>
            ) : null}
            {canEditProjectBots ? (
              <button
                onClick={() => {
                  setEditingBot(bot);
                  setIsEditModalOpen(true);
                }}
                className="rounded-xl border border-transparent bg-transparent p-2 text-[var(--muted)] transition-colors hover:border-[var(--glass-border)] hover:bg-[var(--glass-surface-strong)] hover:text-[var(--text)]"
              >
                <Edit3 size={16} />
              </button>
            ) : null}
            <button
              onClick={() => {
                notify("Manual bot testing is not wired to a backend route in this build.", "info");
              }}
              className="rounded-xl border border-transparent bg-transparent p-2 text-[var(--muted)] transition-colors hover:border-[var(--glass-border)] hover:bg-[var(--glass-surface-strong)] hover:text-[var(--accent)]"
              title="Manual bot testing is currently unavailable"
            >
              <Send size={16} />
            </button>
          </div>

          <button
            onClick={() => handleToggleStatus(bot.id, bot.status)}
            disabled={toggling || !canToggleLive}
            className={`flex items-center gap-2 rounded-full px-3 py-1.5 transition-all active:scale-90 ${
              isUnassigned
                ? "border border-amber-300/60 bg-amber-100 text-amber-950"
                : isLive
                ? "border border-emerald-300/30 bg-emerald-500/12 text-emerald-300"
                : "border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] text-[var(--muted)]"
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
          <h3 className="truncate text-xl font-black uppercase tracking-tight text-[var(--text)]">
            {bot.name}
          </h3>
          {isLive ? <Activity size={16} className="animate-pulse text-emerald-500" /> : null}
        </div>
        <div className="mb-3 flex flex-wrap gap-2">
          <span
            className={`rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-[0.18em] ${
              isUnassigned
                ? "border-amber-300/60 bg-amber-100 text-amber-950"
                : "border-[var(--glass-border)] bg-[var(--glass-surface-strong)] text-[var(--muted)]"
            }`}
          >
            {isUnassigned ? "Disconnected" : "Connected"}
          </span>
          <span className="rounded-full border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
            {isUnassigned ? "No project" : activeProject?.name || "Project linked"}
          </span>
        </div>
          <p className="mb-6 truncate text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">
            Trigger: {bot.trigger_keywords || "None"}
          </p>

        <div className="space-y-3">
          <button
            onClick={() => handleUnlockToggle(bot)}
            disabled={activating || !canUseBuilderSlot}
            className={`flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-[10px] font-black uppercase tracking-[0.15em] shadow-md transition-all active:scale-95 ${
              isUnassigned
                ? "border border-amber-300/60 bg-amber-100 text-amber-950"
                : isUnlocked
                ? "border border-rose-300/60 bg-rose-100 text-rose-950 hover:bg-rose-200"
                : "border border-[rgba(129,140,248,0.35)] bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] text-white shadow-[0_18px_30px_var(--accent-glow)] hover:-translate-y-0.5"
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
              `Unlock Builder (${unlockedBotIds.length}/5)`
            )}
          </button>

          {isUnlocked && canEditProjectWorkflow ? (
            <button
              onClick={() => router.push(`/flows?botId=${bot.id}`)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-cyan-300/30 bg-[linear-gradient(135deg,rgba(56,189,248,0.9),rgba(99,102,241,0.9))] py-4 text-[10px] font-black uppercase tracking-[0.15em] text-white shadow-lg animate-in fade-in duration-500 hover:-translate-y-0.5"
            >
              <Rocket size={14} /> Open Flow Designer
            </button>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <DashboardLayout>
      {!canViewBotsPage ? (
        <PageAccessNotice
          title="Bots are restricted for this role"
          description="Bot management is available to workspace admins and project operators who can edit automation."
          href="/"
          ctaLabel="Open dashboard"
        />
      ) : (
      <div className="mx-auto max-w-6xl px-4 pb-20">
        <section className="mb-8 rounded-[1.9rem] border border-[var(--glass-border)] bg-[var(--glass-surface)] p-6 shadow-[var(--shadow-glass)] backdrop-blur-2xl">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="bg-[linear-gradient(180deg,var(--text),color-mix(in_srgb,var(--text)_72%,var(--accent)_28%))] bg-clip-text text-[1.75rem] font-black tracking-[-0.03em] text-transparent">
              Bot Instances
            </h1>
            <div className="mt-2 flex gap-4">
            <p className="rounded-full border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] px-3 py-1 text-[9px] font-semibold uppercase text-[var(--muted)]">
                {activeBots.length} active in project
              </p>
              <p className="rounded-full border border-[rgba(129,140,248,0.35)] bg-[var(--accent-soft)] px-3 py-1 text-[9px] font-semibold uppercase text-[var(--accent)]">
                {unlockedBotIds.length}/5 slots used
              </p>
              <p className="rounded-full border border-amber-300/60 bg-amber-100 px-3 py-1 text-[9px] font-semibold uppercase text-amber-950">
                {unassignedBots.length} disconnected
              </p>
            </div>
            <p className="mt-3 text-sm text-[var(--muted)]">
              Bots stay visible at the workspace level. Unassigned bots are shown as disconnected
              until they are linked back to a project.
            </p>
          </div>
          {canCreateProjectBots ? (
            <button
              onClick={() => setIsModalOpen(true)}
              disabled={!activeWorkspace?.workspace_id || !activeProject?.id}
              className="flex items-center justify-center gap-2 rounded-xl border border-[rgba(129,140,248,0.35)] bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] px-6 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-white shadow-[0_18px_30px_var(--accent-glow)] transition-all active:scale-95 disabled:opacity-50"
            >
              <Plus size={14} /> Provision Bot
            </button>
          ) : null}
        </div>
        </section>

        {!activeWorkspace?.workspace_id ? (
          <div className="mb-8 rounded-[1.5rem] border border-dashed border-[var(--glass-border)] bg-[var(--glass-surface)] p-8 text-sm text-[var(--muted)] backdrop-blur-xl">
            Select a workspace first. To create a new bot, also select a project. The current flow is{" "}
            <span className="font-medium">workspace -&gt; project -&gt; integration -&gt; campaign -&gt; bot</span>.
          </div>
        ) : null}

        <div className="mb-16">
          <h2 className="mb-6 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
            Live Network
          </h2>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
            {activeBots.map((bot) => (
              <BotCard key={bot.id} bot={bot} />
            ))}
            {activeBots.length === 0 && !loading ? (
              <div className="col-span-full flex flex-col items-center justify-center rounded-[3rem] border border-dashed border-[var(--glass-border)] bg-[var(--glass-surface)] py-20 text-[var(--muted)] backdrop-blur-xl">
                <Activity size={48} className="mb-4 opacity-10" />
                <span className="text-[10px] font-black uppercase tracking-[0.3em]">
                  No Active Bot Logic
                </span>
              </div>
            ) : null}
          </div>
        </div>

        {inactiveBots.length > 0 ? (
          <div className="border-t border-[var(--glass-border)] pt-12">
            <h2 className="mb-6 text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
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
          <div className="border-t border-[var(--glass-border)] pt-12">
            <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
              Disconnected / No Project
            </h2>
            <p className="mb-6 max-w-2xl text-sm text-[var(--muted)]">
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
          <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-[rgba(6,8,20,0.45)] text-white backdrop-blur-md">
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
        <EditBotModal
          isOpen={isEditModalOpen}
          onClose={() => {
            setIsEditModalOpen(false);
            setEditingBot(null);
          }}
          bot={editingBot}
          onSuccess={load}
        />
      </div>
      )}
    </DashboardLayout>
  );
}
