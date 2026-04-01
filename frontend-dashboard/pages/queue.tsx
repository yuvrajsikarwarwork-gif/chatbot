import { useEffect, useMemo, useState } from "react";

import DashboardLayout from "../components/layout/DashboardLayout";
import { queueService, type QueueJobRecord } from "../services/queueService";
import { useVisibility } from "../hooks/useVisibility";
import PageAccessNotice from "../components/access/PageAccessNotice";
import SectionTabs from "../components/navigation/SectionTabs";
import { useAuthStore } from "../store/authStore";

export default function QueuePage() {
  const { canViewPage } = useVisibility();
  const userRole = useAuthStore((state) => state.user?.role || "");
  const canViewAdminPage =
    canViewPage("system_settings") || ["super_admin", "developer"].includes(String(userRole));
  const [jobs, setJobs] = useState<QueueJobRecord[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retryingJobId, setRetryingJobId] = useState("");
  const [bulkRetrying, setBulkRetrying] = useState(false);
  const [statusFilter, setStatusFilter] = useState("failed");
  const [typeFilter, setTypeFilter] = useState("");
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);
  const visibleCount = jobs.length;

  const tabs = useMemo(
    () => [
      { label: "Queue", href: "/queue" },
      { label: "System Settings", href: "/system-settings" },
      { label: "Plans", href: "/plans" },
    ],
    []
  );

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await queueService.list({
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(typeFilter ? { jobType: typeFilter } : {}),
      });
      setJobs(Array.isArray(data.jobs) ? data.jobs : []);
      setSummary(data.summary || {});
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to load queue jobs");
      setJobs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [statusFilter, typeFilter, activeWorkspace?.workspace_id]);

  useEffect(() => {
    setSelectedJobIds([]);
  }, [statusFilter, typeFilter, activeWorkspace?.workspace_id]);

  const handleRetry = async (jobId: string) => {
    setRetryingJobId(jobId);
    setError("");
    try {
      await queueService.retry(jobId);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error || "Retry failed");
    } finally {
      setRetryingJobId("");
    }
  };

  const handleRetryAll = async () => {
    setBulkRetrying(true);
    setError("");
    try {
      await queueService.retryAll({
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(typeFilter ? { jobType: typeFilter } : {}),
      });
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error || "Bulk retry failed");
    } finally {
      setBulkRetrying(false);
    }
  };

  const handleRetryFailedOnly = async () => {
    setBulkRetrying(true);
    setError("");
    try {
      await queueService.retryAll({
        status: "failed",
        ...(typeFilter ? { jobType: typeFilter } : {}),
      });
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error || "Bulk retry failed");
    } finally {
      setBulkRetrying(false);
    }
  };

  const toggleJobSelection = (jobId: string) => {
    setSelectedJobIds((current) =>
      current.includes(jobId) ? current.filter((id) => id !== jobId) : [...current, jobId]
    );
  };

  const handleSelectVisible = () => {
    setSelectedJobIds(jobs.map((job) => job.id));
  };

  const handleClearSelection = () => {
    setSelectedJobIds([]);
  };

  const handleRetrySelected = async () => {
    if (selectedJobIds.length === 0) return;
    setBulkRetrying(true);
    setError("");
    try {
      await Promise.all(selectedJobIds.map((jobId) => queueService.retry(jobId)));
      setSelectedJobIds([]);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error || "Selected retry failed");
    } finally {
      setBulkRetrying(false);
    }
  };

  return (
    <DashboardLayout>
      {!canViewAdminPage ? (
        <PageAccessNotice
          title="Queue dashboard is restricted for this role"
          description="Queue monitoring is only available to platform operators."
          href="/dashboard"
          ctaLabel="Open dashboard"
        />
      ) : (
        <div className="mx-auto max-w-7xl space-y-6">
          <header className="rounded-[1.75rem] border border-border-main bg-surface p-6 shadow-[var(--shadow-soft)]">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted">Runtime</div>
                <h1 className="mt-3 text-[1.6rem] font-semibold tracking-tight text-text-main">Dead-letter queue dashboard</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">
                  Review failed jobs, retry stuck runs, and inspect the queue that powers flow wait reminders, scheduled broadcasts, and export jobs.
                </p>
              </div>
              <SectionTabs items={tabs} currentPath="/queue" />
            </div>
          </header>

          {error ? (
            <section className="rounded-[1.5rem] border border-rose-300/40 bg-rose-500/10 p-4 text-sm text-rose-700">
              {error}
            </section>
          ) : null}

          <section className="grid gap-3 md:grid-cols-4">
            {[
              { label: "Total", value: summary.total || 0 },
              { label: "Failed", value: summary.failed || 0 },
              { label: "Retry", value: summary.retry || 0 },
              { label: "Processing", value: summary.processing || 0 },
            ].map((card) => (
              <div key={card.label} className="rounded-2xl border border-border-main bg-surface px-4 py-3">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">{card.label}</div>
                <div className="mt-1 text-lg font-semibold text-text-main">{card.value}</div>
              </div>
            ))}
          </section>

          <section className="rounded-[1.5rem] border border-border-main bg-surface p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">Operator snapshot</div>
                <div className="mt-1 text-sm text-text-main">{visibleCount} jobs visible with the current filters.</div>
                <div className="mt-1 text-xs text-text-muted">{selectedJobIds.length} jobs selected for batch triage.</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleSelectVisible}
                  className="rounded-full border border-border-main bg-canvas px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-text-main"
                >
                  Select visible
                </button>
                <button
                  type="button"
                  onClick={handleClearSelection}
                  className="rounded-full border border-border-main bg-canvas px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-text-main"
                >
                  Clear selection
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter("failed");
                    setTypeFilter("");
                  }}
                  className="rounded-full border border-border-main bg-canvas px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-text-main"
                >
                  Focus failed
                </button>
                <button
                  type="button"
                  onClick={handleRetryAll}
                  disabled={bulkRetrying}
                  className="rounded-full border border-primary bg-primary-fade px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {bulkRetrying ? "Retrying..." : "Retry visible"}
                </button>
                <button
                  type="button"
                  onClick={handleRetryFailedOnly}
                  disabled={bulkRetrying}
                  className="rounded-full border border-primary bg-primary px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {bulkRetrying ? "Retrying..." : "Retry failed only"}
                </button>
                <button
                  type="button"
                  onClick={handleRetrySelected}
                  disabled={bulkRetrying || selectedJobIds.length === 0}
                  className="rounded-full border border-primary bg-primary-fade px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {bulkRetrying ? "Retrying..." : `Retry selected (${selectedJobIds.length})`}
                </button>
              </div>
            </div>
          </section>

          <section className="rounded-[1.5rem] border border-border-main bg-surface p-6 shadow-sm">
            <div className="grid gap-3 md:grid-cols-3">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-2xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main outline-none"
              >
                <option value="">All statuses</option>
                <option value="failed">failed</option>
                <option value="retry">retry</option>
                <option value="pending">pending</option>
                <option value="processing">processing</option>
                <option value="completed">completed</option>
              </select>
              <input
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                placeholder="Filter by job type"
                className="rounded-2xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main outline-none placeholder:text-text-muted"
              />
              <button
                type="button"
                onClick={() => void load()}
                className="rounded-2xl border border-primary bg-primary px-4 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-white"
              >
                Refresh
              </button>
            </div>
            <div className="mt-5 space-y-3">
              {loading ? (
                <div className="rounded-2xl border border-dashed border-border-main bg-canvas px-4 py-6 text-sm text-text-muted">
                  Loading queue jobs...
                </div>
              ) : jobs.length ? (
                jobs.map((job) => (
                  <div key={job.id} className="rounded-2xl border border-border-main bg-canvas p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={selectedJobIds.includes(job.id)}
                          onChange={() => toggleJobSelection(job.id)}
                          className="mt-1 h-4 w-4 rounded border-border-main text-primary focus:ring-primary"
                        />
                        <div>
                          <div className="text-xs font-black uppercase tracking-[0.18em] text-text-muted">{job.jobType}</div>
                          <div className="mt-1 text-sm font-semibold text-text-main">{job.status}</div>
                          <div className="mt-1 text-xs text-text-muted">
                            {job.errorMessage || "No error message"} · retries {job.retryCount}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRetry(job.id)}
                        disabled={retryingJobId === job.id}
                        className="rounded-full border border-primary bg-primary-fade px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-primary disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {retryingJobId === job.id ? "Retrying..." : "Retry now"}
                      </button>
                    </div>
                    <pre className="mt-3 overflow-x-auto rounded-xl border border-border-main bg-surface px-3 py-3 text-[11px] leading-5 text-text-muted">
                      {JSON.stringify(job.payload || {}, null, 2)}
                    </pre>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-border-main bg-canvas px-4 py-6 text-sm text-text-muted">
                  No queue jobs match the current filters.
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </DashboardLayout>
  );
}
