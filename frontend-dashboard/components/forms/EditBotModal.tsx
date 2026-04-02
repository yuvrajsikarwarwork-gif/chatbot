import { useEffect, useState } from "react";
import { Loader2, Save, X } from "lucide-react";

import { botService } from "../../services/botService";
import { projectService, type ProjectSummary } from "../../services/projectService";
import { notify } from "../../store/uiStore";
import { useAuthStore } from "../../store/authStore";

type BotSettingsForm = {
  fallbackMessage: string;
  optOutMessage: string;
  globalFallbackNodeId: string;
};

function mergeSettingsSources(...sources: any[]) {
  return sources.reduce((acc, source) => {
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      return acc;
    }
    return { ...acc, ...source };
  }, {});
}

function readBotSettings(settingsJson: any): BotSettingsForm {
  const settings = settingsJson && typeof settingsJson === "object" ? settingsJson : {};
  const systemMessages =
    settings.system_messages && typeof settings.system_messages === "object"
      ? settings.system_messages
      : settings.systemMessages && typeof settings.systemMessages === "object"
        ? settings.systemMessages
        : settings.systemDefaultMessages && typeof settings.systemDefaultMessages === "object"
          ? settings.systemDefaultMessages
          : settings.system_default_messages && typeof settings.system_default_messages === "object"
            ? settings.system_default_messages
            : {};

  return {
    fallbackMessage: String(
      systemMessages.fallback_message ||
        systemMessages.fallbackMessage ||
        settings.fallback_message ||
        settings.fallbackMessage ||
        settings.error_message ||
        settings.errorMessage ||
        "I didn't quite understand that. Can you rephrase?"
    ).trim(),
    optOutMessage: String(
      systemMessages.opt_out_message ||
        systemMessages.optOutMessage ||
        settings.opt_out_message ||
        settings.optOutMessage ||
        "You have been unsubscribed and will no longer receive messages."
    ).trim(),
    globalFallbackNodeId: String(
      settings.global_fallback_node_id ||
        settings.globalFallbackNodeId ||
        settings.system_fallback_node_id ||
        settings.systemFallbackNodeId ||
        settings.error_node_id ||
        settings.errorNodeId ||
        settings.fallback_node_id ||
        settings.fallbackNodeId ||
        ""
    ).trim(),
  };
}

interface EditBotModalProps {
  isOpen: boolean;
  onClose: () => void;
  bot: any;
  onSuccess: () => void;
}

export default function EditBotModal({ isOpen, onClose, bot, onSuccess }: EditBotModalProps) {
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);
  const [name, setName] = useState("");
  const [keywords, setKeywords] = useState("");
  const [projectId, setProjectId] = useState("");
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [resolvedBot, setResolvedBot] = useState<any>(bot);
  const [settings, setSettings] = useState<BotSettingsForm>({
    fallbackMessage: "",
    optOutMessage: "",
    globalFallbackNodeId: "",
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (bot && isOpen) {
      setResolvedBot(bot);
      setName(bot.name || "");
      setKeywords(bot.trigger_keywords || "");
      setProjectId(bot.project_id ?? "");
      setSettings(readBotSettings(mergeSettingsSources(bot.settings, bot.settings_json, bot.global_settings)));
    }
  }, [bot, isOpen]);

  useEffect(() => {
    if (!isOpen || !bot?.id) {
      return;
    }

    botService
      .getBot(bot.id)
      .then((freshBot) => {
        if (!freshBot) return;
        setResolvedBot(freshBot);
        setSettings(readBotSettings(mergeSettingsSources(freshBot.settings, freshBot.settings_json, freshBot.global_settings)));
        setName(freshBot.name || bot.name || "");
        setKeywords(freshBot.trigger_keywords || bot.trigger_keywords || "");
        setProjectId(freshBot.project_id ?? bot.project_id ?? "");
      })
      .catch((err) => {
        console.error("Failed to hydrate bot details for editor", err);
      });
  }, [bot?.id, isOpen]);

  useEffect(() => {
    if (!isOpen || !activeWorkspace?.workspace_id) {
      setProjects([]);
      return;
    }

    projectService
      .list(activeWorkspace.workspace_id)
      .then((rows) => setProjects(rows))
      .catch((err) => {
        console.error("Failed to load projects for bot editor", err);
        setProjects([]);
      });
  }, [isOpen, activeWorkspace?.workspace_id]);

  if (!isOpen || !bot) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      const currentBot = resolvedBot || bot;
      const nextWorkspaceId = activeWorkspace?.workspace_id || currentBot?.workspace_id || "";
      const nextProjectId = projectId || "";
      const initialWorkspaceId = String(currentBot?.workspace_id || "");
      const initialProjectId = String(currentBot?.project_id || "");

      const nextSettingsJson = {
        ...mergeSettingsSources(
          bot?.settings,
          bot?.settings_json,
          bot?.global_settings,
          resolvedBot?.settings,
          resolvedBot?.settings_json,
          resolvedBot?.global_settings
        ),
        system_messages: {
          fallback_message: settings.fallbackMessage || null,
          opt_out_message: settings.optOutMessage || null,
        },
        global_fallback_node_id: settings.globalFallbackNodeId || null,
        globalFallbackNodeId: settings.globalFallbackNodeId || null,
        error_node_id: settings.globalFallbackNodeId || null,
        fallback_message: settings.fallbackMessage || null,
        opt_out_message: settings.optOutMessage || null,
      };

      const updatePayload: Record<string, unknown> = {
        name,
        trigger_keywords: keywords,
        globalSettings: nextSettingsJson,
        settingsJson: nextSettingsJson,
      };

      if (nextWorkspaceId && nextWorkspaceId !== initialWorkspaceId) {
        updatePayload.workspaceId = nextWorkspaceId;
      }

      if (nextProjectId !== initialProjectId) {
        updatePayload.projectId = nextProjectId || null;
      }

      await botService.updateBot(bot.id, updatePayload as any);
      onSuccess();
      onClose();
    } catch (err) {
      console.error("Update failed", err);
      notify("Failed to update bot settings.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 flex h-[94vh] max-h-[94vh] w-full max-w-2xl flex-col overflow-hidden rounded-[2rem] border border-border-main bg-surface shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between border-b border-border-main bg-surface p-6">
          <div>
            <h2 className="font-black uppercase tracking-tighter text-text-main">Edit Instance</h2>
            <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">ID: {bot.id}</p>
          </div>

          <button onClick={onClose} className="rounded-full p-2 transition-colors hover:bg-primary-fade">
            <X size={20} className="text-text-muted" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-5 overflow-y-auto p-8">
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">
                Instance Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-2xl border border-border-main bg-canvas px-5 py-3 text-sm font-bold text-text-main outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">
                Trigger Keywords
              </label>
              <input
                type="text"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                className="w-full rounded-2xl border border-border-main bg-canvas px-5 py-3 text-sm font-bold text-text-main outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Project</label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full rounded-2xl border border-border-main bg-canvas px-5 py-3 text-sm font-bold text-text-main outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary"
              >
                <option value="">No project</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-3 rounded-2xl border border-border-main bg-surface p-4">
              <div className="text-[10px] font-black uppercase tracking-widest text-text-muted">
                Runtime Fallbacks
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">
                  Unrecognized Input (Fallback)
                </label>
                <textarea
                  value={settings.fallbackMessage}
                  onChange={(e) => setSettings((current) => ({ ...current, fallbackMessage: e.target.value }))}
                  rows={3}
                  placeholder="What should the bot say if it doesn't understand the user?"
                  className="w-full rounded-2xl border border-border-main bg-canvas px-4 py-3 text-sm font-semibold text-text-main outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">
                  Opt-Out (STOP)
                </label>
                <textarea
                  value={settings.optOutMessage}
                  onChange={(e) => setSettings((current) => ({ ...current, optOutMessage: e.target.value }))}
                  rows={3}
                  placeholder="What should the bot say when a user replies STOP?"
                  className="w-full rounded-2xl border border-border-main bg-canvas px-4 py-3 text-sm font-semibold text-text-main outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">
                  Global Error Fallback Node ID
                </label>
                <input
                  type="text"
                  value={settings.globalFallbackNodeId}
                  onChange={(e) =>
                    setSettings((current) => ({
                      ...current,
                      globalFallbackNodeId: e.target.value,
                    }))
                  }
                  placeholder="primary-error-message"
                  className="w-full rounded-2xl border border-border-main bg-canvas px-4 py-3 text-sm font-semibold text-text-main outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary"
                />
                <p className="text-[11px] leading-5 text-text-muted">
                  When an input or menu exhausts retries, the runtime jumps to this node ID if it exists.
                </p>
              </div>
            </div>
          </div>

          <div className="mx-8 mb-4 flex gap-3 rounded-2xl border border-primary/20 bg-primary-fade p-4">
            <Save className="shrink-0 text-primary" size={18} />
            <p className="text-[10px] font-medium text-text-main">
              System Flows are managed from the new button on each bot card. This form now stays focused on the core bot setup.
            </p>
          </div>

          <div className="shrink-0 border-t border-border-main bg-surface px-8 py-4">
            <button
              type="submit"
              disabled={isSaving}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-xs font-black uppercase tracking-widest text-white transition-opacity hover:opacity-90"
            >
              {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {isSaving ? "Applying Changes..." : "Save Bot Configuration"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
