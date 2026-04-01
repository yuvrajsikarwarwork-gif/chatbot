import { useEffect, useMemo, useState } from "react";

import PageAccessNotice from "../components/access/PageAccessNotice";
import DashboardLayout from "../components/layout/DashboardLayout";
import { useVisibility } from "../hooks/useVisibility";
import { planService, type Plan } from "../services/planService";
import { confirmAction, notify } from "../store/uiStore";

const EMPTY_FORM: Partial<Plan> = {
  id: "",
  name: "",
  description: "",
  monthly_price_inr: 0,
  yearly_price_inr: 0,
  monthly_price_usd: 0,
  yearly_price_usd: 0,
  max_campaigns: 0,
  max_numbers: 0,
  max_users: 0,
  max_projects: 0,
  max_integrations: 0,
  max_bots: 0,
  included_users: 0,
  workspace_limit: 1,
  project_limit: 0,
  agent_seat_limit: 0,
  active_bot_limit: 0,
  monthly_campaign_limit: 0,
  ai_reply_limit: 0,
  extra_agent_seat_price_inr: 0,
  pricing_model: "standard",
  support_tier: "standard",
  allowed_platforms: ["whatsapp", "website", "api"],
  features: {},
  wallet_pricing: {},
  status: "active",
};

type WalletPricingRow = {
  key: string;
  amount: string;
};

const PLAN_FORM_SECTIONS: Array<{
  title: string;
  fields: Array<[string, string, string]>;
}> = [
  {
    title: "Plan Identity",
    fields: [
      ["id", "Plan ID", "Internal plan key, for example starter or growth"],
      ["name", "Plan Name", "User-facing plan name"],
      ["description", "Description", "Short summary of what this plan is for"],
      ["pricing_model", "Pricing Model", "Examples: standard, custom, enterprise, usage_based"],
      ["support_tier", "Support Tier", "Support SLA or service tier for this plan"],
    ],
  },
  {
    title: "Pricing",
    fields: [
      ["monthly_price_inr", "Monthly Price (INR)", "Base monthly subscription price in INR"],
      ["yearly_price_inr", "Yearly Price (INR)", "Base yearly subscription price in INR"],
      ["extra_agent_seat_price_inr", "Extra Seat Price (INR)", "Per-seat overage price after included seats are used"],
    ],
  },
  {
    title: "Limits",
    fields: [
      ["workspace_limit", "Workspace Limit", "How many workspaces this plan can cover"],
      ["project_limit", "Project Limit", "Maximum number of projects allowed"],
      ["max_users", "Maximum Users", "Hard upper cap on total users allowed in the workspace"],
      ["included_users", "Included Seats", "Users included before extra seat pricing applies"],
      ["agent_seat_limit", "Agent Seat Limit", "Seat limit used by billing and seat enforcement"],
      ["active_bot_limit", "Active Bot Limit", "Maximum active bots allowed at the same time"],
      ["monthly_campaign_limit", "Monthly Campaign Limit", "How many campaign runs are allowed per billing period"],
      ["ai_reply_limit", "AI Reply Limit", "Included AI replies before overage handling starts"],
    ],
  },
];

type FeatureAddonRow = {
  id: string;
  name: string;
  price_inr: string;
  enabled: boolean;
};

const DEFAULT_WALLET_ROWS: WalletPricingRow[] = [];

const DEFAULT_FEATURE_ROWS: FeatureAddonRow[] = [];

function sanitizeAddonRow(row: Partial<FeatureAddonRow>, index: number): FeatureAddonRow {
  return {
    id: String(row.id || `feature_${index + 1}`).trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_"),
    name: String(row.name || "").trim(),
    price_inr: String(row.price_inr || "0").trim(),
    enabled: Boolean(row.enabled),
  };
}

function extractFeatureMatrix(features: Record<string, unknown> | null | undefined) {
  const source = features && typeof features === "object" ? features : {};
  const matrix = (source as Record<string, unknown>).pricing_matrix;
  const matrixSource = matrix && typeof matrix === "object" ? (matrix as Record<string, unknown>) : {};
  const unitCostsSource =
    matrixSource.unit_costs && typeof matrixSource.unit_costs === "object"
      ? (matrixSource.unit_costs as Record<string, unknown>)
      : {};
  const addonRowsSource = Array.isArray(matrixSource.feature_addons) ? matrixSource.feature_addons : [];

  const legacyFlags = Object.fromEntries(
    Object.entries(source).filter(([key]) => key !== "pricing_matrix")
  );

  return {
    unitCosts: {
      extra_bot_price_inr: String(unitCostsSource.extra_bot_price_inr ?? ""),
      extra_1k_campaigns_price_inr: String(unitCostsSource.extra_1k_campaigns_price_inr ?? ""),
    },
    addonRows:
      addonRowsSource.length > 0
        ? addonRowsSource.map((row: any, index: number) => sanitizeAddonRow(row, index))
        : [],
    legacyFlags,
  };
}

function extractWalletPricingRows(walletPricing: Record<string, unknown> | null | undefined): WalletPricingRow[] {
  const source = walletPricing && typeof walletPricing === "object" ? walletPricing : {};
  const rows = Object.entries(source).map(([key, value]) => {
    const amount =
      value && typeof value === "object"
        ? String((value as Record<string, unknown>).amount ?? "")
        : String(value ?? "");
    return {
      key: String(key || "").trim().toLowerCase(),
      amount,
    };
  });

  return rows.length > 0 ? rows : DEFAULT_WALLET_ROWS;
}

function buildWalletPricingPayload(rows: WalletPricingRow[]) {
  return rows.reduce<Record<string, { amount: number }>>((acc, row) => {
    const key = String(row.key || "").trim().toLowerCase();
    if (!key) {
      return acc;
    }
    acc[key] = { amount: Number(row.amount || 0) };
    return acc;
  }, {});
}

function buildFeaturePayload(form: any) {
  const legacyFlags = form.legacyFeatureFlags || {};
  const addonRows = Array.isArray(form.featureAddonRows) ? form.featureAddonRows : [];
  const unitCosts = form.featureUnitCosts || {};

  return {
    ...legacyFlags,
    pricing_matrix: {
      unit_costs: {
        extra_bot_price_inr: Number(unitCosts.extra_bot_price_inr || 0),
        extra_1k_campaigns_price_inr: Number(unitCosts.extra_1k_campaigns_price_inr || 0),
      },
      feature_addons: addonRows
        .map((row: FeatureAddonRow, index: number) => sanitizeAddonRow(row, index))
        .filter((row: FeatureAddonRow) => row.id || row.name || Number(row.price_inr || 0) > 0),
    },
  };
}

export default function PlansPage() {
  const { canViewPage } = useVisibility();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [form, setForm] = useState<any>({
    ...EMPTY_FORM,
    allowedPlatformsText: (EMPTY_FORM.allowed_platforms || []).join(", "),
    walletPricingRows: extractWalletPricingRows(EMPTY_FORM.wallet_pricing as Record<string, unknown>),
    featureUnitCosts: {
      extra_bot_price_inr: "",
      extra_1k_campaigns_price_inr: "",
    },
    featureAddonRows: [],
    legacyFeatureFlags: {},
  });
  const [editingId, setEditingId] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const canViewPlansPage = canViewPage("plans");

  const loadPlans = async () => {
    setLoading(true);
    try {
      setError("");
      const rows = await planService.list();
      setPlans(Array.isArray(rows) ? rows : []);
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to load plans");
      setPlans([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!canViewPlansPage) {
      setPlans([]);
      return;
    }

    loadPlans().catch(console.error);
  }, [canViewPlansPage]);

  const activeCount = useMemo(
    () => plans.filter((plan) => String(plan.status || "").toLowerCase() === "active").length,
    [plans]
  );

  const resetForm = () => {
    setEditingId("");
    setForm({
      ...EMPTY_FORM,
      allowedPlatformsText: (EMPTY_FORM.allowed_platforms || []).join(", "),
      walletPricingRows: extractWalletPricingRows(EMPTY_FORM.wallet_pricing as Record<string, unknown>),
      featureUnitCosts: {
        extra_bot_price_inr: "",
        extra_1k_campaigns_price_inr: "",
      },
      featureAddonRows: [],
      legacyFeatureFlags: {},
    });
  };

  const hydrateForm = (plan: Plan) => {
    const featureMatrix = extractFeatureMatrix(plan.features);
    setEditingId(plan.id);
    setForm({
      ...plan,
      allowedPlatformsText: (plan.allowed_platforms || []).join(", "),
      walletPricingRows: extractWalletPricingRows(plan.wallet_pricing as Record<string, unknown>),
      featureUnitCosts: featureMatrix.unitCosts,
      featureAddonRows: featureMatrix.addonRows,
      legacyFeatureFlags: featureMatrix.legacyFlags,
    });
  };

  const getPayload = () => ({
    id: String(form.id || "").trim().toLowerCase(),
    name: String(form.name || "").trim(),
    description: String(form.description || "").trim(),
    monthly_price_inr: Number(form.monthly_price_inr || 0),
    yearly_price_inr: Number(form.yearly_price_inr || 0),
    monthly_price_usd: Number(form.monthly_price_usd || 0),
    yearly_price_usd: Number(form.yearly_price_usd || 0),
    max_campaigns: Number(form.max_campaigns || 0),
    max_numbers: Number(form.max_numbers || 0),
    max_users: Number(form.max_users || 0),
    max_projects: Number(form.max_projects || 0),
    max_integrations: Number(form.max_integrations || 0),
    max_bots: Number(form.max_bots || 0),
    included_users: Number(form.included_users || 0),
    workspace_limit: Number(form.workspace_limit || 0),
    project_limit: Number(form.project_limit || 0),
    agent_seat_limit: Number(form.agent_seat_limit || 0),
    active_bot_limit: Number(form.active_bot_limit || 0),
    monthly_campaign_limit: Number(form.monthly_campaign_limit || 0),
    ai_reply_limit: Number(form.ai_reply_limit || 0),
    extra_agent_seat_price_inr: Number(form.extra_agent_seat_price_inr || 0),
    pricing_model: String(form.pricing_model || "standard").trim().toLowerCase(),
    support_tier: String(form.support_tier || "standard").trim(),
    allowed_platforms: String(form.allowedPlatformsText || "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
    wallet_pricing: buildWalletPricingPayload(Array.isArray(form.walletPricingRows) ? form.walletPricingRows : []),
    features: buildFeaturePayload(form),
    status: String(form.status || "active").trim().toLowerCase(),
  });

  const handleSave = async () => {
    try {
      const payload = getPayload();
      if (!payload.id || !payload.name) {
        setError("Plan id and name are required.");
        return;
      }

      setSaving(true);
      setError("");
      if (editingId) {
        await planService.update(editingId, payload);
        notify("Plan updated.", "success");
      } else {
        await planService.create(payload);
        notify("Plan created.", "success");
      }
      resetForm();
      await loadPlans();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || "Failed to save plan");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (plan: Plan) => {
    if (!(await confirmAction("Deactivate plan", `Deactivate ${plan.name}?`, "Deactivate"))) {
      return;
    }

    try {
      await planService.remove(plan.id);
      notify("Plan deactivated.", "success");
      if (editingId === plan.id) {
        resetForm();
      }
      await loadPlans();
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to deactivate plan");
    }
  };

  return (
    <DashboardLayout>
      {!canViewPlansPage ? (
        <PageAccessNotice
          title="Plan controls are restricted for this role"
          description="Only platform operators can review and edit plan baselines."
          href="/"
          ctaLabel="Open dashboard"
        />
      ) : (
        <div className="mx-auto max-w-7xl space-y-6">
          <section className="rounded-[1.75rem] border border-border-main bg-surface p-6 shadow-sm">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-black">
                  Global Plans
                </div>
                <h1 className="mt-3 text-[1.6rem] font-semibold tracking-tight text-black">
                  Pricing, limits, and overage controls
                </h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-black">
                  Keep plan baselines, limits, and add-ons in one stacked flow. Edit the plan first, then review the active catalog below.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-[1.1rem] border border-border-main bg-canvas px-4 py-3">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-black">Plans</div>
                  <div className="mt-1 text-xl font-semibold text-black">{plans.length}</div>
                </div>
                <div className="rounded-[1.1rem] border border-border-main bg-canvas px-4 py-3">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-black">Active</div>
                  <div className="mt-1 text-xl font-semibold text-black">{activeCount}</div>
                </div>
              </div>
            </div>
          </section>

          {error ? (
            <section className="rounded-[1.2rem] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </section>
          ) : null}

          <div className="space-y-6">
            <div className="space-y-4">
            <section className="rounded-[1.5rem] border border-border-main bg-surface p-5 shadow-sm">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-black">
                {editingId ? "Edit Plan" : "Create Plan"}
              </div>
              <div className="mt-4 space-y-4">
                {PLAN_FORM_SECTIONS.slice(0, 2).map((section) => (
                  <section key={section.title} className="space-y-3 rounded-[1.25rem] border border-border-main bg-canvas p-4">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-black">
                      {section.title}
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      {section.fields.map(([key, label, helper]) => (
                        <label key={key} className="flex h-full flex-col space-y-2 rounded-[1rem] border border-border-main bg-surface p-3">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-black">
                            {label}
                          </div>
                          <input
                            type={key.includes("price") || key.includes("limit") ? "number" : "text"}
                            disabled={saving || (editingId !== "" && key === "id")}
                            value={form[key] ?? ""}
                            onChange={(event) => setForm((current: any) => ({ ...current, [key]: event.target.value }))}
                            className="w-full rounded-2xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                            placeholder={label}
                          />
                          <div className="min-h-[2.75rem] text-xs leading-5 text-black">{helper}</div>
                        </label>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </section>

            <section className="rounded-[1.5rem] border border-border-main bg-surface p-5 shadow-sm">
                <section className="space-y-3 rounded-[1.4rem] border border-border-main bg-canvas p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-black">
                        Limits, Platforms, and Pricing Matrix
                      </div>
                      <div className="mt-1 text-sm text-black">
                        Keep caps and custom add-ons together so the advanced settings stay in one place.
                      </div>
                    </div>
                    <div className="rounded-full bg-primary-fade px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
                      Custom Builder
                    </div>
                  </div>

                  <section className="space-y-3 rounded-[1.1rem] border border-border-main bg-surface p-4">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-black">
                      Limits
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      {PLAN_FORM_SECTIONS[2].fields.map(([key, label, helper]) => (
                        <label key={key} className="flex h-full flex-col space-y-2 rounded-[1rem] border border-border-main bg-surface p-3">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-black">
                            {label}
                          </div>
                          <input
                            type="number"
                            disabled={saving}
                            value={form[key] ?? ""}
                            onChange={(event) => setForm((current: any) => ({ ...current, [key]: event.target.value }))}
                            className="w-full rounded-2xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                            placeholder={label}
                          />
                          <div className="min-h-[2.75rem] text-xs leading-5 text-black">{helper}</div>
                        </label>
                      ))}
                    </div>
                  </section>

                  <label className="space-y-2 rounded-[1.1rem] border border-border-main bg-surface p-4">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-black">
                      Allowed Platforms
                    </div>
                    <input
                      value={form.allowedPlatformsText || ""}
                      onChange={(event) => setForm((current: any) => ({ ...current, allowedPlatformsText: event.target.value }))}
                      className="w-full rounded-2xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                      placeholder="whatsapp, website, api"
                    />
                    <div className="text-xs text-black">
                      Comma-separated platform list available on this plan.
                    </div>
                  </label>

                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="space-y-2">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-black">
                        Extra Bot Price (INR)
                      </div>
                      <input
                        type="number"
                        value={form.featureUnitCosts?.extra_bot_price_inr || ""}
                        onChange={(event) =>
                          setForm((current: any) => ({
                            ...current,
                            featureUnitCosts: {
                              ...(current.featureUnitCosts || {}),
                              extra_bot_price_inr: event.target.value,
                            },
                          }))
                        }
                        className="w-full rounded-2xl border border-border-main bg-surface px-4 py-3 text-sm text-text-main outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                        placeholder="Set in admin"
                      />
                    </label>
                    <label className="space-y-2">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-black">
                        Extra 1K Campaigns Price (INR)
                      </div>
                      <input
                        type="number"
                        value={form.featureUnitCosts?.extra_1k_campaigns_price_inr || ""}
                        onChange={(event) =>
                          setForm((current: any) => ({
                            ...current,
                            featureUnitCosts: {
                              ...(current.featureUnitCosts || {}),
                              extra_1k_campaigns_price_inr: event.target.value,
                            },
                          }))
                        }
                        className="w-full rounded-2xl border border-border-main bg-surface px-4 py-3 text-sm text-text-main outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                        placeholder="Set in admin"
                      />
                    </label>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-black">
                        Feature Add-ons
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setForm((current: any) => ({
                            ...current,
                            featureAddonRows: [
                              ...(Array.isArray(current.featureAddonRows) ? current.featureAddonRows : []),
                              { id: "", name: "", price_inr: "", enabled: true },
                            ],
                          }))
                        }
                        className="rounded-full border border-border-main bg-surface px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-text-main transition hover:border-primary/30 hover:bg-primary-fade hover:text-primary"
                      >
                        Add Feature
                      </button>
                    </div>

                    <div className="space-y-3">
                      {(Array.isArray(form.featureAddonRows) ? form.featureAddonRows : []).map(
                        (row: FeatureAddonRow, index: number) => (
                          <div
                            key={`${row.id || "feature"}-${index}`}
                            className="rounded-2xl border border-border-main bg-surface p-4 shadow-sm"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="grid flex-1 gap-3 md:grid-cols-3">
                                <label className="space-y-2">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-black">
                                    Internal ID
                                  </div>
                                  <input
                                    value={row.id}
                                    onChange={(event) =>
                                      setForm((current: any) => {
                                        const nextRows = [...(current.featureAddonRows || [])];
                                        nextRows[index] = { ...nextRows[index], id: event.target.value };
                                        return { ...current, featureAddonRows: nextRows };
                                      })
                                    }
                                    className="w-full rounded-xl border border-border-main bg-canvas px-3 py-2 text-sm text-text-main outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                                    placeholder="kanban_crm"
                                  />
                                </label>
                                <label className="space-y-2">
                                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                                    Display Name
                                  </div>
                                  <input
                                    value={row.name}
                                    onChange={(event) =>
                                      setForm((current: any) => {
                                        const nextRows = [...(current.featureAddonRows || [])];
                                        nextRows[index] = { ...nextRows[index], name: event.target.value };
                                        return { ...current, featureAddonRows: nextRows };
                                      })
                                    }
                                    className="w-full rounded-xl border border-border-main bg-canvas px-3 py-2 text-sm text-text-main outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                                    placeholder="Kanban CRM Pipeline"
                                  />
                                </label>
                                <label className="space-y-2">
                                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                                    Monthly Price (INR)
                                  </div>
                                  <input
                                    type="number"
                                    value={row.price_inr}
                                    onChange={(event) =>
                                      setForm((current: any) => {
                                        const nextRows = [...(current.featureAddonRows || [])];
                                        nextRows[index] = { ...nextRows[index], price_inr: event.target.value };
                                        return { ...current, featureAddonRows: nextRows };
                                      })
                                    }
                                    className="w-full rounded-xl border border-border-main bg-canvas px-3 py-2 text-sm text-text-main outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                                    placeholder="Set in admin"
                                  />
                                </label>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  setForm((current: any) => ({
                                    ...current,
                                    featureAddonRows: (current.featureAddonRows || []).filter(
                                      (_: FeatureAddonRow, rowIndex: number) => rowIndex !== index
                                    ),
                                  }))
                                }
                                className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-rose-700"
                              >
                                Remove
                              </button>
                            </div>
                            <label className="mt-3 inline-flex items-center gap-2 rounded-full border border-border-main bg-canvas px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                              <input
                                type="checkbox"
                                checked={Boolean(row.enabled)}
                                onChange={(event) =>
                                  setForm((current: any) => {
                                    const nextRows = [...(current.featureAddonRows || [])];
                                    nextRows[index] = { ...nextRows[index], enabled: event.target.checked };
                                    return { ...current, featureAddonRows: nextRows };
                                  })
                                }
                              />
                              Enabled
                            </label>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                </section>

                <select
                  value={form.status || "active"}
                  onChange={(event) => setForm((current: any) => ({ ...current, status: event.target.value }))}
                  className="w-full rounded-2xl border border-border-main bg-canvas px-4 py-3 text-sm text-text-main outline-none"
                >
                  <option value="active">active</option>
                  <option value="inactive">inactive</option>
                </select>
                <section className="space-y-3 rounded-[1.4rem] border border-border-main bg-canvas p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                        Wallet Pricing
                      </div>
                      <div className="mt-1 text-sm text-text-muted">
                        Category-based wallet rates for usage billing.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setForm((current: any) => ({
                          ...current,
                          walletPricingRows: [
                            ...(Array.isArray(current.walletPricingRows) ? current.walletPricingRows : []),
                            { key: "", amount: "" },
                          ],
                        }))
                      }
                      className="rounded-full border border-border-main bg-surface px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-text-main transition hover:border-primary/30 hover:bg-primary-fade hover:text-primary"
                    >
                      Add rate
                    </button>
                  </div>

                  <div className="space-y-3">
                    {(Array.isArray(form.walletPricingRows) ? form.walletPricingRows : []).map(
                      (row: WalletPricingRow, index: number) => (
                        <div
                          key={`${row.key || "wallet"}-${index}`}
                          className="grid gap-3 rounded-2xl border border-border-main bg-surface p-4 md:grid-cols-[1fr_180px_auto]"
                        >
                          <input
                            value={row.key}
                            onChange={(event) =>
                              setForm((current: any) => {
                                const nextRows = [...(current.walletPricingRows || [])];
                                nextRows[index] = { ...nextRows[index], key: event.target.value };
                                return { ...current, walletPricingRows: nextRows };
                              })
                            }
                            className="rounded-xl border border-border-main bg-canvas px-3 py-2 text-sm text-text-main outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                            placeholder="marketing"
                          />
                          <input
                            type="number"
                            step="0.01"
                            value={row.amount}
                            onChange={(event) =>
                              setForm((current: any) => {
                                const nextRows = [...(current.walletPricingRows || [])];
                                nextRows[index] = { ...nextRows[index], amount: event.target.value };
                                return { ...current, walletPricingRows: nextRows };
                              })
                            }
                            className="rounded-xl border border-border-main bg-canvas px-3 py-2 text-sm text-text-main outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                            placeholder="Unset"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setForm((current: any) => ({
                                ...current,
                                walletPricingRows: (current.walletPricingRows || []).filter(
                                  (_: WalletPricingRow, rowIndex: number) => rowIndex !== index
                                ),
                              }))
                            }
                            className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-rose-700"
                          >
                            Remove
                          </button>
                        </div>
                      )
                    )}
                  </div>
                </section>
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="flex-1 rounded-2xl border border-primary bg-primary px-4 py-3 text-[11px] font-black uppercase tracking-[0.2em] text-white disabled:opacity-50"
                  >
                    {saving ? "Saving..." : editingId ? "Save Plan" : "Create Plan"}
                  </button>
                  {editingId ? (
                    <button
                      type="button"
                      onClick={resetForm}
                      className="rounded-2xl border border-border-main bg-canvas px-4 py-3 text-[11px] font-black uppercase tracking-[0.2em] text-text-main"
                    >
                      Cancel
                    </button>
                  ) : null}
                </div>
            </section>
              </div>
            </div>

            <section className="space-y-4">
              {loading ? (
                <section className="rounded-[1.5rem] border border-dashed border-border-main bg-surface px-5 py-8 text-sm text-text-muted">
                  Loading plan catalog...
                </section>
              ) : (
                <div className="space-y-4">
                  {plans.map((plan) => (
                  <section key={plan.id} className="rounded-[1.4rem] border border-border-main bg-surface p-5 shadow-sm">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                            <div className="text-base font-semibold text-black">
                              {plan.name} <span className="text-xs text-black">({plan.id})</span>
                            </div>
                            <div className="mt-2 text-sm text-black">{plan.description || "No description set."}</div>
                            <div className="mt-2 text-xs text-black">Pricing model: {plan.pricing_model || "standard"}</div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => hydrateForm(plan)}
                          className="rounded-xl border border-border-main bg-canvas px-3 py-2 text-xs font-semibold text-text-main"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(plan)}
                          className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700"
                        >
                          Deactivate
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      <div className="rounded-[1rem] border border-border-main bg-canvas px-4 py-3 text-sm text-black">
                        INR {plan.monthly_price_inr}/mo
                      </div>
                      <div className="rounded-[1rem] border border-border-main bg-canvas px-4 py-3 text-sm text-black">
                        Seats: {plan.agent_seat_limit ?? plan.included_users ?? plan.max_users ?? 0}
                      </div>
                      <div className="rounded-[1rem] border border-border-main bg-canvas px-4 py-3 text-sm text-black">
                        AI replies: {plan.ai_reply_limit ?? "unlimited"}
                      </div>
                    </div>

                    <div className="mt-4 text-xs text-black">
                      Included users: {plan.included_users ?? 0} · Max users: {plan.max_users ?? 0}
                    </div>
                    <div className="mt-2 text-xs text-black">
                      Platforms: {(plan.allowed_platforms || []).join(", ") || "Not set"}
                    </div>
                  </section>
                  ))}
                </div>
              )}
            </section>
        </div>
      )}
    </DashboardLayout>
  );
}

