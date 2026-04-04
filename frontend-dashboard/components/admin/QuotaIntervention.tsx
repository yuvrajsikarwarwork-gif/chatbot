import { useEffect, useMemo, useState } from "react";

import { PLAN_TIER_DEFAULTS, normalizePlanTier, type PlanTier } from "../../constants/plans";
import { adminService, type OrganizationSummary, type OrganizationUsage } from "../../services/adminService";
import { confirmAction, notify } from "../../store/uiStore";

type QuotaInterventionProps = {
  organization: OrganizationSummary | null;
  onUpdated: (organization: OrganizationSummary) => void;
};

function toNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export default function QuotaIntervention({ organization, onUpdated }: QuotaInterventionProps) {
  const [selectedPlan, setSelectedPlan] = useState<PlanTier>("free");
  const [quotaMessages, setQuotaMessages] = useState(organization?.quotaMessages ?? 1000);
  const [quotaAiTokens, setQuotaAiTokens] = useState(organization?.quotaAiTokens ?? 50000);
  const [usage, setUsage] = useState<OrganizationUsage | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const normalizedPlan = normalizePlanTier(organization?.planTier);
    setSelectedPlan(normalizedPlan);
    setQuotaMessages(organization?.quotaMessages ?? 1000);
    setQuotaAiTokens(organization?.quotaAiTokens ?? 50000);
    setReason("");
  }, [organization?.id, organization?.planTier, organization?.quotaAiTokens, organization?.quotaMessages]);

  useEffect(() => {
    if (!organization?.id) {
      setUsage(null);
      return;
    }

    let cancelled = false;
    setUsageLoading(true);

    adminService
      .getOrganizationUsage(organization.id)
      .then((result) => {
        if (!cancelled) {
          setUsage(result);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUsage(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setUsageLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [organization?.id]);

  const reductions = useMemo(() => {
    const currentMessages = organization?.quotaMessages ?? 0;
    const currentTokens = organization?.quotaAiTokens ?? 0;
    return {
      messages: quotaMessages < currentMessages,
      tokens: quotaAiTokens < currentTokens,
    };
  }, [organization?.quotaAiTokens, organization?.quotaMessages, quotaAiTokens, quotaMessages]);

  const usageWarnings = useMemo(() => {
    const messageUsage = usage?.messages ?? 0;
    const tokenUsage = usage?.tokens ?? 0;
    return {
      messages: quotaMessages < messageUsage,
      tokens: quotaAiTokens < tokenUsage,
    };
  }, [quotaAiTokens, quotaMessages, usage?.messages, usage?.tokens]);

  const handlePlanChange = (plan: PlanTier) => {
    setSelectedPlan(plan);
    const defaults = PLAN_TIER_DEFAULTS[plan];
    if (defaults) {
      setQuotaMessages(defaults.messages);
      setQuotaAiTokens(defaults.tokens);
    }
  };

  const handleSave = async () => {
    if (!organization) {
      return;
    }

    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      notify("An audit reason is required for quota overrides.", "error");
      return;
    }

    const isReducing = reductions.messages || reductions.tokens;
    if (isReducing) {
      const confirmed = await confirmAction(
        "Confirm quota reduction",
        "You are reducing an active quota. This can block traffic if the org is already near capacity. Continue?",
        "Lower quota",
        "Cancel"
      );
      if (!confirmed) {
        return;
      }
    }

    const isUsageCritical = usageWarnings.messages || usageWarnings.tokens;
    if (isUsageCritical) {
      const confirmed = await confirmAction(
        "Quota below current usage",
        "The proposed quota is lower than the organization's month-to-date usage. Saving will immediately block traffic or AI processing for new events. Continue?",
        "Apply anyway",
        "Cancel"
      );
      if (!confirmed) {
        return;
      }
    }

    setSaving(true);
    try {
      const updated = await adminService.updateOrganizationQuotas(organization.id, {
        planTier: selectedPlan,
        quotaMessages,
        quotaAiTokens,
        reason: trimmedReason,
      });
      onUpdated(updated);
      notify("Organization quotas updated.", "success");
      setReason("");
    } catch (error: any) {
      notify(error?.response?.data?.error || "Failed to update organization quotas.", "error");
    } finally {
      setSaving(false);
    }
  };

  if (!organization) {
    return (
      <div className="rounded-[1.5rem] border border-dashed border-border-main bg-canvas p-6 text-sm text-text-muted">
        Load an organization before opening the quota intervention panel.
      </div>
    );
  }

  return (
    <div className="rounded-[1.75rem] border border-border-main bg-surface p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.22em] text-text-muted">
            Quota Intervention
          </div>
          <h3 className="mt-1 text-lg font-semibold tracking-tight text-text-main">
            Active override controls
          </h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-text-muted">
            Adjust the live message and AI token ceilings for this organization. Every change requires an audit reason and is logged as a governance event.
          </p>
        </div>

        <div className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-amber-700">
          Override Active
        </div>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1fr_1fr]">
        <div className="rounded-[1.25rem] border border-border-main bg-canvas p-4 shadow-sm xl:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">
                Subscription tier
              </div>
              <p className="mt-1 text-sm text-text-muted">
                Selecting a tier snaps the sliders to a recommended quota baseline. You can still fine-tune the numbers afterward.
              </p>
            </div>
            <div className={`rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-[0.18em] ${PLAN_TIER_DEFAULTS[selectedPlan].color}`}>
              {PLAN_TIER_DEFAULTS[selectedPlan].label}
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {(Object.keys(PLAN_TIER_DEFAULTS) as PlanTier[]).map((plan) => {
              const defaults = PLAN_TIER_DEFAULTS[plan];
              const active = selectedPlan === plan;
              return (
                <button
                  key={plan}
                  type="button"
                  onClick={() => handlePlanChange(plan)}
                  className={`rounded-2xl border px-4 py-3 text-left transition ${
                    active
                      ? "border-primary/30 bg-white shadow-sm"
                      : "border-border-main bg-surface hover:border-primary/20 hover:bg-primary-fade/40"
                  }`}
                >
                  <div className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] ${defaults.color}`}>
                    {defaults.label}
                  </div>
                  <div className="mt-2 text-sm font-semibold text-text-main">
                    {plan.toUpperCase()}
                  </div>
                  <div className="mt-1 text-[10px] leading-5 text-text-muted">
                    {defaults.messages.toLocaleString()} messages / {defaults.tokens.toLocaleString()} tokens
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <QuotaSlider
          label="Monthly message limit"
          value={quotaMessages}
          min={1000}
          max={1000000}
          step={1000}
          onChange={setQuotaMessages}
          reduction={reductions.messages}
          usage={usage?.messages ?? null}
          loading={usageLoading}
          critical={usageWarnings.messages}
        />
        <QuotaSlider
          label="AI token budget"
          value={quotaAiTokens}
          min={10000}
          max={10000000}
          step={10000}
          onChange={setQuotaAiTokens}
          reduction={reductions.tokens}
          usage={usage?.tokens ?? null}
          loading={usageLoading}
          critical={usageWarnings.tokens}
        />
      </div>

      <div className="mt-6 rounded-[1.25rem] border border-border-main bg-canvas p-4">
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">
          Current active quotas
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <StatLine label="Current plan tier" value={String(organization.planTier || "free").replace(/_/g, " ")} />
          <StatLine label="Message limit" value={Number(organization.quotaMessages || 0).toLocaleString()} />
          <StatLine label="AI token limit" value={Number(organization.quotaAiTokens || 0).toLocaleString()} />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <StatLine
            label="Month-to-date messages"
            value={usageLoading ? "Loading..." : Number(usage?.messages || 0).toLocaleString()}
            critical={usageWarnings.messages}
          />
          <StatLine
            label="Month-to-date tokens"
            value={usageLoading ? "Loading..." : Number(usage?.tokens || 0).toLocaleString()}
            critical={usageWarnings.tokens}
          />
        </div>
      </div>

      <div className="mt-6 rounded-[1.25rem] border border-border-main bg-white p-4">
        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">
          Audit reason / support ticket id
        </label>
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="e.g. Enterprise upgrade for Q2 campaign, ticket GOV-4821"
          className="mt-2 min-h-[90px] w-full rounded-xl border border-border-main bg-canvas p-3 text-sm text-text-main outline-none transition focus:border-primary/30 focus:ring-2 focus:ring-primary/10"
        />
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="text-[10px] font-medium leading-5 text-text-muted">
          Reducing quotas below the current level will prompt a confirmation before saving.
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !reason.trim()}
          className={`inline-flex items-center justify-center rounded-xl px-4 py-3 text-[10px] font-black uppercase tracking-[0.18em] transition ${
            saving || !reason.trim()
              ? "cursor-not-allowed border border-border-main bg-canvas text-text-muted"
              : "border border-gray-900 bg-gray-900 text-white hover:bg-black"
          }`}
        >
          {saving ? "Applying overrides..." : "Commit changes"}
        </button>
      </div>
    </div>
  );
}

function QuotaSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  reduction,
  usage,
  loading,
  critical,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  reduction: boolean;
  usage: number | null;
  loading: boolean;
  critical: boolean;
}) {
  return (
    <div className={`rounded-[1.25rem] border p-4 shadow-sm ${reduction ? "border-amber-200 bg-amber-50/60" : "border-border-main bg-white"}`}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">
            {label}
          </div>
          {reduction ? (
            <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-700">
              Lower than current active quota
            </div>
          ) : null}
        </div>
        <div className="font-mono text-lg font-bold text-primary">{value.toLocaleString()}</div>
      </div>

      <div className="mt-3 space-y-2">
        <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">
          <span>Month-to-date usage</span>
          <span>{loading ? "Loading..." : Number(usage || 0).toLocaleString()}</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-canvas">
          <div
            className={`h-full transition-all ${critical ? "bg-rose-500" : "bg-primary"}`}
            style={{ width: `${Math.min((Number(usage || 0) / Math.max(value, 1)) * 100, 100)}%` }}
          />
        </div>
        {critical ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[9px] font-black uppercase tracking-[0.16em] text-rose-700">
            Proposed limit is below current usage
          </div>
        ) : null}
      </div>

      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(toNumber(event.target.value, value))}
        className="mt-4 h-1.5 w-full cursor-pointer appearance-none rounded-lg accent-primary"
      />

      <div className="mt-3 flex items-center justify-between text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">
        <span>{min.toLocaleString()}</span>
        <span>{max.toLocaleString()}</span>
      </div>
    </div>
  );
}

function StatLine({ label, value, critical = false }: { label: string; value: string; critical?: boolean }) {
  return (
    <div className={`rounded-[1rem] border px-4 py-3 ${critical ? "border-rose-200 bg-rose-50" : "border-border-main bg-white"}`}>
      <div className="text-[9px] font-black uppercase tracking-[0.18em] text-text-muted">{label}</div>
      <div className="mt-1 text-sm font-semibold text-text-main">{value}</div>
    </div>
  );
}
