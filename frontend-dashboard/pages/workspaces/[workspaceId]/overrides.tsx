import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";

import PageAccessNotice from "../../../components/access/PageAccessNotice";
import DashboardLayout from "../../../components/layout/DashboardLayout";
import WorkspaceConsoleTabs from "../../../components/workspace/WorkspaceConsoleTabs";
import WorkspaceStatusBanner from "../../../components/workspace/WorkspaceStatusBanner";
import { useVisibility } from "../../../hooks/useVisibility";
import { auditService } from "../../../services/auditService";
import { workspaceService, type WorkspaceOverview } from "../../../services/workspaceService";
import { notify } from "../../../store/uiStore";

type OverrideForm = {
  agentSeatLimitOverride: string;
  projectLimitOverride: string;
  activeBotLimitOverride: string;
  monthlyCampaignLimitOverride: string;
  maxNumbersOverride: string;
  aiReplyLimitOverride: string;
};

type OverrideCard = {
  label: string;
  formKey: keyof OverrideForm;
  helper: string;
  baseline: number | null;
  override: number | null;
  effective: number | null;
  usage: number | null;
  usageLabel: string;
};

const OVERRIDE_LABELS: Record<keyof OverrideForm, string> = {
  agentSeatLimitOverride: "Users / Seats",
  projectLimitOverride: "Projects",
  activeBotLimitOverride: "Active Bots",
  monthlyCampaignLimitOverride: "Monthly Campaign Runs",
  maxNumbersOverride: "Integrations / Numbers",
  aiReplyLimitOverride: "AI Replies",
};

const OVERRIDE_KEYS = [
  "agent_seat_limit_override",
  "project_limit_override",
  "active_bot_limit_override",
  "monthly_campaign_limit_override",
  "max_numbers_override",
  "ai_reply_limit_override",
] as const;

function toInputValue(value: number | null | undefined) {
  return value === null || value === undefined ? "" : String(value);
}

function buildOverrideForm(overview: WorkspaceOverview): OverrideForm {
  const workspace = overview.workspace;
  return {
    agentSeatLimitOverride: toInputValue(workspace.agent_seat_limit_override),
    projectLimitOverride: toInputValue(workspace.project_limit_override),
    activeBotLimitOverride: toInputValue(workspace.active_bot_limit_override),
    monthlyCampaignLimitOverride: toInputValue(workspace.monthly_campaign_limit_override),
    maxNumbersOverride: toInputValue(workspace.max_numbers_override),
    aiReplyLimitOverride: toInputValue(workspace.ai_reply_limit_override),
  };
}

function formatLimit(value: number | null | undefined) {
  if (value === null || value === undefined || value <= 0) {
    return "Unlimited";
  }
  return String(value);
}

function parseOverrideInput(value: string) {
  if (!value.trim()) {
    return { parsed: null, error: "" };
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return { parsed: null, error: "Use a positive whole number or leave blank to inherit the plan baseline." };
  }

  return { parsed, error: "" };
}

function getOverrideChanges(event: any) {
  return OVERRIDE_KEYS.map((key) => {
    const oldValue = event?.old_data?.[key] ?? null;
    const newValue = event?.new_data?.[key] ?? null;
    if (oldValue === newValue) {
      return null;
    }

    return {
      key,
      label:
        OVERRIDE_LABELS[
          ({
            agent_seat_limit_override: "agentSeatLimitOverride",
            project_limit_override: "projectLimitOverride",
            active_bot_limit_override: "activeBotLimitOverride",
            monthly_campaign_limit_override: "monthlyCampaignLimitOverride",
            max_numbers_override: "maxNumbersOverride",
            ai_reply_limit_override: "aiReplyLimitOverride",
          } as Record<string, keyof OverrideForm>)[key]
        ],
      oldValue: oldValue ?? null,
      newValue: newValue ?? null,
    };
  }).filter(Boolean) as Array<{ key: string; label: string; oldValue: number | null; newValue: number | null }>;
}

export default function WorkspaceOverridesPage() {
  const router = useRouter();
  const { workspaceId } = router.query;
  const { canViewBilling, isPlatformOperator, isReadOnly } = useVisibility();
  const [overview, setOverview] = useState<WorkspaceOverview | null>(null);
  const [form, setForm] = useState<OverrideForm | null>(null);
  const [auditRows, setAuditRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const canViewOverridesPage = canViewBilling || isPlatformOperator;
  const canMutateOverrides = isPlatformOperator && !isReadOnly;
  const normalizedWorkspaceId = String(workspaceId || "").trim();

  const load = async () => {
    if (!normalizedWorkspaceId) {
      return;
    }

    setLoading(true);
    setError("");
    try {
      const [data, auditEvents] = await Promise.all([
        workspaceService.getOverview(normalizedWorkspaceId),
        auditService.listWorkspaceAuditLogs(normalizedWorkspaceId, {
          entity: "workspace",
          limit: 100,
        }),
      ]);
      setOverview(data);
      setForm(buildOverrideForm(data));
      setAuditRows(
        (Array.isArray(auditEvents) ? auditEvents : []).filter((event) => getOverrideChanges(event).length > 0)
      );
    } catch (err: any) {
      setOverview(null);
      setForm(null);
      setAuditRows([]);
      setError(err?.response?.data?.error || "Failed to load limits and overrides.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!normalizedWorkspaceId || !canViewOverridesPage) {
      setOverview(null);
      setForm(null);
      setAuditRows([]);
      return;
    }

    load().catch(console.error);
  }, [normalizedWorkspaceId, canViewOverridesPage]);

  const workspace = overview?.workspace || null;

  const cards = useMemo<OverrideCard[]>(() => {
    if (!overview || !workspace) {
      return [];
    }

    return [
      {
        label: "Users / Seats",
        baseline: workspace.max_users ?? null,
        effective: overview.limits.users,
        override: workspace.agent_seat_limit_override ?? null,
        formKey: "agentSeatLimitOverride",
        helper: "Controls how many member seats this workspace can actively use.",
        usage: overview.metrics.members,
        usageLabel: "active members",
      },
      {
        label: "Projects",
        baseline: workspace.max_projects ?? null,
        effective: overview.limits.projects,
        override: workspace.project_limit_override ?? null,
        formKey: "projectLimitOverride",
        helper: "Used when creating new projects inside this workspace.",
        usage: overview.metrics.projects,
        usageLabel: "projects",
      },
      {
        label: "Active Bots",
        baseline: workspace.max_bots ?? null,
        effective: overview.limits.bots,
        override: workspace.active_bot_limit_override ?? null,
        formKey: "activeBotLimitOverride",
        helper: "Applies to active bot capacity without changing the shared plan.",
        usage: overview.metrics.bots,
        usageLabel: "bots",
      },
      {
        label: "Monthly Campaign Runs",
        baseline: workspace.max_campaigns ?? null,
        effective: overview.limits.campaigns,
        override: workspace.monthly_campaign_limit_override ?? null,
        formKey: "monthlyCampaignLimitOverride",
        helper: "Affects campaign execution checks and monthly throughput enforcement.",
        usage: overview.metrics.campaigns,
        usageLabel: "campaigns",
      },
      {
        label: "Integrations / Numbers",
        baseline: workspace.max_numbers ?? workspace.max_integrations ?? null,
        effective: overview.limits.integrations,
        override: workspace.max_numbers_override ?? null,
        formKey: "maxNumbersOverride",
        helper: "Caps connected platform accounts and number-linked integrations.",
        usage: overview.metrics.integrations,
        usageLabel: "integrations",
      },
      {
        label: "AI Replies",
        baseline: workspace.ai_reply_limit ?? null,
        effective: workspace.ai_reply_limit_override ?? workspace.ai_reply_limit ?? null,
        override: workspace.ai_reply_limit_override ?? null,
        formKey: "aiReplyLimitOverride",
        helper: "Controls included AI reply volume before overage handling applies.",
        usage: null,
        usageLabel: "runtime usage",
      },
    ];
  }, [overview, workspace]);

  const cardValidation = useMemo(() => {
    return Object.fromEntries(
      cards.map((card) => {
        const { parsed, error: parseError } = parseOverrideInput(form?.[card.formKey] || "");
        let hint = parseError;

        if (!hint && parsed !== null && card.usage !== null && parsed < card.usage) {
          hint = `Below current ${card.usageLabel} usage (${card.usage}). New creates will stay blocked until usage drops back under the limit.`;
        } else if (!hint && parsed !== null && card.baseline !== null && parsed === card.baseline) {
          hint = "Matches the plan baseline. Leaving this blank would have the same effective result.";
        } else if (!hint && parsed === null && card.override !== null) {
          hint = "Blank will clear the override and return this workspace to the shared plan baseline.";
        }

        return [card.formKey, hint];
      })
    ) as Record<keyof OverrideForm, string>;
  }, [cards, form]);

  const hasValidationError = Object.values(cardValidation).some((value) =>
    value.startsWith("Use a positive whole number")
  );

  const handleSave = async () => {
    if (!normalizedWorkspaceId || !form) {
      return;
    }

    if (hasValidationError) {
      const message = "Fix the invalid override values before saving.";
      setError(message);
      notify(message, "error");
      return;
    }

    try {
      setSaving(true);
      setError("");
      await workspaceService.update(normalizedWorkspaceId, {
        agentSeatLimitOverride: parseOverrideInput(form.agentSeatLimitOverride).parsed,
        projectLimitOverride: parseOverrideInput(form.projectLimitOverride).parsed,
        activeBotLimitOverride: parseOverrideInput(form.activeBotLimitOverride).parsed,
        monthlyCampaignLimitOverride: parseOverrideInput(form.monthlyCampaignLimitOverride).parsed,
        maxNumbersOverride: parseOverrideInput(form.maxNumbersOverride).parsed,
        aiReplyLimitOverride: parseOverrideInput(form.aiReplyLimitOverride).parsed,
      });
      notify("Workspace overrides updated.", "success");
      await load();
    } catch (err: any) {
      const message = err?.response?.data?.error || "Failed to save workspace overrides.";
      setError(message);
      notify(message, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (!overview) {
      return;
    }
    setForm(buildOverrideForm(overview));
  };

  const handleRollback = async (event: any) => {
    if (!normalizedWorkspaceId) {
      return;
    }

    const changes = getOverrideChanges(event);
    if (!changes.length) {
      return;
    }

    try {
      setSaving(true);
      setError("");
      const payload = Object.fromEntries(
        changes.map((change) => {
          const formKey = ({
            agent_seat_limit_override: "agentSeatLimitOverride",
            project_limit_override: "projectLimitOverride",
            active_bot_limit_override: "activeBotLimitOverride",
            monthly_campaign_limit_override: "monthlyCampaignLimitOverride",
            max_numbers_override: "maxNumbersOverride",
            ai_reply_limit_override: "aiReplyLimitOverride",
          } as Record<string, keyof OverrideForm>)[change.key];
          return [formKey, change.oldValue];
        })
      );

      await workspaceService.update(normalizedWorkspaceId, {
        agentSeatLimitOverride: payload.agentSeatLimitOverride ?? undefined,
        projectLimitOverride: payload.projectLimitOverride ?? undefined,
        activeBotLimitOverride: payload.activeBotLimitOverride ?? undefined,
        monthlyCampaignLimitOverride: payload.monthlyCampaignLimitOverride ?? undefined,
        maxNumbersOverride: payload.maxNumbersOverride ?? undefined,
        aiReplyLimitOverride: payload.aiReplyLimitOverride ?? undefined,
      });
      notify("Override rollback applied.", "success");
      await load();
    } catch (err: any) {
      const message = err?.response?.data?.error || "Failed to rollback overrides.";
      setError(message);
      notify(message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout>
      {!canViewOverridesPage ? (
        <PageAccessNotice
          title="Workspace overrides are restricted for this role"
          description="Custom limit controls are only available to platform billing and operations users."
          href="/workspaces"
          ctaLabel="Open workspaces"
        />
      ) : loading || !workspace || !overview || !form ? (
        <div className="mx-auto max-w-7xl rounded-[1.5rem] border border-dashed border-border-main bg-surface px-5 py-8 text-sm text-text-muted">
          {error || "Loading limits and overrides..."}
        </div>
      ) : (
        <div className="mx-auto max-w-7xl space-y-6">
          <WorkspaceStatusBanner workspace={workspace} />
          <WorkspaceConsoleTabs workspaceId={workspace.id} activeSlug="overrides" />

          <section className="rounded-[1.75rem] border border-border-main bg-surface p-6 shadow-sm">
            <div className="max-w-3xl">
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted">
                Limits & Overrides
              </div>
              <h1 className="mt-3 text-[1.6rem] font-semibold tracking-tight text-text-main">
                Plan baseline vs workspace override
              </h1>
              <p className="mt-2 text-sm leading-6 text-text-muted">
                Compare the shared plan allowance against this workspace-specific override before saving. Blank values inherit the plan baseline immediately.
              </p>
            </div>
          </section>

          {error ? (
            <section className="rounded-[1.5rem] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </section>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {cards.map((card) => {
              const nextValue = parseOverrideInput(form[card.formKey]).parsed;
              const pendingEffective = nextValue ?? card.baseline;
              const change =
                card.baseline !== null && pendingEffective !== null
                  ? pendingEffective - card.baseline
                  : null;

              return (
                <section
                  key={card.label}
                  className="rounded-[1.25rem] border border-border-main bg-surface p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                      {card.label}
                    </div>
                    <div className="rounded-full border border-border-main bg-primary-fade px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
                      {change === null ? "inherit" : change === 0 ? "no diff" : change > 0 ? `+${change}` : String(change)}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-[1rem] border border-border-main bg-canvas px-3 py-3">
                      <div className="text-[10px] uppercase tracking-[0.14em] text-text-muted">Plan baseline</div>
                      <div className="mt-2 text-lg font-semibold text-text-main">{formatLimit(card.baseline)}</div>
                    </div>
                    <div className="rounded-[1rem] border border-border-main bg-canvas px-3 py-3">
                      <div className="text-[10px] uppercase tracking-[0.14em] text-text-muted">Current override</div>
                      <div className="mt-2 text-lg font-semibold text-text-main">{formatLimit(card.override)}</div>
                    </div>
                    <div className="rounded-[1rem] border border-border-main bg-canvas px-3 py-3">
                      <div className="text-[10px] uppercase tracking-[0.14em] text-text-muted">Effective limit</div>
                      <div className="mt-2 text-lg font-semibold text-text-main">{formatLimit(card.effective)}</div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-[1rem] border border-border-main bg-canvas px-4 py-3 text-sm text-text-muted">
                    {card.usage !== null ? (
                      <>Current usage: <span className="font-semibold text-text-main">{card.usage}</span> {card.usageLabel}</>
                    ) : (
                      <>Current usage: <span className="font-semibold text-text-main">Not surfaced yet</span></>
                    )}
                  </div>

                  <div className="mt-4">
                    <label className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                      Override value
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={form[card.formKey]}
                      onChange={(event) =>
                        setForm((current) =>
                          current
                            ? {
                                ...current,
                                [card.formKey]: event.target.value,
                              }
                            : current
                        )
                      }
                      className="w-full rounded-2xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                      placeholder="Leave blank to inherit the plan baseline"
                    />
                  </div>

                  <div className={`mt-3 text-sm leading-6 ${cardValidation[card.formKey] ? "text-amber-700" : "text-text-muted"}`}>
                    {cardValidation[card.formKey] || card.helper}
                  </div>
                </section>
              );
            })}
          </div>

          <section className="rounded-[1.5rem] border border-border-main bg-surface p-6 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                  Save overrides
                </div>
                <div className="mt-2 text-sm text-text-muted">
                  These changes affect quota enforcement across users, projects, bots, campaigns, integrations, and AI replies.
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleReset}
                  className="rounded-[1rem] border border-border-main bg-canvas px-4 py-3 text-sm text-text-main"
                >
                  Reset form
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || !canMutateOverrides}
                  className="rounded-[1rem] border border-primary bg-primary px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save overrides"}
                </button>
              </div>
            </div>
          </section>

          <section className="rounded-[1.5rem] border border-border-main bg-surface p-6 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                  Override audit history
                </div>
                <div className="mt-2 text-sm text-text-muted">
                  Showing only workspace audit events that changed a limit override.
                </div>
              </div>
              <button
                type="button"
                onClick={() => load().catch(console.error)}
                className="rounded-[1rem] border border-border-main bg-canvas px-4 py-3 text-sm text-text-main"
              >
                Refresh history
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {auditRows.length ? (
                auditRows.map((event) => {
                  const changes = getOverrideChanges(event);
                  const actor =
                    event.actor_user_name ||
                    event.actor_user_email ||
                    event.user_name ||
                    event.user_email ||
                    "system";

                  return (
                    <div
                      key={event.id}
                      className="rounded-[1.1rem] border border-border-main bg-canvas p-4"
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-2">
                          <div className="text-sm font-semibold text-text-main">
                            {event.action === "archive" ? "Workspace archived" : "Override update"}
                          </div>
                          <div className="text-xs uppercase tracking-[0.16em] text-text-muted">
                            {actor}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {changes.map((change) => (
                              <div
                                key={`${event.id}-${change.key}`}
                                className="rounded-full border border-border-main bg-surface px-3 py-1 text-[11px] text-text-main"
                              >
                                {change.label}: {formatLimit(change.oldValue)} to {formatLimit(change.newValue)}
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-3">
                          <div className="text-xs text-text-muted">
                            {event.created_at ? new Date(event.created_at).toLocaleString() : "Unknown time"}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRollback(event)}
                            disabled={saving || !canMutateOverrides}
                            className="rounded-[0.9rem] border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 disabled:opacity-50"
                          >
                            Roll back to previous values
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="rounded-[1rem] border border-dashed border-border-main bg-canvas px-4 py-6 text-sm text-text-muted">
                  No override-specific audit history yet.
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </DashboardLayout>
  );
}
