import { useEffect, useState } from "react";
import { X, Loader2, Save, Info } from "lucide-react";

import { botService } from "../../services/botService";
import { projectService, type ProjectSummary } from "../../services/projectService";
import { notify } from "../../store/uiStore";
import { useAuthStore } from "../../store/authStore";

interface EditBotModalProps {
  isOpen: boolean;
  onClose: () => void;
  bot: any;
  onSuccess: () => void;
}

export default function EditBotModal({
  isOpen,
  onClose,
  bot,
  onSuccess,
}: EditBotModalProps) {
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);
  const activeProject = useAuthStore((state) => state.activeProject);
  const [name, setName] = useState("");
  const [keywords, setKeywords] = useState("");
  const [projectId, setProjectId] = useState("");
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (bot && isOpen) {
      setName(bot.name || "");
      setKeywords(bot.trigger_keywords || "");
      setProjectId(bot.project_id ?? "");
    }
  }, [bot, isOpen]);

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
      await botService.updateBot(bot.id, {
        name,
        trigger_keywords: keywords,
        workspaceId: activeWorkspace?.workspace_id || bot.workspace_id || null,
        projectId: projectId || null,
      });

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
      <div
        className="absolute inset-0 bg-[rgba(6,8,20,0.55)] backdrop-blur-md"
        onClick={onClose}
      />

      <div className="relative z-10 max-h-[70vh] w-full max-w-lg overflow-hidden rounded-[2rem] border border-[var(--glass-border)] bg-[var(--glass-surface)] shadow-[var(--shadow-glass)] backdrop-blur-2xl animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between border-b border-[var(--glass-border)] bg-[var(--glass-surface-strong)] p-6">
          <div>
            <h2 className="font-black uppercase tracking-tighter text-[var(--text)]">
              Edit Instance
            </h2>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">
              ID: {bot.id}
            </p>
          </div>

          <button
            onClick={onClose}
            className="rounded-full p-2 transition-colors hover:bg-[var(--glass-surface)]"
          >
            <X size={20} className="text-[var(--muted)]" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="max-h-[70vh] space-y-5 overflow-y-auto p-8"
        >
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">
              Instance Name
            </label>

            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] px-5 py-3 text-sm font-bold text-[var(--text)] outline-none transition-all focus:border-[var(--line-strong)]"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">
              Trigger Keywords
            </label>

            <input
              type="text"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              className="w-full rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] px-5 py-3 text-sm font-bold text-[var(--text)] outline-none transition-all focus:border-[var(--line-strong)]"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">
              Project
            </label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] px-5 py-3 text-sm font-bold text-[var(--text)] outline-none transition-all focus:border-[var(--line-strong)]"
            >
              <option value="">No project</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 rounded-2xl border border-amber-300/30 bg-amber-500/10 p-4">
            <Info className="shrink-0 text-amber-300" size={18} />

            <p className="text-[10px] font-medium text-[var(--text)]">
              Platform credentials now belong to campaign channels. Editing a bot
              changes reusable logic metadata and its project attachment.
            </p>
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[rgba(129,140,248,0.35)] bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] py-4 text-xs font-black uppercase tracking-widest text-white shadow-[0_18px_30px_var(--accent-glow)] transition-all hover:-translate-y-0.5"
          >
            {isSaving ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Save size={16} />
            )}

            {isSaving ? "Applying Changes..." : "Save Bot Configuration"}
          </button>
        </form>
      </div>
    </div>
  );
}
