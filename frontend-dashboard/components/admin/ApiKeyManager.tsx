import { useEffect, useMemo, useState } from "react";

import { adminService, type OrganizationApiKey, type OrganizationSummary, type OrganizationWorkspace } from "../../services/adminService";
import ApiKeyRevealModal from "./ApiKeyRevealModal";
import RevokeKeyModal from "./RevokeKeyModal";

type ApiKeyManagerProps = {
  organization: OrganizationSummary | null;
  workspaces: OrganizationWorkspace[];
  focusKeyId?: string | null;
};

function formatTime(value?: string | null) {
  if (!value) {
    return "Never";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Never";
  }
  return date.toLocaleString();
}

export default function ApiKeyManager({ organization, workspaces, focusKeyId = null }: ApiKeyManagerProps) {
  const [keys, setKeys] = useState<OrganizationApiKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [revealSecret, setRevealSecret] = useState("");
  const [revokeTarget, setRevokeTarget] = useState<OrganizationApiKey | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [name, setName] = useState("");
  const [prefix, setPrefix] = useState<"live" | "test">("test");
  const [workspaceId, setWorkspaceId] = useState<string>("");
  const [scopes, setScopes] = useState("flow:execute, analytics:read");

  const workspaceOptions = useMemo(
    () => [{ id: "", name: "Org-wide", status: "shared" }, ...(workspaces || [])],
    [workspaces]
  );

  const loadKeys = async () => {
    if (!organization?.id) {
      setKeys([]);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const rows = await adminService.listOrganizationApiKeys(organization.id);
      setKeys(rows);
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to load API keys");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadKeys();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organization?.id]);

  useEffect(() => {
    if (!focusKeyId || keys.length === 0) {
      return;
    }

    const target = document.getElementById(`api-key-row-${focusKeyId}`);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [focusKeyId, keys]);

  const resetForm = () => {
    setName("");
    setPrefix("test");
    setWorkspaceId("");
    setScopes("flow:execute, analytics:read");
  };

  const handleCreate = async () => {
    if (!organization) {
      return;
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("API key name is required.");
      return;
    }

    setSaving(true);
    try {
      const result = await adminService.createOrganizationApiKey(organization.id, {
        name: trimmedName,
        prefix,
        workspaceId: workspaceId || null,
        scopes: scopes
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      });

      setRevealSecret(result.secret);
      setIsFormOpen(false);
      resetForm();
      await loadKeys();
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to create API key.");
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async (key: OrganizationApiKey) => {
    if (!organization) {
      return;
    }
    setRevokeTarget(key);
  };

  const confirmRevoke = async (reason: string) => {
    if (!organization || !revokeTarget) {
      return;
    }

    const trimmedReason = reason.trim();
    if (trimmedReason.length < 5) {
      setError("A revocation reason is required.");
      return;
    }

    setRevoking(true);
    setError("");
    try {
      await adminService.revokeOrganizationApiKey(organization.id, revokeTarget.id, trimmedReason);
      setRevokeTarget(null);
      await loadKeys();
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to revoke API key.");
    } finally {
      setRevoking(false);
    }
  };

  if (!organization) {
    return (
      <div className="rounded-[1.5rem] border border-dashed border-border-main bg-canvas p-6 text-sm text-text-muted">
        Load an organization before managing machine credentials.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[1.75rem] border border-border-main bg-surface p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-text-muted">
              Machine Access
            </div>
            <h3 className="mt-1 text-lg font-semibold tracking-tight text-text-main">
              Organization API keys
            </h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-text-muted">
              Issue scoped machine credentials for external integrations. The secret is shown once, then only the fingerprint remains visible.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsFormOpen(true)}
            className="inline-flex items-center justify-center rounded-xl border border-gray-900 bg-gray-900 px-4 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-white transition hover:bg-black"
          >
            Generate API key
          </button>
        </div>
      </section>

      {isFormOpen ? (
        <section className="rounded-[1.75rem] border border-amber-200 bg-amber-50/60 p-6 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-700">
                Create key
              </div>
              <p className="mt-2 text-sm leading-6 text-text-muted">
                Select a prefix, choose optional workspace scoping, and define the permissions this machine can use.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsFormOpen(false);
                resetForm();
              }}
              className="text-[10px] font-black uppercase tracking-[0.18em] text-text-muted transition hover:text-text-main"
            >
              Close
            </button>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            <label className="space-y-2">
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">Key name</div>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Mobile app integration"
                className="w-full rounded-xl border border-border-main bg-white px-4 py-3 text-sm text-text-main outline-none transition focus:border-primary/30 focus:ring-2 focus:ring-primary/10"
              />
            </label>

            <label className="space-y-2">
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">Environment</div>
              <select
                value={prefix}
                onChange={(event) => setPrefix(event.target.value as "live" | "test")}
                className="w-full rounded-xl border border-border-main bg-white px-4 py-3 text-sm text-text-main outline-none transition focus:border-primary/30 focus:ring-2 focus:ring-primary/10"
              >
                <option value="test">test</option>
                <option value="live">live</option>
              </select>
            </label>

            <label className="space-y-2">
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">Workspace scope</div>
              <select
                value={workspaceId}
                onChange={(event) => setWorkspaceId(event.target.value)}
                className="w-full rounded-xl border border-border-main bg-white px-4 py-3 text-sm text-text-main outline-none transition focus:border-primary/30 focus:ring-2 focus:ring-primary/10"
              >
                {workspaceOptions.map((workspace) => (
                  <option key={workspace.id || "org-wide"} value={workspace.id}>
                    {workspace.id ? workspace.name : "Org-wide"}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">Scopes</div>
              <input
                value={scopes}
                onChange={(event) => setScopes(event.target.value)}
                placeholder="flow:execute, analytics:read"
                className="w-full rounded-xl border border-border-main bg-white px-4 py-3 text-sm text-text-main outline-none transition focus:border-primary/30 focus:ring-2 focus:ring-primary/10"
              />
            </label>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                setIsFormOpen(false);
                resetForm();
              }}
              className="rounded-xl border border-border-main bg-surface px-4 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-text-main transition hover:border-primary/30 hover:bg-primary-fade hover:text-primary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={saving}
              className="rounded-xl border border-gray-900 bg-gray-900 px-4 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Creating..." : "Create key"}
            </button>
          </div>
        </section>
      ) : null}

      <section className="rounded-[1.75rem] border border-border-main bg-surface shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-border-main px-6 py-4">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-text-muted">
              Active and revoked keys
            </div>
            <div className="mt-1 text-lg font-semibold tracking-tight text-text-main">
              {organization.name}
            </div>
          </div>
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">
            {loading ? "Loading..." : `${keys.length} keys`}
          </div>
        </div>

        {error ? (
          <div className="px-6 py-4 text-sm text-rose-700">{error}</div>
        ) : loading ? (
          <div className="px-6 py-8 text-sm text-text-muted">Loading API keys...</div>
        ) : keys.length === 0 ? (
          <div className="px-6 py-10 text-sm text-text-muted">
            No API keys found. Create one to enable headless integrations.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead className="bg-canvas text-[10px] font-black uppercase tracking-[0.22em] text-text-muted">
                <tr>
                  <th className="px-6 py-4">Name</th>
                  <th className="px-6 py-4">Environment</th>
                  <th className="px-6 py-4">Scope</th>
                  <th className="px-6 py-4">Last Used</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-main">
                {keys.map((key) => {
                  const isRevoked = Boolean(key.revoked_at);
                  return (
                    <tr
                      key={key.id}
                      id={`api-key-row-${key.id}`}
                      className={`border-l-4 transition ${
                        focusKeyId === key.id
                          ? "bg-amber-50/80 border-l-amber-500 shadow-[inset_0_0_0_1px_rgba(245,158,11,0.35)]"
                          : "border-l-transparent hover:bg-canvas/60"
                      }`}
                    >
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-semibold text-text-main">{key.name}</span>
                          <span className="mt-1 font-mono text-[10px] text-text-muted">
                            {key.key_prefix}_••••{key.key_last_four}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.18em] ${
                            key.key_prefix === "live"
                              ? "border border-rose-200 bg-rose-50 text-rose-700"
                              : "border border-sky-200 bg-sky-50 text-sky-700"
                          }`}
                        >
                          {key.key_prefix}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1.5">
                          {(key.scopes || []).map((scope) => (
                            <span
                              key={scope}
                              className="rounded-full border border-border-main bg-white px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.16em] text-text-muted"
                            >
                              {scope}
                            </span>
                          ))}
                        </div>
                        <div className="mt-2 text-[10px] text-text-muted">
                          {key.workspace_name ? `Workspace: ${key.workspace_name}` : "Org-wide"}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-[10px] text-text-muted">{formatTime(key.last_used_at)}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.18em] ${
                            isRevoked
                              ? "border border-rose-200 bg-rose-50 text-rose-700"
                              : "border border-emerald-200 bg-emerald-50 text-emerald-700"
                          }`}
                        >
                          {isRevoked ? "Revoked" : "Active"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleRevoke(key)}
                          disabled={isRevoked}
                          className="text-[10px] font-black uppercase tracking-[0.16em] text-rose-600 transition hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Revoke
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {revealSecret ? (
        <ApiKeyRevealModal
          apiKey={revealSecret}
          onDone={() => {
            setRevealSecret("");
          }}
        />
      ) : null}

      <RevokeKeyModal
        open={Boolean(revokeTarget)}
        keyName={revokeTarget?.name || ""}
        isSubmitting={revoking}
        onCancel={() => {
          setRevokeTarget(null);
        }}
        onConfirm={confirmRevoke}
      />
    </div>
  );
}
