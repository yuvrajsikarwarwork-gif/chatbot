import { useRouter } from "next/router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, LogOut, Mail, PencilLine, ShieldCheck, User } from "lucide-react";

import { authService } from "../../services/authService";
import { botService } from "../../services/botService";
import { projectService, type ProjectSummary } from "../../services/projectService";
import { userAdminService } from "../../services/userAdminService";
import NotificationBell from "../notifications/NotificationBell";
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

  const isPlatformRoute = useMemo(
    () =>
      [
        "/workspaces",
        "/workspaces/[workspaceId]",
        "/workspaces/[workspaceId]/billing",
        "/workspaces/[workspaceId]/members-access",
        "/workspaces/[workspaceId]/support-access",
        "/settings",
        "/plans",
        "/logs",
        "/system-settings",
        "/users-access/roles",
        "/users-access/platform-users",
        "/permissions",
        "/support/tickets",
      ].includes(router.pathname),
    [router.pathname]
  );

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
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-border-main bg-surface px-6">
      <div className="flex min-w-0 items-center gap-4">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            {topRibbonLabel}
          </div>
          <div className="truncate text-xl font-bold tracking-tight text-text-main md:text-2xl">
            {routeLabel}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <NotificationBell />
        {!isPlatformRoute && activeWorkspaceMemberships.length > 1 ? (
          <select
            value={activeWorkspace?.workspace_id || activeWorkspaceMemberships[0]?.workspace_id || ""}
            onChange={(event) => handleWorkspaceChange(event.target.value)}
            className="max-w-[14rem] rounded-md border border-border-main bg-surface px-3 py-2 text-xs font-medium text-text-main outline-none"
          >
            {activeWorkspaceMemberships.map((membership) => (
                <option key={membership.workspace_id} value={membership.workspace_id}>
                  {membership.workspace_name || membership.workspace_id}
                </option>
            ))}
          </select>
        ) : null}

        {!isPlatformRoute && activeWorkspace?.workspace_id && projects.length > 0 ? (
          <select
            value={activeProject?.id || projects.find((project) => project.is_default)?.id || projects[0]?.id || ""}
            onChange={(event) => handleProjectChange(event.target.value)}
            className="max-w-[14rem] rounded-md border border-border-main bg-surface px-3 py-2 text-xs font-medium text-text-main outline-none"
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        ) : null}

        {!isPlatformRoute && activeWorkspace?.workspace_id ? (
          <select
            value={selectedBotId || bots[0]?.id || ""}
            onChange={(event) => setSelectedBotId(event.target.value || null)}
            className="max-w-[14rem] rounded-md border border-border-main bg-surface px-3 py-2 text-xs font-medium text-text-main outline-none"
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
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border-main bg-surface text-sm font-semibold text-text-main"
          >
            {(user?.name || "A")
              .split(" ")
              .map((part) => part[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()}
          </button>

          {profileOpen ? (
            <div className="absolute right-0 top-12 z-50 w-[340px] overflow-hidden rounded-xl border border-border-main bg-surface p-4 shadow-lg">
              <div className="flex items-start justify-between gap-3">
                <div className="relative">
                  <div className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                    Profile
                  </div>
                  <div className="mt-1 text-lg font-bold text-text-main">
                    {user?.name || "Unnamed User"}
                  </div>
                  <div className="mt-1 text-sm text-text-muted">{user?.email || "No email"}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingProfile((value) => !value)}
                  className="relative rounded-md border border-border-main bg-surface p-2 text-text-main"
                >
                  <PencilLine size={14} />
                </button>
              </div>

              <div className="mt-4 space-y-3 rounded-lg border border-border-main bg-canvas p-4 text-sm text-text-main">
                <div className="flex items-center gap-2"><ShieldCheck size={14} /> Role: {workspaceRoleLabel}</div>
                <div className="flex items-center gap-2"><Mail size={14} /> Email: {user?.email || "n/a"}</div>
                <div className="flex items-center gap-2"><User size={14} /> Workspace: {isPlatformRoute ? "Platform scope" : workspaceLabel}</div>
                <div className="flex items-center gap-2"><User size={14} /> Project: {isPlatformRoute ? "Not pinned" : activeProject?.name || "None"}</div>
              </div>

              {editingProfile ? (
                <div className="mt-4 space-y-3">
                  <input
                    className="w-full rounded-lg border border-border-main bg-canvas px-4 py-3 text-sm text-text-main outline-none"
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
                    className="w-full rounded-lg bg-text-main px-4 py-3 text-xs font-bold uppercase text-surface transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {profileSaving ? "Saving..." : "Save profile"}
                  </button>
                </div>
              ) : null}

              <button
                type="button"
                onClick={handleLogout}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-border-main bg-transparent px-4 py-3 text-xs font-bold uppercase text-text-main"
              >
                <LogOut size={14} />
                Logout
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
