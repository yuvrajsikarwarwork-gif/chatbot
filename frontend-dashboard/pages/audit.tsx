import { useEffect, useMemo, useState } from "react";
import { Activity, ShieldCheck, Users } from "lucide-react";

import PageAccessNotice from "../components/access/PageAccessNotice";
import DashboardLayout from "../components/layout/DashboardLayout";
import { useVisibility } from "../hooks/useVisibility";
import { auditService } from "../services/auditService";
import { useAuthStore } from "../store/authStore";

export default function AuditPage() {
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);
  const activeProject = useAuthStore((state) => state.activeProject);
  const hasWorkspacePermission = useAuthStore((state) => state.hasWorkspacePermission);
  const { canViewPage } = useVisibility();
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");

  const canViewAudit =
    canViewPage("audit") &&
    (hasWorkspacePermission(activeWorkspace?.workspace_id, "manage_workspace") ||
      hasWorkspacePermission(activeWorkspace?.workspace_id, "manage_users") ||
      hasWorkspacePermission(activeWorkspace?.workspace_id, "manage_permissions"));

  useEffect(() => {
    if (!activeWorkspace?.workspace_id || !canViewAudit) {
      setEvents([]);
      return;
    }

    setLoading(true);
    setError("");
    auditService
      .listWorkspaceAuditLogs(activeWorkspace.workspace_id, {
        projectId: activeProject?.id,
      })
      .then(setEvents)
      .catch((err) => {
        console.error("Failed to load audit logs", err);
        setEvents([]);
        setError(err?.response?.data?.error || "Failed to load audit logs");
      })
      .finally(() => setLoading(false));
  }, [activeWorkspace?.workspace_id, activeProject?.id, canViewAudit]);

  const filteredEvents = useMemo(() => {
    if (filter === "all") {
      return events;
    }
    return events.filter((event) => {
      if (filter === "permissions") {
        return event.entity === "workspace_member" || event.entity === "project_user";
      }
      if (filter === "assignments") {
        return String(event.entity || "").includes("assignment");
      }
      return String(event.entity || "").includes(filter);
    });
  }, [events, filter]);

  return (
    <DashboardLayout>
      {!canViewPage("audit") ? (
        <PageAccessNotice
          title="Audit history is restricted for this role"
          description="Workspace audit history is limited to workspace admins and permission operators inside the current workspace."
          href="/"
          ctaLabel="Open dashboard"
        />
      ) : (
      <div className="mx-auto max-w-7xl space-y-6">
        {!canViewAudit ? (
          <section className="rounded-[1.5rem] border border-dashed border-[var(--line)] bg-[var(--surface)] p-8 text-sm text-[var(--muted)]">
            Workspace audit is available to operators with workspace, user, or permission management access.
          </section>
        ) : (
          <>
            {error ? (
              <section className="rounded-[1.5rem] border border-rose-300/40 bg-rose-500/10 p-4 text-sm text-rose-200">
                {error}
              </section>
            ) : null}
            <div className="grid gap-4 md:grid-cols-3">
              {[
                {
                  label: "Total audit logs",
                  value: events.length,
                  icon: Activity,
                },
                {
                  label: "Permission changes",
                  value: events.filter((event) => event.entity === "workspace_member" || event.entity === "project_user").length,
                  icon: ShieldCheck,
                },
                {
                  label: "Assignment logs",
                  value: events.filter((event) => String(event.entity || "").includes("assignment")).length,
                  icon: Users,
                },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="rounded-[1.25rem] border border-[var(--line)] bg-[var(--surface-strong)] p-5 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
                        {item.label}
                      </div>
                      <div className="rounded-xl bg-[var(--surface-muted)] p-2 text-[var(--muted)]">
                        <Icon size={16} />
                      </div>
                    </div>
                    <div className="mt-4 text-2xl font-semibold tracking-tight text-[var(--text)]">
                      {item.value}
                    </div>
                  </div>
                );
              })}
            </div>

            <section className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
              <div className="mb-4 flex flex-wrap gap-2">
                {[
                  ["all", "All"],
                  ["permissions", "Permissions"],
                  ["assignments", "Assignments"],
                  ["campaign", "Campaigns"],
                  ["support", "Support"],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setFilter(key)}
                    className={`rounded-full px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] ${
                      filter === key
                        ? "bg-[var(--accent-strong)] text-white"
                        : "border border-[var(--line)] bg-[var(--surface-strong)] text-[var(--muted)]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="space-y-3">
                {loading ? (
                  <div className="rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface-strong)] px-4 py-6 text-sm text-[var(--muted)]">
                    Loading audit logs...
                  </div>
                ) : filteredEvents.length ? (
                  filteredEvents.map((event) => (
                    <div key={event.id} className="rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="text-sm font-semibold text-[var(--text)]">
                            {event.entity} {event.action}
                          </div>
                          <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">
                            {event.user_name || event.user_email || event.user_id || "system"}
                            {event.project_id ? " • project scoped" : ""}
                          </div>
                          <div className="mt-3 text-xs text-[var(--muted)] break-all">
                            {event.new_data
                              ? JSON.stringify(event.new_data)
                              : event.old_data
                                ? JSON.stringify(event.old_data)
                                : "No payload"}
                          </div>
                        </div>
                        <div className="text-xs text-[var(--muted)]">
                          {new Date(event.created_at).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface-strong)] px-4 py-6 text-sm text-[var(--muted)]">
                    No audit logs match the current filter.
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </div>
      )}
    </DashboardLayout>
  );
}
