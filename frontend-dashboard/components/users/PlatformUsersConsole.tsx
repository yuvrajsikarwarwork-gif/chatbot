import { useEffect, useState } from "react";
import { PencilLine, Plus, ShieldCheck, Trash2, UserCog } from "lucide-react";

import PageAccessNotice from "../access/PageAccessNotice";
import UsersAccessTabs from "../access/UsersAccessTabs";
import DashboardLayout from "../layout/DashboardLayout";
import { useVisibility } from "../../hooks/useVisibility";
import { userAdminService, type PlatformUser } from "../../services/userAdminService";
import { useAuthStore } from "../../store/authStore";
import { confirmAction } from "../../store/uiStore";

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
  const [editingUserId, setEditingUserId] = useState("");

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

  const handleEditStart = (platformUser: PlatformUser) => {
    setEditingUserId(platformUser.id);
    setForm({
      email: platformUser.email || "",
      password: "",
      name: platformUser.name || "",
      role: platformUser.role,
    });
    setError("");
    setSuccess("");
  };

  const handleEditCancel = () => {
    setEditingUserId("");
    setForm(EMPTY_FORM);
  };

  const handleSaveUser = async () => {
    if (!form.email.trim() || !form.name.trim() || (!editingUserId && !form.password.trim())) {
      setError(editingUserId ? "Name and email are required." : "Name, email, and password are required.");
      return;
    }

    try {
      setError("");
      setSuccess("");
      if (editingUserId) {
        await userAdminService.update(editingUserId, {
          email: form.email.trim(),
          name: form.name.trim(),
          role: form.role,
        });
        setSuccess("Platform user updated.");
      } else {
        await userAdminService.create(form);
        setSuccess("Platform user created.");
      }
      handleEditCancel();
      await loadUsers();
    } catch (err: any) {
      setError(err?.response?.data?.error || `Failed to ${editingUserId ? "update" : "create"} user`);
    }
  };

  const handleDeleteUser = async (platformUser: PlatformUser) => {
    if (
      !(await confirmAction(
        "Delete platform user",
        `This will permanently delete ${platformUser.email}.`,
        "Delete"
      ))
    ) {
      return;
    }

    try {
      setError("");
      setSuccess("");
      await userAdminService.delete(platformUser.id);
      setSuccess("Platform user deleted.");
      if (editingUserId === platformUser.id) {
        handleEditCancel();
      }
      await loadUsers();
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to delete user");
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
          <section className="rounded-[1.75rem] border border-border-main bg-surface p-6 shadow-sm">
            <div className="max-w-3xl">
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted">
                Platform Users
              </div>
              <h1 className="mt-3 text-[1.6rem] font-semibold tracking-tight text-text-main">
                Manage developer and super admin access
              </h1>
              <p className="mt-2 text-sm leading-6 text-text-muted">
                Create and manage platform-level accounts without going through workspace membership first.
              </p>
            </div>
          </section>

          {!canManageUsers ? (
            <section className="rounded-[1.5rem] border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800 shadow-sm">
              Developer or super admin access is required to manage platform users.
            </section>
          ) : (
            <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
              <section className="rounded-[1.5rem] border border-border-main bg-surface p-6 shadow-sm">
                <div className="mb-5 flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-primary bg-primary text-white shadow-sm">
                    <Plus size={20} />
                  </div>
                    <div>
                      <div className="text-[11px] font-black uppercase tracking-[0.24em] text-text-muted">
                        User Editor
                      </div>
                        <div className="text-lg font-semibold tracking-tight text-text-main">
                      {editingUserId ? "Edit platform user" : "Create platform user"}
                      </div>
                    </div>
                  </div>

                <div className="space-y-3 rounded-[1.2rem] border border-border-main bg-canvas p-4 shadow-sm">
                  <input
                    className="w-full rounded-2xl border border-border-main bg-surface px-4 py-3 text-sm text-text-main outline-none transition focus:border-primary focus:shadow-[0_0_0_4px_var(--primary-fade)]"
                    placeholder="Full name"
                    value={form.name}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  />
                  <input
                    className="w-full rounded-2xl border border-border-main bg-surface px-4 py-3 text-sm text-text-main outline-none transition focus:border-primary focus:shadow-[0_0_0_4px_var(--primary-fade)]"
                    placeholder="Email"
                    value={form.email}
                    onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                  />
                  <input
                    type="password"
                    className="w-full rounded-2xl border border-border-main bg-surface px-4 py-3 text-sm text-text-main outline-none transition focus:border-primary focus:shadow-[0_0_0_4px_var(--primary-fade)]"
                    placeholder={editingUserId ? "Password unchanged" : "Password"}
                    value={form.password}
                    onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                  />
                  <select
                    className="w-full rounded-2xl border border-border-main bg-surface px-4 py-3 text-sm text-text-main outline-none transition focus:border-primary focus:shadow-[0_0_0_4px_var(--primary-fade)]"
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
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                      {error}
                    </div>
                  ) : null}
                  {success ? (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                      {success}
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={handleSaveUser}
                      className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-primary bg-primary px-4 py-3 text-[11px] font-black uppercase tracking-[0.2em] text-white shadow-sm transition duration-300 hover:-translate-y-0.5"
                    >
                      {editingUserId ? <PencilLine size={14} /> : <Plus size={14} />}
                      {editingUserId ? "Save User" : "Create User"}
                    </button>
                    {editingUserId ? (
                      <button
                        type="button"
                        onClick={handleEditCancel}
                        className="rounded-2xl border border-border-main bg-canvas px-4 py-3 text-[11px] font-black uppercase tracking-[0.2em] text-text-main"
                      >
                        Cancel
                      </button>
                    ) : null}
                  </div>
                </div>
              </section>

              <section className="space-y-6">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-[1.2rem] border border-border-main bg-surface px-4 py-4 shadow-sm">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text-muted">Users</div>
                    <div className="mt-2 text-xl font-semibold text-text-main">{users.length}</div>
                  </div>
                  <div className="rounded-[1.2rem] border border-border-main bg-surface px-4 py-4 shadow-sm">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text-muted">Developers</div>
                    <div className="mt-2 text-xl font-semibold text-text-main">{users.filter((item) => item.role === "developer").length}</div>
                  </div>
                  <div className="rounded-[1.2rem] border border-border-main bg-surface px-4 py-4 shadow-sm">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text-muted">Super Admins</div>
                    <div className="mt-2 text-xl font-semibold text-text-main">{users.filter((item) => item.role === "super_admin").length}</div>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {users.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-[1.25rem] border border-border-main bg-surface p-5 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-base font-semibold tracking-tight text-text-main">
                            {item.name || "Unnamed User"}
                          </div>
                          <div className="mt-1 truncate text-sm text-text-muted">{item.email}</div>
                        </div>
                        <div className="rounded-full border border-border-main bg-canvas px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">
                          {item.role}
                        </div>
                      </div>
                      <div className="mt-4 space-y-2 text-sm text-text-muted">
                        <div className="flex items-center gap-2">
                          <UserCog size={14} />
                          Platform role: {item.role}
                        </div>
                        <div className="flex items-center gap-2">
                          <ShieldCheck size={14} />
                          User id: {item.id.slice(0, 8)}
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleEditStart(item)}
                          className="inline-flex items-center gap-2 rounded-xl border border-border-main bg-canvas px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-text-main"
                        >
                          <PencilLine size={12} />
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={item.id === user?.id}
                          onClick={() => handleDeleteUser(item).catch(console.error)}
                          className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-rose-700 transition duration-200 hover:bg-rose-100 disabled:opacity-50"
                        >
                          <Trash2 size={12} />
                          Delete
                        </button>
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
