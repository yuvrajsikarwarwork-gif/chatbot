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
  const setActiveProject = useAuthStore((state) => state.setActiveProject);
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
      const targetProjectId = formData.project_id || activeProject?.id || "";
      await botService.createBot({
        name: formData.bot_name,
        trigger_keywords: formData.trigger_keywords,
        workspaceId: activeWorkspace?.workspace_id || null,
        projectId: targetProjectId || null,
      });
      if (targetProjectId && targetProjectId !== activeProject?.id) {
        const selected = projects.find((project) => project.id === targetProjectId);
        if (selected) {
          setActiveProject({
            id: selected.id,
            workspace_id: selected.workspace_id,
            name: selected.name,
            status: selected.status,
            is_default: selected.is_default,
          });
        }
      }
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-lg overflow-hidden rounded-[2rem] border border-border-main bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border-main bg-surface p-6">
          <div>
            <h2 className="text-lg font-black uppercase tracking-tight text-text-main">
              Provision Agent
            </h2>
            <p className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-text-muted">
              Reusable Bot Logic
            </p>
          </div>
          <button onClick={onClose} className="text-text-muted transition hover:text-text-main">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 p-8">
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-text-muted">
                Agent Name
              </label>
              <input
                required
                className="w-full rounded-xl border border-border-main bg-canvas p-3 text-sm font-bold text-text-main outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                value={formData.bot_name}
                onChange={(e) =>
                  setFormData({ ...formData, bot_name: e.target.value })
                }
              />
            </div>

            <div>
              <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-text-muted">
                Trigger Keywords (Comma Separated)
              </label>
              <input
                required
                placeholder="e.g., support, help, sales"
                className="w-full rounded-xl border border-border-main bg-canvas p-3 text-sm font-bold text-text-main outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                value={formData.trigger_keywords}
                onChange={(e) =>
                  setFormData({ ...formData, trigger_keywords: e.target.value })
                }
              />
            </div>

            <div className="rounded-2xl border border-border-main bg-canvas p-4">
              <div className="text-[10px] font-black uppercase tracking-widest text-text-muted">
                Workspace Context
              </div>
              <div className="mt-2 text-sm font-semibold text-text-main">
                {activeWorkspace?.workspace_name || activeWorkspace?.workspace_id || "Personal"}
              </div>
              <div className="mt-3">
                <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-text-muted">
                  Project
                </label>
                <select
                  value={formData.project_id}
                  onChange={(e) =>
                    setFormData({ ...formData, project_id: e.target.value })
                  }
                  disabled={!activeWorkspace?.workspace_id || loadingProjects}
                  className="w-full rounded-xl border border-border-main bg-canvas p-3 text-sm font-bold text-text-main outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
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

            <div className="rounded-2xl border border-primary/20 bg-primary-fade p-4 text-[10px] font-medium text-text-main">
              Platform credentials are no longer stored on the bot. Create a campaign
              channel to connect this bot to WhatsApp, website, Instagram, Facebook,
              API, or Telegram.
            </div>
          </div>

          <div className="flex gap-4 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-border-main bg-transparent px-4 py-3 text-xs font-black text-text-main transition-all hover:bg-primary-fade hover:text-primary hover:border-primary/30"
            >
              CANCEL
            </button>
            <button
              type="submit"
              disabled={loading || !activeWorkspace?.workspace_id || !(formData.project_id || activeProject?.id)}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-xs font-black text-white transition-opacity hover:opacity-90"
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

