import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronRight, Copy, Sparkles, Wallet } from "lucide-react";
import { authService } from "../../services/authService";
import { planService, type Plan } from "../../services/planService";
import { useAuthStore } from "../../store/authStore";

type AddOn = {
  id: string;
  name: string;
  priceInr: number;
  description: string;
};

type PlanCard = {
  id: string;
  name: string;
  price: number;
  seats: number;
  bots: number;
  platforms: string[];
  aiReplies: number;
  summary: string;
  seatOveragePriceInr: number;
  aiOveragePriceInr: number;
};

const EMPTY_PLAN_CARD: PlanCard = {
  id: "",
  name: "",
  price: 0,
  seats: 0,
  bots: 0,
  platforms: [],
  aiReplies: 0,
  summary: "",
  seatOveragePriceInr: 0,
  aiOveragePriceInr: 0,
};

const CURRENCY = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const CHECKOUT_STORAGE_KEY = "botos_custom_checkout_payload";

function formatCurrency(value: number) {
  return CURRENCY.format(Math.max(0, Math.round(value)));
}

function ToggleRow({
  label,
  checked,
  onChange,
  priceInr,
  description,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  priceInr: number;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`group w-full rounded-3xl border p-4 text-left transition-all duration-300 ${
        checked
          ? "border-primary bg-primary-fade shadow-[0_0_0_1px_rgba(16,185,129,0.15)]"
          : "border-border-main bg-surface hover:border-primary/30 hover:bg-canvas"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-text-main">{label}</div>
          <div className="mt-1 text-sm leading-6 text-text-muted">{description}</div>
        </div>
        <div className="rounded-full bg-canvas px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
          {formatCurrency(priceInr)}
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <span
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-all ${
            checked ? "bg-primary" : "bg-border-main"
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
              checked ? "translate-x-5" : "translate-x-1"
            }`}
          />
        </span>
        <div className={`text-xs font-semibold uppercase tracking-[0.16em] ${checked ? "text-primary" : "text-text-muted"}`}>
          {checked ? "Included" : "Add on"}
        </div>
      </div>
    </button>
  );
}

function TierCard({
  name,
  price,
  summary,
  seats,
  bots,
  platforms,
  aiReplies,
  active,
  onClick,
}: {
  name: string;
  price: number;
  summary: string;
  seats: number;
  bots: number;
  platforms: readonly string[];
  aiReplies: number;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-[1.75rem] border p-5 text-left transition-all duration-300 ${
        active
          ? "border-primary bg-primary-fade shadow-[0_0_0_1px_rgba(16,185,129,0.15)]"
          : "border-border-main bg-surface hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-sm"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-lg font-semibold text-text-main">{name}</div>
          <div className="mt-1 text-sm leading-6 text-text-muted">{summary}</div>
        </div>
        {active ? (
          <div className="rounded-full bg-primary px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white">
            Selected
          </div>
        ) : null}
      </div>
      <div className="mt-4 grid gap-2 text-sm text-text-muted sm:grid-cols-2">
        <div className="rounded-2xl border border-border-main bg-canvas px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em]">Monthly</div>
          <div className="mt-1 text-base font-semibold text-text-main">{formatCurrency(price)}</div>
        </div>
        <div className="rounded-2xl border border-border-main bg-canvas px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em]">Seats / Bots</div>
          <div className="mt-1 text-base font-semibold text-text-main">
            {seats} / {bots}
          </div>
        </div>
      </div>
      <div className="mt-3 text-xs uppercase tracking-[0.16em] text-text-muted">
        AI replies {aiReplies.toLocaleString()} - {platforms.join(", ")}
      </div>
    </button>
  );
}

function toNumber(value: unknown, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function resolvePlanCard(plan: Plan | null | undefined): PlanCard {
  if (!plan) {
    return { ...EMPTY_PLAN_CARD };
  }

  const features = plan.features && typeof plan.features === "object" ? plan.features : {};
  const matrix = (features as Record<string, unknown>).pricing_matrix;
  const matrixSource = matrix && typeof matrix === "object" ? (matrix as Record<string, unknown>) : {};
  const unitCostsSource =
    matrixSource.unit_costs && typeof matrixSource.unit_costs === "object"
      ? (matrixSource.unit_costs as Record<string, unknown>)
      : {};
  const walletPricing = plan.wallet_pricing && typeof plan.wallet_pricing === "object" ? (plan.wallet_pricing as Record<string, unknown>) : {};

  return {
    id: String(plan.id || "").trim(),
    name: String(plan.name || "").trim(),
    price: toNumber(plan.monthly_price_inr, 0),
    seats: toNumber(plan.agent_seat_limit ?? plan.included_users ?? plan.max_users, 0),
    bots: toNumber(plan.active_bot_limit ?? plan.max_bots, 0),
    platforms: Array.isArray(plan.allowed_platforms) ? plan.allowed_platforms.map((value) => String(value).trim()).filter(Boolean) : [],
    aiReplies: toNumber(plan.ai_reply_limit, 0),
    summary: String(plan.description || "").trim(),
    seatOveragePriceInr: toNumber(plan.extra_agent_seat_price_inr ?? unitCostsSource.extra_seat_price_inr, 0),
    aiOveragePriceInr: toNumber(
      unitCostsSource.extra_ai_reply_price_inr ??
        unitCostsSource.ai_reply_overage_price_inr ??
        (walletPricing.ai_reply_overage as Record<string, unknown>)?.amount,
      0
    ),
  };
}

function resolveAddonRows(plan: Plan | null | undefined) {
  const features = plan?.features && typeof plan.features === "object" ? plan.features : {};
  const matrix = (features as Record<string, unknown>).pricing_matrix;
  const matrixSource = matrix && typeof matrix === "object" ? (matrix as Record<string, unknown>) : {};
  const rows = Array.isArray(matrixSource.feature_addons) ? matrixSource.feature_addons : [];
  return rows
    .map((row: any) => ({
      id: String(row?.id || "").trim().toLowerCase(),
      name: String(row?.name || "").trim(),
      priceInr: toNumber(row?.price_inr, 0),
      enabled: row?.enabled !== false,
      description: String(row?.description || row?.name || "").trim(),
    }))
    .filter((row) => row.id && row.enabled);
}

function resolvePricingMatrix(plan: Plan | null | undefined) {
  const features = plan?.features && typeof plan.features === "object" ? plan.features : {};
  const matrix = (features as Record<string, unknown>).pricing_matrix;
  const matrixSource = matrix && typeof matrix === "object" ? (matrix as Record<string, unknown>) : {};
  const unitCostsSource =
    matrixSource.unit_costs && typeof matrixSource.unit_costs === "object"
      ? (matrixSource.unit_costs as Record<string, unknown>)
      : {};

  return {
    extraBotPriceInr: toNumber(unitCostsSource.extra_bot_price_inr, 0),
    extra1kCampaignPriceInr: toNumber(unitCostsSource.extra_1k_campaigns_price_inr, 0),
    addons: resolveAddonRows(plan),
  };
}

function loadRazorpayScript() {
  return new Promise<boolean>((resolve) => {
    if (typeof window === "undefined") {
      resolve(false);
      return;
    }

    if ((window as any).Razorpay) {
      resolve(true);
      return;
    }

    const existing = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(true), { once: true });
      existing.addEventListener("error", () => resolve(false), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export default function CustomPricingPage() {
  const router = useRouter();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [availablePlans, setAvailablePlans] = useState<Plan[]>([]);
  const [plansError, setPlansError] = useState("");
  const [selectedTier, setSelectedTier] = useState<"starter" | "growth" | "custom">("custom");
  const [seats, setSeats] = useState(1);
  const [bots, setBots] = useState(1);
  const [campaignVolume, setCampaignVolume] = useState(0);
  const [aiReplies, setAiReplies] = useState(500);
  const [addOns, setAddOns] = useState<Record<string, boolean>>({});
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const [checkoutName, setCheckoutName] = useState("");
  const [checkoutEmail, setCheckoutEmail] = useState("");
  const [checkoutPassword, setCheckoutPassword] = useState("");
  const [checkoutCompany, setCheckoutCompany] = useState("");
  const [checkoutPhone, setCheckoutPhone] = useState("");
  const [checkoutWebsite, setCheckoutWebsite] = useState("");
  const [checkoutIndustry, setCheckoutIndustry] = useState("");
  const [checkoutTaxId, setCheckoutTaxId] = useState("");
  const [checkoutError, setCheckoutError] = useState("");
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const stripeReturnHandled = useRef(false);

  useEffect(() => {
    let mounted = true;
    planService
      .publicList()
      .then((rows) => {
        if (!mounted) return;
        setAvailablePlans(Array.isArray(rows) ? rows : []);
        setPlansError("");
      })
      .catch((err: any) => {
        if (!mounted) return;
        setPlansError(err?.response?.data?.error || "Failed to load pricing catalog");
        setAvailablePlans([]);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!router.isReady || typeof window === "undefined") {
      return;
    }

    const checkoutMode = String(router.query.checkout || "").trim().toLowerCase();
    if (checkoutMode !== "stripe" || stripeReturnHandled.current) {
      return;
    }

    const referenceId = String(router.query.referenceId || "").trim();
    const sessionId = String(router.query.session_id || "").trim();
    if (!referenceId || !sessionId) {
      return;
    }

    const stored = window.sessionStorage.getItem(CHECKOUT_STORAGE_KEY);
    if (!stored) {
      setCheckoutError("Stripe payment completed, but the pending checkout details were not found in this session.");
      stripeReturnHandled.current = true;
      return;
    }

    try {
      const payload = JSON.parse(stored) as { referenceId?: string; sessionId?: string; password?: string; planId?: string };
      if (String(payload.referenceId || "").trim() !== referenceId || String(payload.sessionId || "").trim() !== sessionId) {
        return;
      }

      if (!payload.password || !payload.planId) {
        setCheckoutError("Stripe payment completed, but the session payload is incomplete.");
        stripeReturnHandled.current = true;
        return;
      }

      stripeReturnHandled.current = true;
      setCheckoutBusy(true);
      authService
        .pricingCheckoutConfirm({
          referenceId,
          sessionId,
          password: payload.password,
          planId: payload.planId,
        })
        .then((session) => {
          setAuth(
            session.user,
            session.token,
            session.memberships || [],
            session.activeWorkspace || null,
            session.projectAccesses || [],
            session.resolvedAccess || null,
            session.organizations || [],
            session.activeOrganization || null,
            session.activeOrganizationMembership || null
          );
          window.sessionStorage.removeItem(CHECKOUT_STORAGE_KEY);
          router.push("/");
        })
        .catch((confirmError: any) => {
          setCheckoutError(
            confirmError?.response?.data?.error ||
              confirmError?.response?.data?.message ||
              "Stripe payment succeeded, but provisioning failed."
          );
        })
        .finally(() => setCheckoutBusy(false));
    } catch {
      setCheckoutError("Stripe payment succeeded, but the stored checkout payload could not be read.");
      stripeReturnHandled.current = true;
    }
  }, [router, router.isReady, router.query.checkout, router.query.referenceId, router.query.session_id, setAuth]);

  const starterPlan = useMemo(() => resolvePlanCard(availablePlans.find((plan) => String(plan.id || "").toLowerCase() === "starter") || null), [availablePlans]);
  const growthPlan = useMemo(() => resolvePlanCard(availablePlans.find((plan) => String(plan.id || "").toLowerCase() === "growth") || null), [availablePlans]);
  const customPlan = useMemo(() => {
    const found =
      availablePlans.find(
        (plan) =>
          String(plan.pricing_model || "").toLowerCase() === "custom" ||
          String(plan.id || "").toLowerCase() === "custom"
      ) || null;
    return resolvePlanCard(found);
  }, [availablePlans]);

  const catalog = useMemo(
    () => ({
      starter: starterPlan,
      growth: growthPlan,
      custom: customPlan,
    }),
    [customPlan, growthPlan, starterPlan]
  );

  const customMatrix = useMemo(() => resolvePricingMatrix(availablePlans.find((plan) => String(plan.pricing_model || "").toLowerCase() === "custom" || String(plan.id || "").toLowerCase() === "custom") || null), [availablePlans]);
  const activeTier = catalog[selectedTier] || EMPTY_PLAN_CARD;

  useEffect(() => {
    if (customMatrix.addons.length === 0) {
      return;
    }

    setAddOns((current) =>
      customMatrix.addons.reduce<Record<string, boolean>>((acc, addon) => {
        acc[addon.id] = current[addon.id] ?? addon.enabled;
        return acc;
      }, {})
    );
  }, [customMatrix.addons]);

  const customQuote = useMemo(() => {
    const basePrice = catalog.custom.price;
    const seatCharge = Math.max(0, seats - catalog.custom.seats) * catalog.custom.seatOveragePriceInr;
    const botCharge = Math.max(0, bots - catalog.custom.bots) * customMatrix.extraBotPriceInr;
    const campaignCharge = Math.max(0, Math.ceil(campaignVolume / 1000)) * customMatrix.extra1kCampaignPriceInr;
    const aiCharge = Math.max(0, Math.ceil((aiReplies - catalog.custom.aiReplies) / 500)) * catalog.custom.aiOveragePriceInr;
    const selectedAddOns = customMatrix.addons.filter((addon) => addOns[addon.id]);
    const addOnCharge = selectedAddOns.reduce((total, addon) => total + addon.priceInr, 0);

    const total = basePrice + seatCharge + botCharge + campaignCharge + aiCharge + addOnCharge;

    return {
      basePrice,
      seatCharge,
      botCharge,
      campaignCharge,
      aiCharge,
      addOnCharge,
      total,
      selectedAddOns,
    };
  }, [addOns, aiReplies, bots, campaignVolume, catalog.custom.aiOveragePriceInr, catalog.custom.bots, catalog.custom.price, catalog.custom.seatOveragePriceInr, catalog.custom.seats, customMatrix.addons, customMatrix.extra1kCampaignPriceInr, customMatrix.extraBotPriceInr, seats]);

  const quoteSummary = useMemo(
    () =>
      [
        `Plan: Build Your Own BOT.OS`,
        `Base fee: ${formatCurrency(customQuote.basePrice)}/mo`,
        `Agent seats: ${seats}`,
        `Active bots: ${bots}`,
        `Campaign capacity: ${campaignVolume.toLocaleString()}`,
        `AI replies: ${aiReplies.toLocaleString()}`,
        `Add-ons: ${customQuote.selectedAddOns.map((addon) => addon.name).join(", ") || "None"}`,
        `Estimated total: ${formatCurrency(customQuote.total)}/mo`,
      ].join("\n"),
    [aiReplies, bots, campaignVolume, customQuote.basePrice, customQuote.selectedAddOns, customQuote.total, seats]
  );

  const copyQuote = async () => {
    try {
      await navigator.clipboard.writeText(quoteSummary);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1800);
    } catch {
      setCopyState("idle");
    }
  };

  const submitCheckout = async () => {
    if (!checkoutName.trim() || !checkoutEmail.trim() || !checkoutPassword.trim() || !checkoutCompany.trim()) {
      setCheckoutError("Name, email, password, and company name are required to continue.");
      return;
    }

    setCheckoutBusy(true);
    setCheckoutError("");
    try {
      const payload = {
        email: checkoutEmail.trim(),
        password: checkoutPassword,
        name: checkoutName.trim(),
        companyName: checkoutCompany.trim(),
        ownerPhone: checkoutPhone.trim() || null,
        companyWebsite: checkoutWebsite.trim() || null,
        industry: checkoutIndustry.trim() || null,
        taxId: checkoutTaxId.trim() || null,
        planId: String(catalog[selectedTier]?.id || selectedTier),
        billingCycle: "monthly",
        currency: "INR",
        seats,
        bots,
        campaignVolume,
        aiReplies,
        addOnIds: customQuote.selectedAddOns.map((addon) => addon.id),
      };

      const init = await authService.pricingCheckout(payload);

      if (init.gateway === "razorpay") {
        if (typeof window !== "undefined") {
          window.sessionStorage.setItem(
            CHECKOUT_STORAGE_KEY,
            JSON.stringify({
              referenceId: init.referenceId,
              sessionId: init.orderId || "",
              password: checkoutPassword,
              planId: String(catalog[selectedTier]?.id || selectedTier),
            })
          );
        }
        const scriptReady = await loadRazorpayScript();
        if (!scriptReady) {
          throw new Error("Failed to load payment checkout.");
        }

        const Razorpay = (window as any).Razorpay;
        const checkout = new Razorpay({
          key: init.keyId,
          amount: init.amount,
          currency: init.currency,
          name: "BOT.OS",
          description: "Custom plan checkout",
          order_id: init.orderId,
          notes: {
            referenceId: init.referenceId,
            planId: selectedTier,
          },
          handler: async (response: any) => {
            try {
            const session = await authService.pricingCheckoutConfirm({
              referenceId: init.referenceId,
              orderId: init.orderId,
              paymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
              password: checkoutPassword,
              planId: String(catalog[selectedTier]?.id || selectedTier),
            });
              setAuth(
                session.user,
                session.token,
                session.memberships || [],
                session.activeWorkspace || null,
                session.projectAccesses || [],
                session.resolvedAccess || null,
                session.organizations || [],
                session.activeOrganization || null,
                session.activeOrganizationMembership || null
              );
              router.push("/");
            } catch (confirmError: any) {
              setCheckoutError(
                confirmError?.response?.data?.error ||
                  confirmError?.response?.data?.message ||
                  "Payment succeeded, but provisioning failed."
              );
            } finally {
              setCheckoutBusy(false);
            }
          },
          modal: {
            ondismiss: () => setCheckoutBusy(false),
          },
          prefill: {
            name: checkoutName.trim(),
            email: checkoutEmail.trim(),
            contact: checkoutPhone.trim() || undefined,
          },
          theme: {
            color: "#10b981",
          },
        });

        checkout.open();
        return;
      }

      if (init.gateway === "stripe") {
        if (typeof window !== "undefined") {
          window.sessionStorage.setItem(
            CHECKOUT_STORAGE_KEY,
            JSON.stringify({
              referenceId: init.referenceId,
              sessionId: init.sessionId || "",
              password: checkoutPassword,
              planId: String(catalog[selectedTier]?.id || selectedTier),
            })
          );
        }
        if (init.checkoutUrl) {
          window.location.assign(init.checkoutUrl);
          return;
        }
        throw new Error("Stripe checkout URL is missing.");
      }

      const session = await authService.pricingCheckoutConfirm({
        referenceId: init.referenceId,
        password: checkoutPassword,
        planId: String(catalog[selectedTier]?.id || selectedTier),
      });
      setAuth(
        session.user,
        session.token,
        session.memberships || [],
        session.activeWorkspace || null,
        session.projectAccesses || [],
        session.resolvedAccess || null,
        session.organizations || [],
        session.activeOrganization || null,
        session.activeOrganizationMembership || null
      );
      router.push("/");
    } catch (err: any) {
      setCheckoutError(
        err?.response?.data?.error ||
          err?.response?.data?.message ||
          "Checkout could not be started. Please review the details and try again."
      );
    } finally {
      setCheckoutBusy(false);
    }
  };

  return (
    <>
      <Head>
        <title>Build Your Own Plan | BOT.OS</title>
        <meta
          name="description"
          content="Interactive pricing calculator for custom BOT.OS plans, add-ons, and AI usage."
        />
      </Head>
      <div className="relative min-h-screen overflow-hidden bg-[#0b1220] text-text-main">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.22),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(34,197,94,0.16),_transparent_25%),linear-gradient(180deg,#0f172a_0%,#020617_100%)]" />
        <div className="absolute inset-0 opacity-[0.22] [background-image:linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] [background-size:56px_56px]" />

        <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
          <header className="mb-6 flex items-center justify-between gap-4 rounded-[2rem] border border-white/10 bg-slate-950/60 px-5 py-4 backdrop-blur-xl">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.32em] text-emerald-300">
                BOT.OS Pricing
              </div>
              <div className="mt-1 text-sm text-slate-300">
                Build the operating system your team actually needs.
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-3 text-emerald-300">
                <Sparkles size={18} />
              </div>
              <Link
                href="/login"
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white transition hover:border-emerald-400/30 hover:bg-emerald-500/10 hover:text-emerald-100"
              >
                Sign In
              </Link>
            </div>
          </header>

          <section className="grid gap-6 lg:grid-cols-[1.08fr_0.92fr]">
            <div className="space-y-6">
              {plansError ? (
                <div className="rounded-[1.4rem] border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                  {plansError}. Showing fallback pricing until the catalog loads.
                </div>
              ) : null}

              <div className="rounded-[2rem] border border-white/10 bg-slate-950/55 p-6 shadow-[0_30px_100px_-45px_rgba(16,185,129,0.5)] backdrop-blur-xl">
                <div className="max-w-3xl">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-emerald-300">
                    Anchor and Build
                  </div>
                  <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                    Choose a plan, or build your own BOT.OS.
                  </h1>
                  <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">
                    Start with a fixed tier for speed, or tune seats, bots, campaigns, AI replies, and premium modules with a live pricing calculator.
                  </p>
                </div>
                <div className="mt-6 grid gap-3 md:grid-cols-3">
                  <TierCard
                    name={catalog.starter.name}
                    price={catalog.starter.price}
                    summary={catalog.starter.summary}
                    seats={catalog.starter.seats}
                    bots={catalog.starter.bots}
                    platforms={catalog.starter.platforms}
                    aiReplies={catalog.starter.aiReplies}
                    active={selectedTier === "starter"}
                    onClick={() => setSelectedTier("starter")}
                  />
                  <TierCard
                    name={catalog.growth.name}
                    price={catalog.growth.price}
                    summary={catalog.growth.summary}
                    seats={catalog.growth.seats}
                    bots={catalog.growth.bots}
                    platforms={catalog.growth.platforms}
                    aiReplies={catalog.growth.aiReplies}
                    active={selectedTier === "growth"}
                    onClick={() => setSelectedTier("growth")}
                  />
                  <TierCard
                    name={catalog.custom.name}
                    price={catalog.custom.price}
                    summary={catalog.custom.summary}
                    seats={catalog.custom.seats}
                    bots={catalog.custom.bots}
                    platforms={catalog.custom.platforms}
                    aiReplies={catalog.custom.aiReplies}
                    active={selectedTier === "custom"}
                    onClick={() => setSelectedTier("custom")}
                  />
                </div>
              </div>

              <div className="rounded-[2rem] border border-white/10 bg-slate-950/55 p-6 backdrop-blur-xl">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-emerald-300">
                      Build Your Own
                    </div>
                    <div className="mt-2 text-lg font-semibold text-white">
                      Live controls for seats, bots, AI, and automation.
                    </div>
                  </div>
                  <div className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-200">
                    Updated instantly
                  </div>
                </div>

                <div className="mt-6 space-y-6">
                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <label className="text-sm font-medium text-white">Agent Seats</label>
                      <div className="rounded-full bg-white/5 px-3 py-1 text-xs font-semibold text-emerald-200">
                        {seats} seats
                      </div>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={50}
                      value={seats}
                      onChange={(event) => setSeats(Number(event.target.value))}
                      className="mt-3 w-full accent-emerald-500"
                    />
                    <div className="mt-2 text-xs text-slate-400">
                      {catalog.custom.seatOveragePriceInr > 0
                        ? `+${formatCurrency(catalog.custom.seatOveragePriceInr)}/mo per seat above the base seat`
                        : "Seat overage is not configured in the backend plan matrix yet."}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <label className="text-sm font-medium text-white">Active Bots</label>
                      <div className="rounded-full bg-white/5 px-3 py-1 text-xs font-semibold text-emerald-200">
                        {bots} bots
                      </div>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={20}
                      value={bots}
                      onChange={(event) => setBots(Number(event.target.value))}
                      className="mt-3 w-full accent-emerald-500"
                    />
                    <div className="mt-2 text-xs text-slate-400">
                      {customMatrix.extraBotPriceInr > 0
                        ? `+${formatCurrency(customMatrix.extraBotPriceInr)}/mo per bot above the base bot`
                        : "Bot overage is not configured in the backend plan matrix yet."}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <label className="text-sm font-medium text-white">Monthly Campaign Capacity</label>
                      <div className="rounded-full bg-white/5 px-3 py-1 text-xs font-semibold text-emerald-200">
                        {campaignVolume.toLocaleString()} messages
                      </div>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={50000}
                      step={1000}
                      value={campaignVolume}
                      onChange={(event) => setCampaignVolume(Number(event.target.value))}
                      className="mt-3 w-full accent-emerald-500"
                    />
                    <div className="mt-2 text-xs text-slate-400">
                      {customMatrix.extra1kCampaignPriceInr > 0
                        ? `+${formatCurrency(customMatrix.extra1kCampaignPriceInr)}/mo per 1,000 campaign capacity`
                        : "Campaign overage is not configured in the backend plan matrix yet."}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <label className="text-sm font-medium text-white">AI Replies Included</label>
                      <div className="rounded-full bg-white/5 px-3 py-1 text-xs font-semibold text-emerald-200">
                        {aiReplies.toLocaleString()} replies
                      </div>
                    </div>
                    <input
                      type="range"
                      min={500}
                      max={20000}
                      step={500}
                      value={aiReplies}
                      onChange={(event) => setAiReplies(Number(event.target.value))}
                      className="mt-3 w-full accent-emerald-500"
                    />
                    <div className="mt-2 text-xs text-slate-400">
                      Included replies follow the selected plan&apos;s matrix
                    </div>
                  </div>

                  <div className="grid gap-3">
                    {customMatrix.addons.map((addon) => (
                      <ToggleRow
                        key={addon.id}
                        label={addon.name}
                        priceInr={addon.priceInr}
                        description={addon.description}
                        checked={Boolean(addOns[addon.id])}
                        onChange={(next) =>
                          setAddOns((current) => ({
                            ...current,
                            [addon.id]: next,
                          }))
                        }
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <aside className="lg:sticky lg:top-6 lg:self-start">
              <div className="rounded-[2rem] border border-emerald-400/20 bg-slate-950/75 p-6 shadow-[0_30px_100px_-45px_rgba(16,185,129,0.65)] backdrop-blur-xl">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-emerald-500/10 p-3 text-emerald-300">
                    <Wallet size={18} />
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-emerald-300">
                      Order Summary
                    </div>
                    <div className="mt-1 text-sm text-slate-300">
                      Itemized monthly estimate for your custom build.
                    </div>
                  </div>
                </div>

                <div className="mt-6 space-y-3">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-200">
                      Active Backend Plan
                    </div>
                    <div className="mt-2 font-semibold text-white">
                      {activeTier.name} <span className="text-xs text-slate-300">({activeTier.id})</span>
                    </div>
                    <div className="mt-2 text-xs leading-6 text-slate-300">
                      Base fee {formatCurrency(activeTier.price)} / mo • Seats {activeTier.seats} • Bots {activeTier.bots} • AI replies {activeTier.aiReplies.toLocaleString()}
                    </div>
                    <div className="mt-2 text-xs leading-6 text-slate-300">
                      Matrix add-ons: {customMatrix.addons.length} • Bot unit {formatCurrency(customMatrix.extraBotPriceInr)} • Campaign unit {formatCurrency(customMatrix.extra1kCampaignPriceInr)} per 1k
                    </div>
                  </div>
                  <SummaryLine label="Base Platform Fee" value={formatCurrency(customQuote.basePrice)} />
                  <SummaryLine label="Agent Seat Add-on" value={formatCurrency(customQuote.seatCharge)} />
                  <SummaryLine label="Bot Add-on" value={formatCurrency(customQuote.botCharge)} />
                  <SummaryLine label="Campaign Capacity" value={formatCurrency(customQuote.campaignCharge)} />
                  <SummaryLine label="AI Replies" value={formatCurrency(customQuote.aiCharge)} />
                  <SummaryLine label="Feature Add-ons" value={formatCurrency(customQuote.addOnCharge)} />
                </div>

                <div className="mt-6 rounded-[1.75rem] border border-emerald-400/20 bg-emerald-500/10 p-5">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-200">
                    Estimated Total
                  </div>
                  <div className="mt-2 text-4xl font-semibold tracking-tight text-white">
                    {formatCurrency(customQuote.total)}
                  </div>
                  <div className="mt-2 text-sm text-slate-300">Per month, before taxes and payment gateway fees.</div>
                </div>

                <div className="mt-6 rounded-[1.75rem] border border-white/10 bg-white/5 p-5">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-200">
                    Checkout details
                  </div>
                  <div className="mt-4 grid gap-3">
                    <input
                      value={checkoutName}
                      onChange={(event) => setCheckoutName(event.target.value)}
                      placeholder="Your name"
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400/40 focus:ring-1 focus:ring-emerald-400/40"
                    />
                    <input
                      value={checkoutEmail}
                      onChange={(event) => setCheckoutEmail(event.target.value)}
                      placeholder="Work email"
                      type="email"
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400/40 focus:ring-1 focus:ring-emerald-400/40"
                    />
                    <input
                      value={checkoutPassword}
                      onChange={(event) => setCheckoutPassword(event.target.value)}
                      placeholder="Create a password"
                      type="password"
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400/40 focus:ring-1 focus:ring-emerald-400/40"
                    />
                    <input
                      value={checkoutCompany}
                      onChange={(event) => setCheckoutCompany(event.target.value)}
                      placeholder="Company name"
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400/40 focus:ring-1 focus:ring-emerald-400/40"
                    />
                    <input
                      value={checkoutPhone}
                      onChange={(event) => setCheckoutPhone(event.target.value)}
                      placeholder="Phone number (optional)"
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400/40 focus:ring-1 focus:ring-emerald-400/40"
                    />
                    <input
                      value={checkoutWebsite}
                      onChange={(event) => setCheckoutWebsite(event.target.value)}
                      placeholder="Company website (optional)"
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400/40 focus:ring-1 focus:ring-emerald-400/40"
                    />
                    <input
                      value={checkoutIndustry}
                      onChange={(event) => setCheckoutIndustry(event.target.value)}
                      placeholder="Industry (optional)"
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400/40 focus:ring-1 focus:ring-emerald-400/40"
                    />
                    <input
                      value={checkoutTaxId}
                      onChange={(event) => setCheckoutTaxId(event.target.value)}
                      placeholder="GST / tax id (optional)"
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400/40 focus:ring-1 focus:ring-emerald-400/40"
                    />
                  </div>
                  {checkoutError ? (
                    <div className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                      {checkoutError}
                    </div>
                  ) : null}
                </div>

                <div className="mt-6 space-y-3">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200">
                    <div className="flex items-center gap-2 text-emerald-200">
                      <Check size={15} />
                      Included in this quote
                    </div>
                    <div className="mt-3 space-y-2 text-sm leading-6 text-slate-300">
                      <div>Seats: {seats}</div>
                      <div>Bots: {bots}</div>
                      <div>Campaigns: {campaignVolume.toLocaleString()}</div>
                      <div>AI replies: {aiReplies.toLocaleString()}</div>
                      <div>
                        Add-ons: {customQuote.selectedAddOns.length ? customQuote.selectedAddOns.map((addon) => addon.name).join(", ") : "None"}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={submitCheckout}
                    disabled={checkoutBusy}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-4 text-sm font-semibold text-white shadow-[0_12px_40px_-10px_rgba(16,185,129,0.6)] transition hover:opacity-90"
                  >
                    {checkoutBusy ? "Starting checkout..." : "Proceed to Checkout"}
                    <ChevronRight size={16} />
                  </button>

                  <button
                    type="button"
                    onClick={copyQuote}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm font-semibold text-white transition hover:border-emerald-400/30 hover:bg-emerald-500/10"
                  >
                    <Copy size={16} />
                    {copyState === "copied" ? "Quote copied" : "Copy quote"}
                  </button>
                </div>
              </div>
            </aside>
          </section>
        </div>
      </div>
    </>
  );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
      <div className="text-sm text-slate-300">{label}</div>
      <div className="text-sm font-semibold text-white">{value}</div>
    </div>
  );
}
