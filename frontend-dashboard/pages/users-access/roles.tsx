import { useEffect, useState } from "react";
import { useRouter } from "next/router";

import PageAccessNotice from "../../components/access/PageAccessNotice";
import UsersAccessTabs from "../../components/access/UsersAccessTabs";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { useVisibility } from "../../hooks/useVisibility";
import {
  PERMISSION_OPTIONS,
  RECOMMENDED_ROLE_BASELINES,
  ROLE_DESCRIPTIONS,
  WORKSPACE_ROLES,
} from "../../lib/accessAdmin";
import { permissionService } from "../../services/permissionService";
import { refreshPermissionSnapshot } from "../../services/permissionSnapshotService";
import { useAuthStore } from "../../store/authStore";

export default function UsersAccessRolesPage() {
  const router = useRouter();
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);
  const { isPlatformOperator, isReadOnly } = useVisibility();
  const [roleMatrices, setRoleMatrices] = useState<Record<string, Record<string, boolean>>>({});
  const [loading, setLoading] = useState(false);
  const [savingRole, setSavingRole] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const activeWorkspaceId = activeWorkspace?.workspace_id || "";
  const canViewUsersAccessPage = isPlatformOperator;
  const roleApiWorkspaceId = isPlatformOperator ? undefined : activeWorkspaceId || undefined;
  const canEditBaselines = isPlatformOperator && !isReadOnly;

  const isRecommendedAppliedForRole = (role: (typeof WORKSPACE_ROLES)[number]) =>
    PERMISSION_OPTIONS.every((option) =>
      Boolean(roleMatrices[role]?.[option.key]) === Boolean(RECOMMENDED_ROLE_BASELINES[role]?.[option.key])
    );

  const areAllRecommendedApplied =
    WORKSPACE_ROLES.length > 0 && WORKSPACE_ROLES.every((role) => isRecommendedAppliedForRole(role));

  useEffect(() => {
    if (!canViewUsersAccessPage) {
      setRoleMatrices({});
      return;
    }

    setLoading(true);
    setError("");
    Promise.all(
      WORKSPACE_ROLES.map(async (role) => {
        const data = await permissionService.getRole(role, roleApiWorkspaceId);
        return [role, data.permissions || {}] as const;
      })
    )
      .then((rows) => setRoleMatrices(Object.fromEntries(rows)))
      .catch((err: any) => {
        console.error("Failed to load role baselines", err);
        setRoleMatrices({});
        setError(err?.response?.data?.error || "Failed to load role baselines");
      })
      .finally(() => setLoading(false));
  }, [canViewUsersAccessPage, isPlatformOperator, roleApiWorkspaceId]);

  useEffect(() => {
    if (!router.isReady || canViewUsersAccessPage) {
      return;
    }
    router.replace("/users-access").catch(() => undefined);
  }, [canViewUsersAccessPage, router]);

  const handleToggle = (role: string, permissionKey: string) => {
    setRoleMatrices((current) => ({
      ...current,
      [role]: {
        ...(current[role] || {}),
        [permissionKey]: !Boolean(current[role]?.[permissionKey]),
      },
    }));
  };

  const handleSave = async (role: string) => {
    if (!canEditBaselines) {
      return;
    }
    try {
      setSavingRole(role);
      setError("");
      setSuccess("");
      const data = await permissionService.updateRole(role, roleMatrices[role] || {});
      await refreshPermissionSnapshot();
      setRoleMatrices((current) => ({
        ...current,
        [role]: data.permissions || {},
      }));
      setSuccess(`${role.replace("_", " ")} baseline updated.`);
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to update role baseline");
    } finally {
      setSavingRole("");
    }
  };

  const applyRecommended = (role: (typeof WORKSPACE_ROLES)[number]) => {
    if (!canEditBaselines) {
      return;
    }
    setRoleMatrices((current) => ({
      ...current,
      [role]: {
        ...RECOMMENDED_ROLE_BASELINES[role],
      },
    }));
    setSuccess(`${role.replace("_", " ")} baseline reset to recommended values.`);
    setError("");
  };

  const applyRecommendedToAll = async () => {
    if (!canEditBaselines) {
      return;
    }
    try {
      setError("");
      setSuccess("");
      for (const role of WORKSPACE_ROLES) {
        const permissions = RECOMMENDED_ROLE_BASELINES[role];
        await permissionService.updateRole(role, permissions);
      }
      await refreshPermissionSnapshot();
      setRoleMatrices(
        Object.fromEntries(
          WORKSPACE_ROLES.map((role) => [role, { ...RECOMMENDED_ROLE_BASELINES[role] }])
        )
      );
      setSuccess("Recommended baselines applied for all workspace roles.");
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to apply recommended baselines");
    }
  };

  return (
    <DashboardLayout>
      {!canViewUsersAccessPage ? (
        <PageAccessNotice
          title="Role baselines are restricted for this role"
          description="Workspace role baselines are only available inside the users and permissions area."
          href="/users-access"
          ctaLabel="Open users and permissions"
        />
      ) : (
        <div className="mx-auto max-w-7xl space-y-6">
          <UsersAccessTabs activeHref="/users-access/roles" />
          <section className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)]">
            <div className="max-w-3xl">
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
                Roles
              </div>
              <h1 className="mt-3 text-[1.6rem] font-semibold tracking-tight text-[var(--text)]">
                Global role baselines
              </h1>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                Review and correct the platform-managed baseline permission matrix by role before testing workspace behavior.
              </p>
            </div>
            {canEditBaselines ? (
              <div className="mt-5">
                <button
                  type="button"
                  onClick={() => applyRecommendedToAll().catch(console.error)}
                  disabled={areAllRecommendedApplied}
                  className={`min-w-[280px] rounded-2xl px-4 py-3 text-[11px] font-black uppercase tracking-[0.2em] text-white transition disabled:cursor-not-allowed disabled:opacity-75 ${
                    areAllRecommendedApplied
                      ? "border border-emerald-300 bg-emerald-600 shadow-[0_0_0_1px_rgba(16,185,129,0.2)]"
                      : "border border-emerald-300 bg-emerald-500 shadow-[0_18px_30px_rgba(16,185,129,0.22)] hover:bg-emerald-600"
                  }`}
                >
                  {areAllRecommendedApplied ? "Applied" : "Restore Recommended Baselines"}
                </button>
              </div>
            ) : null}
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

          <div className="space-y-6">
            {WORKSPACE_ROLES.map((role) => (
              <section
                key={role}
                className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="max-w-2xl">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                      {role.replace("_", " ")}
                    </div>
                    <div className="mt-2 text-sm leading-6 text-[var(--muted)]">
                      {ROLE_DESCRIPTIONS[role]}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      disabled={!canEditBaselines || savingRole === role}
                      onClick={() => handleSave(role)}
                      className="rounded-2xl bg-slate-900 px-4 py-3 text-[11px] font-black uppercase tracking-[0.2em] text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {savingRole === role ? "Saving..." : "Save baseline"}
                    </button>
                    {canEditBaselines ? (
                      <button
                        type="button"
                        onClick={() => applyRecommended(role)}
                        disabled={!canEditBaselines || isRecommendedAppliedForRole(role)}
                        className={`rounded-2xl px-4 py-3 text-[11px] font-black uppercase tracking-[0.2em] transition disabled:cursor-not-allowed disabled:opacity-75 ${
                          isRecommendedAppliedForRole(role)
                            ? "border border-emerald-300 bg-emerald-100 text-emerald-700"
                            : "border border-emerald-300 bg-emerald-500 text-white shadow-[0_16px_28px_rgba(16,185,129,0.18)] hover:bg-emerald-600"
                        }`}
                      >
                        {isRecommendedAppliedForRole(role) ? "Applied" : "Use Recommended"}
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="mt-5 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {PERMISSION_OPTIONS.map((option) => (
                    <label
                      key={`${role}-${option.key}`}
                      className="flex items-center gap-3 rounded-xl border border-border-main bg-surface px-3 py-2 text-sm text-text-muted"
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(roleMatrices[role]?.[option.key])}
                        disabled={!canEditBaselines || loading}
                        onChange={() => handleToggle(role, option.key)}
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
