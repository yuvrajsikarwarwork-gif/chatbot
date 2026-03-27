import { useEffect, useState } from "react";
import { KeyRound, Plus, ShieldCheck, UserCog } from "lucide-react";

import PageAccessNotice from "../access/PageAccessNotice";
import UsersAccessTabs from "../access/UsersAccessTabs";
import DashboardLayout from "../layout/DashboardLayout";
import { useVisibility } from "../../hooks/useVisibility";
import { userAdminService, type PlatformUser } from "../../services/userAdminService";
import { useAuthStore } from "../../store/authStore";

const EMPTY_FORM = {
  email: "",
  password: "",
  name: "",
  role: "user" as PlatformUser["role"],
};

export default function PlatformUsersConsole() {
  const user = useAuthStore((state) => state.user);
  const { isPlatformOperator, canViewPage } = useVisibility();
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const canManageUsers = user?.role === "super_admin" || user?.role === "developer";

  const loadUsers = async () => {
    try {
      setError("");
      const data = await userAdminService.list();
      setUsers(data);
    } catch (err: any) {
      console.error("Failed to load platform users", err);
      setError(err?.response?.data?.error || "Failed to load users");
    }
  };

  useEffect(() => {
    if (!canManageUsers || !isPlatformOperator) {
      return;
    }

    loadUsers().catch(console.error);
  }, [canManageUsers, isPlatformOperator]);

  const handleCreate = async () => {
    if (!form.email.trim() || !form.password.trim() || !form.name.trim()) {
      setError("Name, email, and password are required.");
      return;
    }

    try {
      setError("");
      setSuccess("");
      await userAdminService.create(form);
      setForm(EMPTY_FORM);
      setSuccess("Platform user created.");
      await loadUsers();
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to create user");
    }
  };

  return (
    <DashboardLayout>
      {!isPlatformOperator ? (
        <PageAccessNotice
          title="Platform users are restricted for this role"
          description="Only platform operators can open the platform user directory."
          href={canViewPage("users_access") ? "/users-access" : "/"}
          ctaLabel={canViewPage("users_access") ? "Open users and permissions" : "Open dashboard"}
        />
      ) : (
        <div className="mx-auto max-w-7xl space-y-6">
          <UsersAccessTabs activeHref="/users-access/platform-users" />
          <section className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)]">
            <div className="max-w-3xl">
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
                Platform Users
              </div>
              <h1 className="mt-3 text-[1.6rem] font-semibold tracking-tight text-[var(--text)]">
                Manage developer and super admin access
              </h1>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                Create and manage platform-level accounts without going through workspace membership first.
              </p>
            </div>
          </section>

          {!canManageUsers ? (
            <section className="rounded-[1.5rem] border border-[rgba(245,158,11,0.35)] bg-[rgba(245,158,11,0.12)] p-6 text-sm text-[var(--text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
              Developer or super admin access is required to manage platform users.
            </section>
          ) : (
            <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
              <section className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
                <div className="mb-5 flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[rgba(129,140,248,0.34)] bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] text-white shadow-[0_16px_28px_var(--accent-glow)]">
                    <Plus size={20} />
                  </div>
                  <div>
                    <div className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">
                      User Editor
                    </div>
                    <div className="text-lg font-semibold tracking-tight text-[var(--text)]">
                      Create platform user
                    </div>
                  </div>
                </div>

                <div className="space-y-3 rounded-[1.2rem] border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]">
                  <input
                    className="w-full rounded-2xl border border-[var(--glass-border)] bg-[var(--surface-strong)] px-4 py-3 text-sm text-[var(--text)] outline-none transition focus:border-[var(--line-strong)] focus:shadow-[0_0_0_4px_var(--accent-soft)]"
                    placeholder="Full name"
                    value={form.name}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  />
                  <input
                    className="w-full rounded-2xl border border-[var(--glass-border)] bg-[var(--surface-strong)] px-4 py-3 text-sm text-[var(--text)] outline-none transition focus:border-[var(--line-strong)] focus:shadow-[0_0_0_4px_var(--accent-soft)]"
                    placeholder="Email"
                    value={form.email}
                    onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                  />
                  <input
                    type="password"
                    className="w-full rounded-2xl border border-[var(--glass-border)] bg-[var(--surface-strong)] px-4 py-3 text-sm text-[var(--text)] outline-none transition focus:border-[var(--line-strong)] focus:shadow-[0_0_0_4px_var(--accent-soft)]"
                    placeholder="Password"
                    value={form.password}
                    onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                  />
                  <select
                    className="w-full rounded-2xl border border-[var(--glass-border)] bg-[var(--surface-strong)] px-4 py-3 text-sm text-[var(--text)] outline-none transition focus:border-[var(--line-strong)] focus:shadow-[0_0_0_4px_var(--accent-soft)]"
                    value={form.role}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        role: event.target.value as PlatformUser["role"],
                      }))
                    }
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                    <option value="developer">Developer</option>
                    <option value="super_admin">Super Admin</option>
                  </select>
                  {error ? (
                    <div className="rounded-2xl border border-[rgba(248,113,113,0.3)] bg-[rgba(248,113,113,0.12)] px-4 py-3 text-sm text-[var(--text)]">
                      {error}
                    </div>
                  ) : null}
                  {success ? (
                    <div className="rounded-2xl border border-[rgba(52,211,153,0.28)] bg-[rgba(16,185,129,0.12)] px-4 py-3 text-sm text-[var(--text)]">
                      {success}
                    </div>
                  ) : null}
                  <button
                    onClick={handleCreate}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[rgba(129,140,248,0.34)] bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] px-4 py-3 text-[11px] font-black uppercase tracking-[0.2em] text-white shadow-[0_18px_32px_var(--accent-glow)] transition duration-300 hover:-translate-y-0.5"
                  >
                    <Plus size={14} />
                    Create User
                  </button>
                </div>
              </section>

              <section className="space-y-6">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-[1.2rem] border border-[var(--line)] bg-[var(--surface)] px-4 py-4 shadow-sm">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">Users</div>
                    <div className="mt-2 text-xl font-semibold text-[var(--text)]">{users.length}</div>
                  </div>
                  <div className="rounded-[1.2rem] border border-[var(--line)] bg-[var(--surface)] px-4 py-4 shadow-sm">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">Developers</div>
                    <div className="mt-2 text-xl font-semibold text-[var(--text)]">{users.filter((item) => item.role === "developer").length}</div>
                  </div>
                  <div className="rounded-[1.2rem] border border-[var(--line)] bg-[var(--surface)] px-4 py-4 shadow-sm">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">Super Admins</div>
                    <div className="mt-2 text-xl font-semibold text-[var(--text)]">{users.filter((item) => item.role === "super_admin").length}</div>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {users.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-[1.25rem] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-base font-semibold tracking-tight text-[var(--text)]">
                            {item.name || "Unnamed User"}
                          </div>
                          <div className="mt-1 truncate text-sm text-[var(--muted)]">{item.email}</div>
                        </div>
                        <div className="rounded-full border border-[var(--glass-border)] bg-[var(--surface-muted)] px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-[var(--muted)]">
                          {item.role}
                        </div>
                      </div>
                      <div className="mt-4 space-y-2 text-sm text-[var(--muted)]">
                        <div className="flex items-center gap-2">
                          <UserCog size={14} />
                          Platform role: {item.role}
                        </div>
                        <div className="flex items-center gap-2">
                          <ShieldCheck size={14} />
                          User id: {item.id.slice(0, 8)}
                        </div>
                        <div className="flex items-center gap-2">
                          <KeyRound size={14} />
                          Workspace: {item.workspace_id ? item.workspace_id.slice(0, 8) : "none"}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}
        </div>
      )}
    </DashboardLayout>
  );
}
