import Link from "next/link";
import { useEffect, useState } from "react";

import PageAccessNotice from "../../components/access/PageAccessNotice";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { useVisibility } from "../../hooks/useVisibility";
import { workspaceService, type SupportRequest } from "../../services/workspaceService";
import { useAuthStore } from "../../store/authStore";

const EMPTY_FORM = {
  targetUserId: "",
  reason: "",
  requestedExpiresAt: "",
};

function normalizeRequestedExpiry(value: string) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return undefined;
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return parsed.toISOString();
}

export default function SupportRequestPage() {
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);
  const { canViewPage, isReadOnly } = useVisibility();
  const [form, setForm] = useState(EMPTY_FORM);
  const [requests, setRequests] = useState<SupportRequest[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const canViewSupportPage = canViewPage("support");
  const canCreateSupportRequest = canViewSupportPage && !isReadOnly;

  const loadRequests = async () => {
    if (!activeWorkspace?.workspace_id || !canViewSupportPage) {
      setRequests([]);
      return;
    }

    setLoading(true);
    try {
      const data = await workspaceService.listSupportRequests(activeWorkspace.workspace_id);
      setRequests(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error("Failed to load support requests", err);
      setRequests([]);
      setError(err?.response?.data?.error || "Failed to load support requests");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests().catch(console.error);
  }, [activeWorkspace?.workspace_id, canViewSupportPage]);

  const handleSubmit = async () => {
    if (!activeWorkspace?.workspace_id || !canCreateSupportRequest) {
      setError("Select a workspace before creating a support request.");
      return;
    }

    if (!form.reason.trim()) {
      setError("A support request reason is required.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");
      await workspaceService.createSupportRequest(activeWorkspace.workspace_id, {
        targetUserId: form.targetUserId.trim() || undefined,
        reason: form.reason.trim(),
        requestedExpiresAt: normalizeRequestedExpiry(form.requestedExpiresAt),
      });
      setForm(EMPTY_FORM);
      setSuccess("Support request created.");
      await loadRequests();
    } catch (err: any) {
      console.error("Failed to create support request", err);
      setError(err?.response?.data?.error || "Failed to create support request");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout>
      {!canViewSupportPage ? (
        <PageAccessNotice
          title="Support requests are restricted for this role"
          description="Only workspace operators and platform support users can create support requests."
          href="/support"
          ctaLabel="Open support"
        />
      ) : (
        <div className="mx-auto max-w-7xl space-y-6">
          <section className="rounded-[1.9rem] border border-border-main bg-surface p-6 shadow-sm">
            <div className="max-w-3xl">
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted">
                Create Support Request
              </div>
              <h1 className="mt-3 text-[1.7rem] font-black tracking-[-0.03em] text-text-main">
                Raise a workspace support request
              </h1>
              <p className="mt-2 text-sm leading-6 text-text-muted">
                Use this request when you need temporary support access reviewed or need platform help tied to the current workspace.
              </p>
            </div>
          </section>

          <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
            <section className="rounded-[1.65rem] border border-border-main bg-surface p-6 shadow-sm">
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                    Target user id
                  </label>
                  <input
                    className="w-full rounded-2xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    placeholder="Optional support user id"
                    value={form.targetUserId}
                    disabled={!canCreateSupportRequest}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, targetUserId: event.target.value }))
                    }
                  />
                </div>

                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                    Requested expiry
                  </label>
                  <input
                    type="datetime-local"
                    className="w-full rounded-2xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    value={form.requestedExpiresAt}
                    disabled={!canCreateSupportRequest}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, requestedExpiresAt: event.target.value }))
                    }
                  />
                </div>

                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                    Reason
                  </label>
                  <textarea
                    className="min-h-[160px] w-full rounded-2xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    placeholder="Describe the issue, the impact, and whether temporary support access is required."
                    value={form.reason}
                    disabled={!canCreateSupportRequest}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, reason: event.target.value }))
                    }
                  />
                </div>

                {error ? (
                  <div className="rounded-[1.4rem] border border-rose-300/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                    {error}
                  </div>
                ) : null}

                {success ? (
                  <div className="rounded-[1.4rem] border border-emerald-300/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-900">
                    {success}
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={saving || !canCreateSupportRequest}
                    className="inline-flex items-center rounded-xl bg-[var(--accent-strong)] px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-white disabled:opacity-60"
                  >
                    {saving ? "Submitting..." : "Create request"}
                  </button>
                  <Link
                    href="/support/tickets"
                    className="inline-flex items-center rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text)]"
                  >
                    View requests
                  </Link>
                </div>
              </div>
            </section>

            <section className="rounded-[1.65rem] border border-border-main bg-surface p-6 shadow-sm">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                Recent requests
              </div>
              <div className="mt-4 space-y-3">
                {loading ? (
                  <div className="rounded-xl border border-dashed border-border-main bg-canvas px-4 py-6 text-sm text-text-muted">
                    Loading support requests...
                  </div>
                ) : requests.length ? (
                  requests.slice(0, 8).map((request) => (
                    <div
                      key={request.id}
                      className="rounded-[1.2rem] border border-border-main bg-canvas p-4 shadow-sm transition duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-primary-fade"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="text-sm font-semibold text-text-main">
                            {request.status}
                          </div>
                          <div className="mt-2 text-sm text-text-main">{request.reason}</div>
                        </div>
                        <div className="text-xs text-text-muted">
                          {request.created_at
                            ? new Date(request.created_at).toLocaleString()
                            : "Unknown"}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-border-main bg-canvas px-4 py-6 text-sm text-text-muted">
                    No support requests recorded for the active workspace yet.
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

