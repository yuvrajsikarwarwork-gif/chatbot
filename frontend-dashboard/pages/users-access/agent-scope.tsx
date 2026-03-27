import { useEffect, useMemo, useState } from "react";

import PageAccessNotice from "../../components/access/PageAccessNotice";
import UsersAccessTabs from "../../components/access/UsersAccessTabs";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { useVisibility } from "../../hooks/useVisibility";
import { EMPTY_SCOPE, PLATFORM_OPTIONS, normalizeScope, normalizeSkills, toggleArrayValue } from "../../lib/accessAdmin";
import { campaignService, type CampaignSummary } from "../../services/campaignService";
import { refreshPermissionSnapshot } from "../../services/permissionSnapshotService";
import { projectService, type ProjectSummary } from "../../services/projectService";
import { workspaceMembershipService, type WorkspaceMember } from "../../services/workspaceMembershipService";
import { useAuthStore } from "../../store/authStore";

export default function UsersAccessAgentScopePage() {
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);
  const hasWorkspacePermission = useAuthStore((state) => state.hasWorkspacePermission);
  const { canViewPage } = useVisibility();
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [scope, setScope] = useState(EMPTY_SCOPE);
  const [skills, setSkills] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const activeWorkspaceId = activeWorkspace?.workspace_id || "";
  const canViewUsersAccessPage = canViewPage("users_access");
  const canManageAgentScope = activeWorkspaceId
    ? hasWorkspacePermission(activeWorkspaceId, "manage_users") ||
      hasWorkspacePermission(activeWorkspaceId, "manage_permissions")
    : false;

  useEffect(() => {
    if (!activeWorkspaceId || !canManageAgentScope) {
      setMembers([]);
      setProjects([]);
      setCampaigns([]);
      return;
    }

    setLoading(true);
    setError("");
    Promise.all([
      workspaceMembershipService.list(activeWorkspaceId),
      projectService.list(activeWorkspaceId),
      campaignService.list({ workspaceId: activeWorkspaceId }),
    ])
      .then(([memberRows, projectRows, campaignRows]) => {
        setMembers(memberRows);
        setProjects(projectRows);
        setCampaigns(campaignRows);
        setSelectedMemberId((current) =>
          memberRows.some((member) => member.user_id === current)
            ? current
            : memberRows[0]?.user_id || ""
        );
      })
      .catch((err: any) => {
        console.error("Failed to load scope data", err);
        setMembers([]);
        setProjects([]);
        setCampaigns([]);
        setError(err?.response?.data?.error || "Failed to load agent scope data");
      })
      .finally(() => setLoading(false));
  }, [activeWorkspaceId, canManageAgentScope]);

  const selectedMember = useMemo(
    () => members.find((member) => member.user_id === selectedMemberId) || null,
    [members, selectedMemberId]
  );

  useEffect(() => {
    if (!selectedMember) {
      setScope(EMPTY_SCOPE);
      setSkills("");
      return;
    }

    setScope(normalizeScope(selectedMember.agent_scope));
    setSkills(normalizeSkills(selectedMember.agent_skills).join(", "));
  }, [selectedMember]);

  const visibleCampaigns = useMemo(
    () =>
      campaigns.filter(
        (campaign) =>
          scope.projectIds.length === 0 ||
          scope.projectIds.includes(String(campaign.project_id || campaign.projectId || ""))
      ),
    [campaigns, scope.projectIds]
  );

  const handleSave = async () => {
    if (!activeWorkspaceId || !selectedMember) {
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");
      const nextSkills = skills
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      await workspaceMembershipService.upsert(activeWorkspaceId, {
        userId: selectedMember.user_id,
        email: selectedMember.email,
        role: selectedMember.role,
        status: selectedMember.status,
        permissionsJson: {
          agent_skills: nextSkills,
        },
        agentScope: scope,
        agentSkills: nextSkills,
      });
      await refreshPermissionSnapshot();
      const rows = await workspaceMembershipService.list(activeWorkspaceId);
      setMembers(rows);
      setSuccess("Agent scope updated.");
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to update agent scope");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout>
      {!canViewUsersAccessPage ? (
        <PageAccessNotice
          title="Agent scope is restricted for this role"
          description="Open this page through users and permissions with workspace member-management access."
          href="/users-access"
          ctaLabel="Open users and permissions"
        />
      ) : !canManageAgentScope ? (
        <PageAccessNotice
          title="Agent scope requires additional access"
          description="This screen requires `manage_users` or `manage_permissions` because agent routing scope is part of member administration."
          href="/users-access"
          ctaLabel="Open access hub"
        />
      ) : (
        <div className="mx-auto max-w-7xl space-y-6">
          <UsersAccessTabs activeHref="/users-access/agent-scope" />
          <section className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)]">
            <div className="max-w-3xl">
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
                Agent Scope
              </div>
              <h1 className="mt-3 text-[1.6rem] font-semibold tracking-tight text-[var(--text)]">
                Scoped operational reach
              </h1>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                Limit agents by project, campaign, platform, and optional channel ids without changing their base workspace role.
              </p>
            </div>
          </section>

          {error ? (
            <section className="rounded-[1.5rem] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </section>
          ) : null}

          {success ? (
            <section className="rounded-[1.5rem] border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
              {success}
            </section>
          ) : null}

          <section className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
            <div className="space-y-5">
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                  Member
                </label>
                <select
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
                  value={selectedMemberId}
                  onChange={(event) => setSelectedMemberId(event.target.value)}
                >
                  <option value="">Select member</option>
                  {members.map((member) => (
                    <option key={member.user_id} value={member.user_id}>
                      {member.name || member.email || member.user_id}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-[1.1rem] border border-[var(--line)] bg-[var(--surface-strong)] p-4">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                    Projects
                  </div>
                  <div className="mt-3 space-y-2">
                    {projects.map((project) => (
                      <label
                        key={project.id}
                        className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                      >
                        <input
                          type="checkbox"
                          checked={scope.projectIds.includes(project.id)}
                          onChange={(event) =>
                            setScope((current) => ({
                              ...current,
                              projectIds: toggleArrayValue(current.projectIds, project.id, event.target.checked),
                            }))
                          }
                        />
                        <span>{project.name}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="rounded-[1.1rem] border border-[var(--line)] bg-[var(--surface-strong)] p-4">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                    Campaigns
                  </div>
                  <div className="mt-3 space-y-2">
                    {visibleCampaigns.map((campaign) => (
                      <label
                        key={campaign.id}
                        className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                      >
                        <input
                          type="checkbox"
                          checked={scope.campaignIds.includes(campaign.id)}
                          onChange={(event) =>
                            setScope((current) => ({
                              ...current,
                              campaignIds: toggleArrayValue(current.campaignIds, campaign.id, event.target.checked),
                            }))
                          }
                        />
                        <span>{campaign.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-[1.1rem] border border-[var(--line)] bg-[var(--surface-strong)] p-4">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                    Platforms
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {PLATFORM_OPTIONS.map((platform) => (
                      <label
                        key={platform}
                        className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                      >
                        <input
                          type="checkbox"
                          checked={scope.platforms.includes(platform)}
                          onChange={(event) =>
                            setScope((current) => ({
                              ...current,
                              platforms: toggleArrayValue(current.platforms, platform, event.target.checked),
                            }))
                          }
                        />
                        <span>{platform}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="rounded-[1.1rem] border border-[var(--line)] bg-[var(--surface-strong)] p-4">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                    Channel ids and skills
                  </div>
                  <textarea
                    className="mt-3 min-h-[88px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
                    placeholder="Comma-separated channel ids"
                    value={scope.channelIds.join(", ")}
                    onChange={(event) =>
                      setScope((current) => ({
                        ...current,
                        channelIds: event.target.value
                          .split(",")
                          .map((item) => item.trim())
                          .filter(Boolean),
                      }))
                    }
                  />
                  <textarea
                    className="mt-3 min-h-[88px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
                    placeholder="Comma-separated skills"
                    value={skills}
                    onChange={(event) => setSkills(event.target.value)}
                  />
                </div>
              </div>

              <button
                type="button"
                disabled={!selectedMember || saving || loading}
                onClick={handleSave}
                className="rounded-2xl bg-slate-900 px-4 py-3 text-[11px] font-black uppercase tracking-[0.2em] text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Saving scope..." : "Save agent scope"}
              </button>
            </div>
          </section>
        </div>
      )}
    </DashboardLayout>
  );
}
