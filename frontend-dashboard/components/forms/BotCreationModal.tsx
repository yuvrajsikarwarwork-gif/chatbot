import { useEffect, useState } from "react";
import { X, Clock, Rocket } from "lucide-react";

import { botService } from "../../services/botService";
import { projectService, type ProjectSummary } from "../../services/projectService";
import { notify } from "../../store/uiStore";
import { useAuthStore } from "../../store/authStore";

interface BotCreationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function BotCreationModal({
  isOpen,
  onClose,
  onSuccess,
}: BotCreationModalProps) {
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);
  const activeProject = useAuthStore((state) => state.activeProject);
  const [formData, setFormData] = useState({
    bot_name: "",
    trigger_keywords: "",
    project_id: "",
  });
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setFormData((current) => ({
      ...current,
      project_id: activeProject?.id || "",
    }));

    if (!activeWorkspace?.workspace_id) {
      setProjects([]);
      return;
    }

    setLoadingProjects(true);
    projectService
      .list(activeWorkspace.workspace_id)
      .then((rows) => setProjects(rows))
      .catch((err) => {
        console.error("Failed to load bot projects", err);
        setProjects([]);
      })
      .finally(() => setLoadingProjects(false));
  }, [isOpen, activeWorkspace?.workspace_id, activeProject?.id]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspace?.workspace_id || !(formData.project_id || activeProject?.id)) {
      notify("Select a workspace project before provisioning a bot.", "error");
      return;
    }
    setLoading(true);
    try {
      await botService.createBot({
        name: formData.bot_name,
        trigger_keywords: formData.trigger_keywords,
        workspaceId: activeWorkspace?.workspace_id || null,
        projectId: formData.project_id || activeProject?.id || null,
      });
      onSuccess();
      onClose();
    } catch (err) {
      console.error("Creation failed", err);
      notify("Failed to provision bot.", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(6,8,20,0.55)] backdrop-blur-md">
      <div className="w-full max-w-lg overflow-hidden rounded-[2rem] border border-[var(--glass-border)] bg-[var(--glass-surface)] shadow-[var(--shadow-glass)] backdrop-blur-2xl">
        <div className="flex items-center justify-between border-b border-[var(--glass-border)] bg-[var(--glass-surface-strong)] p-6">
          <div>
            <h2 className="text-lg font-black uppercase tracking-tight text-[var(--text)]">
              Provision Agent
            </h2>
            <p className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">
              Reusable Bot Logic
            </p>
          </div>
          <button onClick={onClose} className="text-[var(--muted)] transition hover:text-[var(--text)]">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 p-8">
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">
                Agent Name
              </label>
              <input
                required
                className="w-full rounded-xl border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] p-3 text-sm font-bold text-[var(--text)] outline-none focus:border-[var(--line-strong)]"
                value={formData.bot_name}
                onChange={(e) =>
                  setFormData({ ...formData, bot_name: e.target.value })
                }
              />
            </div>

            <div>
              <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">
                Trigger Keywords (Comma Separated)
              </label>
              <input
                required
                placeholder="e.g., support, help, sales"
                className="w-full rounded-xl border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] p-3 text-sm font-bold text-[var(--text)] outline-none focus:border-[var(--line-strong)]"
                value={formData.trigger_keywords}
                onChange={(e) =>
                  setFormData({ ...formData, trigger_keywords: e.target.value })
                }
              />
            </div>

            <div className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]">
              <div className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">
                Workspace Context
              </div>
              <div className="mt-2 text-sm font-semibold text-[var(--text)]">
                {activeWorkspace?.workspace_name || activeWorkspace?.workspace_id || "Personal"}
              </div>
              <div className="mt-3">
                <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">
                  Project
                </label>
                <select
                  value={formData.project_id}
                  onChange={(e) =>
                    setFormData({ ...formData, project_id: e.target.value })
                  }
                  disabled={!activeWorkspace?.workspace_id || loadingProjects}
                  className="w-full rounded-xl border border-[var(--glass-border)] bg-[var(--glass-surface)] p-3 text-sm font-bold text-[var(--text)] outline-none focus:border-[var(--line-strong)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="">
                    {loadingProjects
                      ? "Loading projects..."
                      : activeWorkspace?.workspace_id
                        ? "Select project"
                        : "No workspace selected"}
                  </option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="rounded-2xl border border-cyan-300/25 bg-cyan-500/10 p-4 text-[10px] font-medium text-[var(--text)]">
              Platform credentials are no longer stored on the bot. Create a campaign
              channel to connect this bot to WhatsApp, website, Instagram, Facebook,
              API, or Telegram.
            </div>
          </div>

          <div className="flex gap-4 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] px-4 py-3 text-xs font-black text-[var(--muted)]"
            >
              CANCEL
            </button>
            <button
              type="submit"
              disabled={loading || !activeWorkspace?.workspace_id || !(formData.project_id || activeProject?.id)}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-[rgba(129,140,248,0.35)] bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] px-4 py-3 text-xs font-black text-white shadow-[0_18px_30px_var(--accent-glow)]"
            >
              {loading ? <Clock size={14} className="animate-spin" /> : <Rocket size={14} />}{" "}
              LAUNCH
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
