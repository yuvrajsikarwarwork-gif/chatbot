import { useEffect, useMemo, useState } from "react";
import { Activity, Download, ShieldCheck, Users } from "lucide-react";

import PageAccessNotice from "../components/access/PageAccessNotice";
import DashboardLayout from "../components/layout/DashboardLayout";
import { useVisibility } from "../hooks/useVisibility";
import { auditService } from "../services/auditService";
import { useAuthStore } from "../store/authStore";

export default function AuditPage() {
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);
  const activeProject = useAuthStore((state) => state.activeProject);
  const resolvedAccess = useAuthStore((state) => state.resolvedAccess);
  const hasWorkspacePermission = useAuthStore((state) => state.hasWorkspacePermission);
  const { canViewPage, isPlatformOperator } = useVisibility();
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);

  const hasAuditWorkspaceRights =
    hasWorkspacePermission(activeWorkspace?.workspace_id, "manage_workspace") ||
    hasWorkspacePermission(activeWorkspace?.workspace_id, "manage_users") ||
    hasWorkspacePermission(activeWorkspace?.workspace_id, "manage_permissions");
  const canOpenAuditShell = canViewPage("audit") || isPlatformOperator || hasAuditWorkspaceRights;
  const canViewAudit =
    canOpenAuditShell &&
    (hasWorkspacePermission(activeWorkspace?.workspace_id, "manage_workspace") ||
      hasWorkspacePermission(activeWorkspace?.workspace_id, "manage_users") ||
      hasWorkspacePermission(activeWorkspace?.workspace_id, "manage_permissions"));
  const supportModeActive =
    Boolean(resolvedAccess?.support_access) ||
    Boolean(activeWorkspace?.permissions_json?.support_mode);

  useEffect(() => {
    if (!activeWorkspace?.workspace_id || !canViewAudit) {
      setEvents([]);
      return;
    }

    setLoading(true);
    setError("");
    auditService
      .listWorkspaceAuditLogs(activeWorkspace.workspace_id, {
        projectId: supportModeActive ? undefined : activeProject?.id,
      })
      .then(setEvents)
      .catch((err) => {
        console.error("Failed to load audit logs", err);
        setEvents([]);
        setError(err?.response?.data?.error || "Failed to load audit logs");
      })
      .finally(() => setLoading(false));
  }, [activeWorkspace?.workspace_id, activeProject?.id, canViewAudit, supportModeActive]);

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
      if (filter === "support_mode") {
        return Boolean(event.metadata?.support_mode) || event.entity === "support_session";
      }
      return String(event.entity || "").includes(filter);
    });
  }, [events, filter]);

  const supportModeEventCount = events.filter(
    (event) => Boolean(event.metadata?.support_mode) || event.entity === "support_session"
  ).length;

  const formatActorLabel = (event: any) => {
    const actor =
      event.actor_user_name ||
      event.actor_user_email ||
      event.user_name ||
      event.user_email ||
      event.actor_user_id ||
      event.user_id ||
      "system";
    const impersonated =
      event.impersonated_user_name ||
      event.impersonated_user_email ||
      event.impersonated_user_id ||
      null;

    return impersonated ? `${actor} as ${impersonated}` : actor;
  };

  const formatEventPayload = (event: any) => {
    const payload =
      event.new_data && Object.keys(event.new_data || {}).length > 0
        ? event.new_data
        : event.old_data && Object.keys(event.old_data || {}).length > 0
          ? event.old_data
          : event.metadata && Object.keys(event.metadata || {}).length > 0
            ? event.metadata
            : null;

    return payload ? JSON.stringify(payload, null, 2) : "No payload";
  };

  const isSupportEvent = (event: any) =>
    Boolean(event.metadata?.support_mode) || event.entity === "support_session";

  const handleExport = () => {
    if (!filteredEvents.length) {
      return;
    }

    setExporting(true);
    try {
      const headers = Array.from(
        filteredEvents.reduce((set, event) => {
          [
            "id",
            "entity",
            "action",
            "actor",
            "project_id",
            "created_at",
            "payload",
          ].forEach((key) => set.add(key));
          Object.keys(event.metadata || {}).forEach((key) => set.add(`metadata.${key}`));
          Object.keys(event.new_data || {}).forEach((key) => set.add(`new_data.${key}`));
          Object.keys(event.old_data || {}).forEach((key) => set.add(`old_data.${key}`));
          return set;
        }, new Set<string>())
      );

      const escape = (value: unknown) =>
        `"${String(value === null || value === undefined ? "" : value)
          .replace(/\r?\n/g, " ")
          .replace(/"/g, '""')}"`;
      const csv = [
        headers.map(escape).join(","),
        ...filteredEvents.map((event) =>
          (headers as string[])
            .map((header: string) => {
              if (header === "id") return escape(event.id);
              if (header === "entity") return escape(event.entity);
              if (header === "action") return escape(event.action);
              if (header === "actor") return escape(formatActorLabel(event));
              if (header === "project_id") return escape(event.project_id || "");
              if (header === "created_at") return escape(event.created_at || "");
              if (header === "payload") return escape(formatEventPayload(event));
              if (header.startsWith("metadata.")) return escape(event.metadata?.[header.slice(9)] ?? "");
              if (header.startsWith("new_data.")) return escape(event.new_data?.[header.slice(9)] ?? "");
              if (header.startsWith("old_data.")) return escape(event.old_data?.[header.slice(9)] ?? "");
              return escape("");
            })
            .join(",")
        ),
      ].join("\n");

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `audit-${filter}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  return (
    <DashboardLayout>
      {!canOpenAuditShell ? (
        <PageAccessNotice
          title="Audit history is restricted for this role"
          description="Workspace audit history is limited to workspace admins and permission operators inside the current workspace."
          href="/"
          ctaLabel="Open dashboard"
        />
      ) : (
        <div className="mx-auto max-w-7xl space-y-6">
          {!canViewAudit ? (
            <section className="rounded-[1.5rem] border border-dashed border-border-main bg-surface p-8 text-sm text-text-muted">
              {!activeWorkspace?.workspace_id
                ? "Select a workspace first to review its audit trail."
                : "Workspace audit is available to operators with workspace, user, or permission management access."}
            </section>
          ) : (
            <>
              {error ? (
                <section className="rounded-[1.5rem] border border-rose-300/40 bg-rose-500/10 p-4 text-sm text-rose-200">
                  {error}
                </section>
              ) : null}
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {[
                  {
                    label: supportModeActive ? "Support audit logs" : "Total audit logs",
                    value: events.length,
                    icon: Activity,
                  },
                  {
                    label: "Permission changes",
                    value: events.filter(
                      (event) => event.entity === "workspace_member" || event.entity === "project_user"
                    ).length,
                    icon: ShieldCheck,
                  },
                  {
                    label: "Assignment logs",
                    value: events.filter((event) => String(event.entity || "").includes("assignment")).length,
                    icon: Users,
                  },
                  {
                    label: "Support-mode logs",
                    value: supportModeEventCount,
                    icon: ShieldCheck,
                  },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.label} className="rounded-[1.25rem] border border-border-main bg-surface p-5 shadow-sm">
                      <div className="flex items-center justify-between">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text-muted">
                          {item.label}
                        </div>
                        <div className="rounded-xl bg-canvas p-2 text-text-muted">
                          <Icon size={16} />
                        </div>
                      </div>
                      <div className="mt-4 text-2xl font-semibold tracking-tight text-text-main">
                        {item.value}
                      </div>
                    </div>
                  );
                })}
              </div>

                  <section className="rounded-[1.5rem] border border-border-main bg-surface p-6 shadow-sm">
                {supportModeActive ? (
                  <div className="mb-4 rounded-[1rem] border border-amber-300/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                    Showing only audit events performed by your current support session inside this workspace.
                  </div>
                ) : null}
                <div className="mb-4 flex flex-wrap gap-2">
                  {[
                    ["all", "All"],
                    ["permissions", "Permissions"],
                    ["assignments", "Assignments"],
                    ["campaign", "Campaigns"],
                    ["support", "Support"],
                    ["support_mode", "Support Mode"],
                  ].map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setFilter(key)}
                      className={`rounded-full px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] ${
                        filter === key
                          ? "bg-primary text-white"
                          : "border border-border-main bg-surface text-text-muted"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={handleExport}
                    disabled={!filteredEvents.length || exporting}
                    data-allow-export="true"
                    className="inline-flex items-center gap-2 rounded-full border border-primary bg-primary px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Download size={14} />
                    {exporting ? "Exporting..." : "Export Current View"}
                  </button>
                </div>

                <div className="space-y-3">
                  {loading ? (
                    <div className="rounded-xl border border-dashed border-border-main bg-surface px-4 py-6 text-sm text-text-muted">
                      Loading audit logs...
                    </div>
                  ) : filteredEvents.length ? (
                    filteredEvents.map((event) => (
                      <div key={event.id} className="rounded-xl border border-border-main bg-surface p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-text-main">
                              {event.entity} {event.action}
                            </div>
                            <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-text-muted">
                              {formatActorLabel(event)}
                              {event.project_id ? " • project scoped" : ""}
                            </div>
                            {isSupportEvent(event) ? (
                              <div className="mt-2 inline-flex rounded-full border border-rose-300/30 bg-rose-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-rose-200">
                                Support session
                              </div>
                            ) : null}
                            {isSupportEvent(event) && (event.metadata?.support_access_id || event.support_access_id) ? (
                              <div className="mt-2 text-[11px] text-text-muted">
                                Session: {String(event.metadata?.support_access_id || event.support_access_id)}
                              </div>
                            ) : null}
                            <div className="mt-3 text-xs text-text-muted break-all">
                              <pre className="whitespace-pre-wrap font-mono text-[11px] leading-5 text-text-muted">
                                {formatEventPayload(event)}
                              </pre>
                            </div>
                          </div>
                          <div className="text-xs text-text-muted">
                            {new Date(event.created_at).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-xl border border-dashed border-border-main bg-surface px-4 py-6 text-sm text-text-muted">
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
