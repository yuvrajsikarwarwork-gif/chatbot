import { AlertTriangle, Clock, RefreshCcw, X } from "lucide-react";

import { VersionCompareFeed, type FlowVersionComparison } from "./VersionCompareFeed";

type FlowVersionRecord = {
  id: string;
  version_number: number;
  flow_id: string;
  flow_json?: Record<string, any> | null;
  triggers_json?: Record<string, any>[] | string | null;
  published_by?: string | null;
  published_at?: string | null;
  change_summary?: string | null;
  created_at?: string | null;
};

interface FlowVersionHistoryModalProps {
  isOpen: boolean;
  flowName?: string | null;
  versions: FlowVersionRecord[];
  selectedVersionNumber: number | null;
  comparison: FlowVersionComparison | null;
  loadingVersions: boolean;
  comparingVersions: boolean;
  versionsError: string;
  compareError: string;
  canRollback: boolean;
  isRollingBack: boolean;
  onClose: () => void;
  onSelectVersion: (versionNumber: number) => void;
  onRollback: () => void;
}

function formatDateTime(value?: string | null) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function FlowVersionHistoryModal({
  isOpen,
  flowName,
  versions,
  selectedVersionNumber,
  comparison,
  loadingVersions,
  comparingVersions,
  versionsError,
  compareError,
  canRollback,
  isRollingBack,
  onClose,
  onSelectVersion,
  onRollback,
}: FlowVersionHistoryModalProps) {
  if (!isOpen) {
    return null;
  }

  const currentVersionNumber = versions[0]?.version_number || null;

  return (
    <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm">
      <div className="flex h-[90vh] w-full max-w-7xl flex-col overflow-hidden rounded-[1.5rem] border border-border-main bg-surface shadow-sm">
        <div className="flex items-center justify-between border-b border-border-main bg-canvas px-5 py-4">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">
              Version history
            </div>
            <div className="mt-1 text-lg font-semibold text-text-main">
              {flowName || "Untitled flow"}
            </div>
            <div className="mt-1 text-xs text-text-muted">
              Compare a published snapshot against the current version before rolling back.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border-main bg-surface p-2 text-text-muted transition hover:bg-primary/10 hover:text-primary"
            title="Close version history"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="min-h-0 border-r border-border-main bg-canvas p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">
                  Published versions
                </div>
                <div className="mt-1 text-sm text-text-muted">
                  Select the version you want to restore.
                </div>
              </div>
              <div className="rounded-full border border-border-main bg-surface px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-text-muted">
                {versions.length} total
              </div>
            </div>

            <div className="mt-4 max-h-[calc(90vh-190px)] space-y-2 overflow-auto pr-1">
              {loadingVersions ? (
                <div className="rounded-xl border border-dashed border-border-main bg-surface px-4 py-6 text-sm text-text-muted">
                  Loading version history...
                </div>
              ) : versionsError ? (
                <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-4 text-sm text-rose-700">
                  {versionsError}
                </div>
              ) : versions.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border-main bg-surface px-4 py-6 text-sm text-text-muted">
                  No versions have been published yet.
                </div>
              ) : (
                versions.map((version) => {
                  const isSelected = version.version_number === selectedVersionNumber;
                  const isCurrent = version.version_number === currentVersionNumber;

                  return (
                    <button
                      key={version.id}
                      type="button"
                      onClick={() => onSelectVersion(version.version_number)}
                      className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                        isSelected
                          ? "border-primary bg-primary/10 shadow-sm"
                          : "border-border-main bg-surface hover:bg-primary/5"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <div className="text-sm font-semibold text-text-main">v{version.version_number}</div>
                            {isCurrent ? (
                              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-700">
                                Current
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-1 text-xs text-text-muted">
                            {version.change_summary || "No summary provided"}
                          </div>
                        </div>
                        {isSelected ? <span className="text-[10px] font-black uppercase tracking-[0.16em] text-primary">Selected</span> : null}
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-text-muted">
                        <span className="inline-flex items-center gap-1.5">
                          <Clock size={12} />
                          {formatDateTime(version.published_at || version.created_at)}
                        </span>
                        <span className="rounded-full bg-canvas px-2 py-1 font-medium">
                          {version.flow_id}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          <main className="min-h-0 overflow-hidden p-4">
            <div className="flex h-full min-h-0 flex-col rounded-2xl border border-border-main bg-surface">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-main bg-canvas px-4 py-3">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">
                    Impact preview
                  </div>
                  <div className="mt-1 text-sm text-text-muted">
                    Changes shown against the currently published version.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onRollback}
                  disabled={!canRollback || isRollingBack || !selectedVersionNumber}
                  className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isRollingBack ? <RefreshCcw size={13} className="animate-spin" /> : <AlertTriangle size={13} />}
                  {isRollingBack ? "Restoring..." : selectedVersionNumber ? `Rollback to v${selectedVersionNumber}` : "Rollback"}
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-auto p-4">
                {compareError ? (
                  <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-4 text-sm text-rose-700">
                    {compareError}
                  </div>
                ) : comparingVersions ? (
                  <div className="rounded-xl border border-dashed border-border-main bg-canvas px-4 py-6 text-sm text-text-muted">
                    Computing version comparison...
                  </div>
                ) : comparison ? (
                  <VersionCompareFeed diffData={comparison} />
                ) : (
                  <div className="rounded-xl border border-dashed border-border-main bg-canvas px-4 py-6 text-sm text-text-muted">
                    {selectedVersionNumber
                      ? "Select a version to preview what will change."
                      : "Choose a version on the left to see the impact preview."}
                  </div>
                )}
              </div>
            </div>
          </main>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border-main bg-canvas px-5 py-4">
          <div className="text-xs text-text-muted">
            {currentVersionNumber ? `Current published version: v${currentVersionNumber}` : "No published versions loaded"}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border-main bg-surface px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-text-main transition hover:bg-primary/10 hover:text-primary"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
