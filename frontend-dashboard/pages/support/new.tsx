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
  const { canViewPage } = useVisibility();
  const [form, setForm] = useState(EMPTY_FORM);
  const [requests, setRequests] = useState<SupportRequest[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const canViewSupportPage = canViewPage("support");

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
    if (!activeWorkspace?.workspace_id) {
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
        <div className="mx-auto max-w-6xl space-y-6">
          <section className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)]">
            <div className="max-w-3xl">
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
                Create Support Request
              </div>
              <h1 className="mt-3 text-[1.6rem] font-semibold tracking-tight text-[var(--text)]">
                Raise a workspace support request
              </h1>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                Use this request when you need temporary support access reviewed or need platform help tied to the current workspace.
              </p>
            </div>
          </section>

          <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
            <section className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                    Target user id
                  </label>
                  <input
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
                    placeholder="Optional support user id"
                    value={form.targetUserId}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, targetUserId: event.target.value }))
                    }
                  />
                </div>

                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                    Requested expiry
                  </label>
                  <input
                    type="datetime-local"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
                    value={form.requestedExpiresAt}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, requestedExpiresAt: event.target.value }))
                    }
                  />
                </div>

                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                    Reason
                  </label>
                  <textarea
                    className="min-h-[160px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
                    placeholder="Describe the issue, the impact, and whether temporary support access is required."
                    value={form.reason}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, reason: event.target.value }))
                    }
                  />
                </div>

                {error ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
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
                    type="button"
                    onClick={handleSubmit}
                    disabled={saving}
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

            <section className="rounded-[1.5rem] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                Recent requests
              </div>
              <div className="mt-4 space-y-3">
                {loading ? (
                  <div className="rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface-strong)] px-4 py-6 text-sm text-[var(--muted)]">
                    Loading support requests...
                  </div>
                ) : requests.length ? (
                  requests.slice(0, 8).map((request) => (
                    <div
                      key={request.id}
                      className="rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] p-4"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="text-sm font-semibold text-[var(--text)]">
                            {request.status}
                          </div>
                          <div className="mt-2 text-sm text-[var(--text)]">{request.reason}</div>
                        </div>
                        <div className="text-xs text-[var(--muted)]">
                          {request.created_at
                            ? new Date(request.created_at).toLocaleString()
                            : "Unknown"}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface-strong)] px-4 py-6 text-sm text-[var(--muted)]">
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
