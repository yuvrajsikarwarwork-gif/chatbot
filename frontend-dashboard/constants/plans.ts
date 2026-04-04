export type PlanTier = "free" | "pro" | "enterprise";

export const PLAN_TIER_DEFAULTS: Record<
  PlanTier,
  {
    messages: number;
    tokens: number;
    label: string;
    color: string;
  }
> = {
  free: {
    messages: 1000,
    tokens: 50000,
    label: "Free Tier",
    color: "bg-gray-100 text-gray-600",
  },
  pro: {
    messages: 50000,
    tokens: 1000000,
    label: "Pro Monthly",
    color: "bg-purple-100 text-purple-700",
  },
  enterprise: {
    messages: 500000,
    tokens: 10000000,
    label: "Enterprise",
    color: "bg-amber-100 text-amber-700",
  },
};

export function normalizePlanTier(value: string | null | undefined): PlanTier {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "pro" || normalized === "enterprise") {
    return normalized;
  }
  return "free";
}
