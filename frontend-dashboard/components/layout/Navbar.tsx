import { useRouter } from "next/router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, LogOut, Mail, PencilLine, ShieldCheck, User } from "lucide-react";

import { authService } from "../../services/authService";
import { botService } from "../../services/botService";
import { projectService, type ProjectSummary } from "../../services/projectService";
import { userAdminService } from "../../services/userAdminService";
import { useAuthStore } from "../../store/authStore";
import { useBotStore } from "../../store/botStore";
import { useVisibility } from "../../hooks/useVisibility";

export default function Navbar() {
  const selectedBotId = useBotStore((s) => s.selectedBotId);
  const setSelectedBotId = useBotStore((s) => s.setSelectedBotId);
  const syncSelectedBot = useBotStore((s) => s.syncSelectedBot);
  const user = useAuthStore((s) => s.user);
  const memberships = useAuthStore((s) => s.memberships);
  const activeWorkspace = useAuthStore((s) => s.activeWorkspace);
  const activeProject = useAuthStore((s) => s.activeProject);
  const setActiveWorkspace = useAuthStore((s) => s.setActiveWorkspace);
  const setActiveProject = useAuthStore((s) => s.setActiveProject);
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [bots, setBots] = useState<Array<{ id: string; name: string; status?: string }>>([]);
  const { isPlatformOperator } = useVisibility();
  const [profileOpen, setProfileOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileName, setProfileName] = useState(user?.name || "");
  const [profileSaving, setProfileSaving] = useState(false);
  const profileRef = useRef<HTMLDivElement | null>(null);

  const handleLogout = async () => {
    setProfileOpen(false);
    setSelectedBotId(null);
    await authService.logout();
    router.replace("/logout");
  };

  const routeLabel = useMemo(() => {
    if (router.pathname === "/templates/[id]/edit") {
      return "Templates/Edit";
    }
    if (router.pathname === "/templates/[id]") {
      return "Templates/View";
    }
    if (router.pathname === "/templates/new") {
      return "Templates/New";
    }

    return (
      router.pathname
        .split("/")
        .filter(Boolean)
        .filter((part) => !/^\[.+\]$/.test(part))
        .flatMap((part) => part.split("-"))
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join("/") || "Dashboard"
    );
  }, [router.pathname]);

  useEffect(() => {
    setProfileName(user?.name || "");
  }, [user?.name]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!profileRef.current) {
        return;
      }

      if (!profileRef.current.contains(event.target as Node)) {
        setProfileOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!activeWorkspace?.workspace_id) {
      setProjects([]);
      setActiveProject(null);
      return;
    }

    projectService
      .list(activeWorkspace.workspace_id)
      .then((rows) => {
        if (cancelled) {
          return;
        }

        setProjects(rows);
        if (
          activeProject &&
          activeProject.workspace_id === activeWorkspace.workspace_id &&
          rows.some((project) => project.id === activeProject.id)
        ) {
          return;
        }

        const nextProject =
          rows.find((project) => project.is_default) || rows[0] || null;
        setActiveProject(
          nextProject
            ? {
                id: nextProject.id,
                workspace_id: nextProject.workspace_id,
                name: nextProject.name,
                status: nextProject.status,
                is_default: nextProject.is_default,
              }
            : null
        );
      })
      .catch((err) => {
        console.error("Failed to load workspace projects", err);
        if (!cancelled) {
          setProjects([]);
          setActiveProject(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeProject, activeWorkspace?.workspace_id, setActiveProject]);

  useEffect(() => {
    let cancelled = false;

    if (!activeWorkspace?.workspace_id) {
      setBots([]);
      setSelectedBotId(null);
      return;
    }

    botService
      .getBots({
        workspaceId: activeWorkspace.workspace_id,
        projectId: activeProject?.id || undefined,
      })
      .then((rows) => {
        if (cancelled) {
          return;
        }

        const nextBots = Array.isArray(rows)
          ? rows.map((bot: any) => ({
              id: String(bot.id),
              name: String(bot.name || bot.id),
              status: bot.status,
            }))
          : [];

        setBots(nextBots);
        syncSelectedBot(nextBots.map((bot) => bot.id));
      })
      .catch((err) => {
        console.error("Failed to load bots for navigation", err);
        if (!cancelled) {
          setBots([]);
          setSelectedBotId(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeWorkspace?.workspace_id, activeProject?.id, setSelectedBotId, syncSelectedBot]);

  const handleProjectChange = (projectId: string) => {
    const nextProject = projects.find((project) => project.id === projectId) || null;
    setActiveProject(
      nextProject
        ? {
            id: nextProject.id,
            workspace_id: nextProject.workspace_id,
            name: nextProject.name,
            status: nextProject.status,
            is_default: nextProject.is_default,
          }
        : null
    );
    setSelectedBotId(null);

    if (!nextProject) {
      return;
    }

    const currentPath = router.pathname;
    if (currentPath === "/projects/[projectId]") {
      router.replace(`/projects/${nextProject.id}`).catch(() => undefined);
      return;
    }

    if (currentPath === "/projects/[projectId]/settings") {
      router.replace(`/projects/${nextProject.id}/settings`).catch(() => undefined);
      return;
    }

    if (currentPath === "/projects/[projectId]/members") {
      router.replace("/users-access/members").catch(() => undefined);
      return;
    }

    if (currentPath.startsWith("/campaigns/[campaignId]")) {
      router.replace("/campaigns").catch(() => undefined);
    }
  };

  const handleWorkspaceChange = (workspaceId: string) => {
    setActiveWorkspace(workspaceId);
    setSelectedBotId(null);
    setActiveProject(null);

    const currentPath = router.pathname;
    if (
      currentPath.startsWith("/projects/[projectId]") ||
      currentPath.startsWith("/campaigns/[campaignId]") ||
      currentPath === "/integrations" ||
      currentPath === "/bots" ||
      currentPath === "/flows" ||
      currentPath === "/leads" ||
      currentPath === "/inbox" ||
      currentPath === "/conversations"
    ) {
      router.replace("/projects").catch(() => undefined);
      return;
    }

    if (currentPath.startsWith("/workspaces/[workspaceId]")) {
      router.replace(`/workspaces/${workspaceId}`).catch(() => undefined);
    }
  };

  const activeWorkspaceMemberships = useMemo(
    () => memberships.filter((membership) => membership.status === "active"),
    [memberships]
  );

  const workspaceRoleLabel = useMemo(() => {
    if (isPlatformOperator) {
      return user?.role === "developer" ? "Developer" : "Super Admin";
    }

    const rawRole =
      activeWorkspace?.role ||
      activeWorkspaceMemberships.find(
        (membership) => membership.workspace_id === activeWorkspace?.workspace_id
      )?.role ||
      user?.role ||
      "user";

    return String(rawRole)
      .replace(/_/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }, [activeWorkspace?.role, activeWorkspace?.workspace_id, activeWorkspaceMemberships, isPlatformOperator, user?.role]);

  const workspaceLabel =
    activeWorkspace?.workspace_name ||
    activeWorkspaceMemberships.find(
      (membership) => membership.workspace_id === activeWorkspace?.workspace_id
    )?.workspace_name ||
    "None";
  const topRibbonLabel =
    activeWorkspace?.workspace_name ||
    (isPlatformOperator ? "Platform" : "Workspace");

  return (
    <nav className="sticky top-0 z-40 flex min-h-[5rem] items-center justify-between rounded-[1.75rem] border border-[var(--glass-border)] bg-[var(--glass-surface)] px-4 shadow-[var(--shadow-soft)] backdrop-blur-2xl md:px-6">
      <div className="flex min-w-0 items-center gap-4">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--muted)]">
            {topRibbonLabel}
          </div>
          <div className="truncate bg-[linear-gradient(180deg,var(--text),color-mix(in_srgb,var(--text)_70%,var(--accent)_30%))] bg-clip-text text-xl font-black tracking-[-0.03em] text-transparent md:text-2xl">
            {routeLabel}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {activeWorkspaceMemberships.length > 1 ? (
          <select
            value={activeWorkspace?.workspace_id || activeWorkspaceMemberships[0]?.workspace_id || ""}
            onChange={(event) => handleWorkspaceChange(event.target.value)}
            className="max-w-[14rem] rounded-full border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] px-3 py-2 text-xs font-medium text-[var(--text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.32)] outline-none"
          >
            {activeWorkspaceMemberships.map((membership) => (
                <option key={membership.workspace_id} value={membership.workspace_id}>
                  {membership.workspace_name || membership.workspace_id}
                </option>
            ))}
          </select>
        ) : null}

        {activeWorkspace?.workspace_id && projects.length > 0 ? (
          <select
            value={activeProject?.id || projects.find((project) => project.is_default)?.id || projects[0]?.id || ""}
            onChange={(event) => handleProjectChange(event.target.value)}
            className="max-w-[14rem] rounded-full border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] px-3 py-2 text-xs font-medium text-[var(--text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.32)] outline-none"
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        ) : null}

        {activeWorkspace?.workspace_id ? (
          <select
            value={selectedBotId || bots[0]?.id || ""}
            onChange={(event) => setSelectedBotId(event.target.value || null)}
            className="max-w-[14rem] rounded-full border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] px-3 py-2 text-xs font-medium text-[var(--text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.32)] outline-none"
          >
            {bots.length === 0 ? (
              <option value="">No bots</option>
            ) : (
              bots.map((bot) => (
                <option key={bot.id} value={bot.id}>
                  {bot.name}
                </option>
              ))
            )}
          </select>
        ) : null}

        <div ref={profileRef} className="relative">
          <button
            type="button"
            onClick={() => setProfileOpen((value) => !value)}
            className="flex items-center gap-2 rounded-full border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] px-2 py-2 text-xs font-semibold text-[var(--text)] shadow-[var(--shadow-soft)] transition duration-300 hover:-translate-y-0.5"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--glass-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.85),rgba(224,231,255,0.5))] text-xs font-semibold text-slate-900 shadow-[0_12px_28px_rgba(99,102,241,0.18)]">
              {(user?.name || "YS")
                .split(" ")
                .map((part) => part[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </div>
            <ChevronDown size={14} className="text-[var(--muted)]" />
          </button>

          {profileOpen ? (
            <div className="absolute right-0 top-14 z-50 w-[340px] overflow-hidden rounded-[1.5rem] border border-[var(--glass-border)] bg-[var(--glass-surface)] p-4 shadow-[var(--shadow-glass)] backdrop-blur-2xl">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.2),transparent_58%)]" />
              <div className="flex items-start justify-between gap-3">
                <div className="relative">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
                    Profile
                  </div>
                  <div className="mt-2 text-lg font-black tracking-[-0.02em] text-[var(--text)]">
                    {user?.name || "Unnamed User"}
                  </div>
                  <div className="mt-1 text-sm text-[var(--muted)]">{user?.email || "No email"}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingProfile((value) => !value)}
                  className="relative rounded-xl border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] p-2 text-[var(--text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.28)] transition hover:border-[var(--line-strong)]"
                >
                  <PencilLine size={14} />
                </button>
              </div>

              <div className="mt-4 space-y-3 rounded-[1.15rem] border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] p-4 text-sm text-[var(--text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]">
                <div className="flex items-center gap-2"><ShieldCheck size={14} /> Role: {workspaceRoleLabel}</div>
                <div className="flex items-center gap-2"><Mail size={14} /> Email: {user?.email || "n/a"}</div>
                <div className="flex items-center gap-2"><User size={14} /> Workspace: {workspaceLabel}</div>
                <div className="flex items-center gap-2"><User size={14} /> Project: {activeProject?.name || "None"}</div>
              </div>

              {editingProfile ? (
                <div className="mt-4 space-y-3">
                  <input
                    className="w-full rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] px-4 py-3 text-sm text-[var(--text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.28)] outline-none"
                    value={profileName}
                    onChange={(event) => setProfileName(event.target.value)}
                    placeholder="Your name"
                  />
                  <button
                    type="button"
                    disabled={profileSaving || !profileName.trim()}
                    onClick={async () => {
                      try {
                        setProfileSaving(true);
                        const updated = await userAdminService.updateProfile({ name: profileName.trim() });
                        useAuthStore.setState((state) => ({
                          user: state.user
                            ? { ...state.user, name: updated.name, email: updated.email, role: updated.role }
                            : state.user,
                        }));
                        setEditingProfile(false);
                      } catch (err) {
                        console.error("Failed to update profile", err);
                      } finally {
                        setProfileSaving(false);
                      }
                    }}
                    className="w-full rounded-2xl bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] px-4 py-3 text-[11px] font-black uppercase tracking-[0.18em] text-white shadow-[0_18px_30px_var(--accent-glow)] transition duration-300 hover:-translate-y-0.5 disabled:opacity-60"
                  >
                    {profileSaving ? "Saving..." : "Save profile"}
                  </button>
                </div>
              ) : null}

              <button
                type="button"
                onClick={handleLogout}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] px-4 py-3 text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text)] transition duration-300 hover:border-[var(--line-strong)] hover:bg-[var(--surface-muted)]"
              >
                <LogOut size={14} />
                Logout
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </nav>
  );
}
