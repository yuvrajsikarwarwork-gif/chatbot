// src/controllers/authController.ts

import crypto from "crypto";
import { Request, Response, NextFunction } from "express";
import axios from "axios";

import { env } from "../config/env";
import {
  acceptInviteService,
  getUserService,
  registerService,
  loginService,
  logoutService,
  previewInviteTokenService,
  requestPasswordResetService,
  resetPasswordService,
  verifyPasswordResetOtpService,
  createSupportWorkspaceSessionService,
  endSupportWorkspaceSessionService,
} from "../services/authService";
import { downloadWorkspaceExportByTokenService, createWorkspaceService } from "../services/workspaceService";
import { findPlanById } from "../models/planModel";
import { query } from "../config/db";
import { getBillingWalletCheckoutSecretsService } from "../services/platformSettingsService";

import { AuthRequest } from "../middleware/authMiddleware";

export async function register(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { email, password, name } = req.body;

    const data = await registerService(
      email,
      password,
      name
    );

    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function login(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { email, password } = req.body;

    const data = await loginService(
      email,
      password
    );

    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function me(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const user = await getUserService(
      req.user.id,
      req.activeOrganizationId || req.user?.organization_id || null
    );

    res.json(user);
  } catch (err) {
    next(err);
  }
}

function toNumber(value: unknown, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function readPricingMatrix(plan: any) {
  const features = plan?.features && typeof plan.features === "object" ? plan.features : {};
  const matrix =
    features.pricing_matrix && typeof features.pricing_matrix === "object"
      ? features.pricing_matrix
      : {};
  const unitCosts =
    matrix.unit_costs && typeof matrix.unit_costs === "object" ? matrix.unit_costs : {};
  const addOns = Array.isArray(matrix.feature_addons) ? matrix.feature_addons : [];
  const addonMap = new Map<string, { name: string; priceInr: number; enabled: boolean }>();

  for (const addon of addOns) {
    const id = String(addon?.id || "").trim().toLowerCase();
    if (!id) continue;
    addonMap.set(id, {
      name: String(addon?.name || id).trim(),
      priceInr: toNumber(addon?.price_inr, 0),
      enabled: addon?.enabled !== false,
    });
  }

  return {
    unitCosts: {
      extra_bot_price_inr: toNumber(unitCosts.extra_bot_price_inr, toNumber(plan?.extra_agent_seat_price_inr, 0)),
      extra_1k_campaigns_price_inr: toNumber(unitCosts.extra_1k_campaigns_price_inr, 300),
    },
    addOnMap: addonMap,
  };
}

function buildCheckoutSummary(plan: any, payload: any) {
  const matrix = readPricingMatrix(plan);
  const seats = Math.max(1, toNumber(payload.seats, 1));
  const bots = Math.max(1, toNumber(payload.bots, 1));
  const campaigns = Math.max(0, toNumber(payload.campaignVolume, 0));
  const aiReplies = Math.max(0, toNumber(payload.aiReplies, 0));
  const selectedAddOnIds = Array.isArray(payload.addOnIds)
    ? payload.addOnIds.map((item: unknown) => String(item || "").trim().toLowerCase()).filter(Boolean)
    : [];

  const includedSeats = Math.max(1, toNumber(plan?.agent_seat_limit || plan?.included_users || 1, 1));
  const includedBots = Math.max(1, toNumber(plan?.active_bot_limit || 1, 1));
  const includedCampaigns = Math.max(0, toNumber(plan?.monthly_campaign_limit || 0, 0));
  const includedAiReplies = Math.max(0, toNumber(plan?.ai_reply_limit || 0, 0));

  const seatCharge = Math.max(0, seats - includedSeats) * toNumber(plan?.extra_agent_seat_price_inr, 0);
  const botCharge = Math.max(0, bots - includedBots) * matrix.unitCosts.extra_bot_price_inr;
  const campaignCharge =
    Math.max(0, Math.ceil(Math.max(0, campaigns - includedCampaigns) / 1000)) *
    matrix.unitCosts.extra_1k_campaigns_price_inr;
  const aiCharge = Math.max(0, aiReplies - includedAiReplies) * 0;
  const selectedAddOns = selectedAddOnIds
    .map((id: string) => ({ id, ...(matrix.addOnMap.get(id) || null) }))
    .filter((addon: any) => addon?.enabled !== false && addon?.priceInr !== undefined);
  const addOnCharge = selectedAddOns.reduce((sum: number, addon: any) => sum + toNumber(addon.priceInr, 0), 0);
  const total =
    toNumber(plan?.monthly_price_inr, 0) + seatCharge + botCharge + campaignCharge + aiCharge + addOnCharge;

  return {
    seats,
    bots,
    campaigns,
    aiReplies,
    seatCharge,
    botCharge,
    campaignCharge,
    aiCharge,
    addOnCharge,
    selectedAddOns,
    total,
    basePrice: toNumber(plan?.monthly_price_inr, 0),
    currency: "INR",
  };
}

function mergeCheckoutPaymentPayload(sourcePayload: Record<string, unknown>, payment: Record<string, unknown>) {
  return {
    ...sourcePayload,
    payment: {
      ...(sourcePayload.payment && typeof sourcePayload.payment === "object" ? sourcePayload.payment : {}),
      ...payment,
    },
  };
}

async function insertPricingCheckoutLead(input: {
  name: string;
  email: string;
  phone?: string | null;
  companyName: string;
  website?: string | null;
  industry?: string | null;
  taxId?: string | null;
  planId: string;
  quote: Record<string, unknown>;
}) {
  const res = await query(
    `INSERT INTO leads (
       name,
       phone,
       email,
       status,
       source,
       source_payload,
       variables,
       company_name,
       custom_variables
     ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9::jsonb)
     RETURNING id`,
    [
      input.name,
      input.phone || null,
      input.email,
      "new",
      "pricing_checkout",
      JSON.stringify({
        companyName: input.companyName,
        website: input.website || null,
        industry: input.industry || null,
        taxId: input.taxId || null,
        planId: input.planId,
        quote: input.quote,
      }),
      JSON.stringify(input.quote || {}),
      input.companyName,
      JSON.stringify({
        checkout_source: "pricing_page",
        checkout_plan_id: input.planId,
      }),
    ]
  );

  return res.rows[0];
}

function verifyRazorpaySignature(input: { orderId: string; paymentId: string; signature: string; secret: string }) {
  const expected = crypto
    .createHmac("sha256", input.secret)
    .update(`${input.orderId}|${input.paymentId}`)
    .digest("hex");
  return expected === input.signature;
}

function verifyStripeWebhookSignature(input: { rawBody: string; signatureHeader: string; secret: string }) {
  const header = String(input.signatureHeader || "").trim();
  if (!header || !input.rawBody || !input.secret) {
    return false;
  }

  const parts = header.split(",").reduce<Record<string, string>>((acc, part) => {
    const [key, value] = part.split("=", 2);
    if (key && value) {
      acc[key.trim()] = value.trim();
    }
    return acc;
  }, {});
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", input.secret)
    .update(`${timestamp}.${input.rawBody}`)
    .digest("hex");

  return expected === signature;
}

export async function pricingCheckoutInit(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const name = String(req.body?.name || req.body?.ownerName || "").trim();
    const companyName = String(req.body?.companyName || "").trim();
    const password = String(req.body?.password || "");
    const planId = String(req.body?.planId || "custom").trim().toLowerCase();

    if (!email || !name || !companyName || !password) {
      return res.status(400).json({
        error: "Name, email, password, and company name are required",
      });
    }

    const plan = await findPlanById(planId);
    if (!plan) {
      return res.status(404).json({ error: "Plan not found" });
    }

    const quote = buildCheckoutSummary(plan, req.body || {});
    const sourcePayload = {
      companyName,
      website: typeof req.body?.companyWebsite === "string" ? req.body.companyWebsite : null,
      industry: typeof req.body?.industry === "string" ? req.body.industry : null,
      taxId: typeof req.body?.taxId === "string" ? req.body.taxId : null,
      planId,
      quote: {
        ...quote,
        pricing_mode: "custom_checkout",
        selectedPlanId: planId,
      },
    };

    const pending = await insertPricingCheckoutLead({
      name,
      email,
      phone: typeof req.body?.ownerPhone === "string" ? req.body.ownerPhone : null,
      companyName,
      website: sourcePayload.website,
      industry: sourcePayload.industry,
      taxId: sourcePayload.taxId,
      planId,
      quote: sourcePayload.quote,
    });

    const billing = await getBillingWalletCheckoutSecretsService();
    const amount = Math.max(1, Math.round(quote.total * 100));
    const razorpayReady =
      billing.billingProvider === "razorpay" &&
      Boolean(billing.razorpay.keyId && billing.razorpay.keySecret && billing.razorpay.webhookSecret);

    if (billing.billingProvider === "razorpay" && !razorpayReady) {
      return res.status(409).json({
        error: "Razorpay billing is selected but the live keys and webhook secret are not fully configured.",
      });
    }

    if (razorpayReady) {
      const orderRes = await axios.post(
        "https://api.razorpay.com/v1/orders",
        {
          amount,
          currency: "INR",
          receipt: String(pending.id),
          payment_capture: 1,
          notes: {
            checkout_reference_id: String(pending.id),
            plan_id: planId,
            company_name: companyName,
          },
        },
        {
          auth: {
            username: billing.razorpay.keyId,
            password: billing.razorpay.keySecret,
          },
        }
      );

      const gatewayOrderId = String(orderRes.data?.id || "");
      const updatedSourcePayload = mergeCheckoutPaymentPayload(sourcePayload as Record<string, unknown>, {
        gateway: "razorpay",
        orderId: gatewayOrderId,
        amount,
        currency: "INR",
      });

      await query(
        `UPDATE leads
         SET source_payload = $2::jsonb,
             updated_at = NOW()
         WHERE id = $1`,
        [String(pending.id), JSON.stringify(updatedSourcePayload)]
      );

      return res.status(201).json({
        gateway: "razorpay",
        keyId: billing.razorpay.keyId,
        orderId: gatewayOrderId,
        amount,
        currency: "INR",
        referenceId: String(pending.id),
        planId,
        quote,
      });
    }

    const stripeReady =
      billing.billingProvider === "stripe" &&
      Boolean(billing.stripe.publicKey && billing.stripe.secretKey && billing.stripe.webhookSecret);

    if (billing.billingProvider === "stripe" && !stripeReady) {
      return res.status(409).json({
        error: "Stripe billing is selected but the live keys and webhook secret are not fully configured.",
      });
    }

    if (stripeReady) {
      const publicAppBaseUrl = String(env.PUBLIC_APP_BASE_URL || "http://localhost:3000").trim().replace(/\/$/, "");
      const successUrl = `${publicAppBaseUrl}/pricing/custom?checkout=stripe&referenceId=${encodeURIComponent(
        String(pending.id)
      )}&session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = `${publicAppBaseUrl}/pricing/custom?checkout=stripe_cancelled&referenceId=${encodeURIComponent(
        String(pending.id)
      )}`;
      const stripeParams = new URLSearchParams();
      stripeParams.set("mode", "payment");
      stripeParams.set("success_url", successUrl);
      stripeParams.set("cancel_url", cancelUrl);
      stripeParams.set("client_reference_id", String(pending.id));
      stripeParams.set("customer_email", email);
      stripeParams.set("line_items[0][price_data][currency]", "inr");
      stripeParams.set("line_items[0][price_data][product_data][name]", "BOT.OS Custom Plan");
      stripeParams.set("line_items[0][price_data][unit_amount]", String(amount));
      stripeParams.set("line_items[0][quantity]", "1");
      stripeParams.set("metadata[checkout_reference_id]", String(pending.id));
      stripeParams.set("metadata[plan_id]", planId);
      stripeParams.set("metadata[company_name]", companyName);

      const sessionRes = await axios.post(
        "https://api.stripe.com/v1/checkout/sessions",
        stripeParams.toString(),
        {
          auth: {
            username: stripeReady ? billing.stripe.secretKey : "",
            password: "",
          },
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );

      const checkoutUrl = String(sessionRes.data?.url || "");
      const sessionId = String(sessionRes.data?.id || "");
      const updatedSourcePayload = mergeCheckoutPaymentPayload(sourcePayload as Record<string, unknown>, {
        gateway: "stripe",
        sessionId,
        amount,
        currency: "INR",
      });

      await query(
        `UPDATE leads
         SET source_payload = $2::jsonb,
             updated_at = NOW()
         WHERE id = $1`,
        [String(pending.id), JSON.stringify(updatedSourcePayload)]
      );

      return res.status(201).json({
        gateway: "stripe",
        checkoutUrl,
        sessionId,
        referenceId: String(pending.id),
        amount,
        currency: "INR",
        planId,
        quote,
      });
    }

    return res.status(201).json({
      gateway: "direct",
      referenceId: String(pending.id),
      amount,
      currency: "INR",
      planId,
      quote,
      note: "Billing gateway is not configured. This falls back to direct provisioning for now.",
    });
  } catch (err) {
    next(err);
  }
}

export async function pricingCheckoutConfirm(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const referenceId = String(req.body?.referenceId || "").trim();
    const orderId = String(req.body?.orderId || "").trim();
    const paymentId = String(req.body?.paymentId || "").trim();
    const signature = String(req.body?.signature || "").trim();
    const password = String(req.body?.password || "");
    const planId = String(req.body?.planId || "custom").trim().toLowerCase();

    if (!referenceId || !password || !planId) {
      return res.status(400).json({ error: "Checkout reference, password, and plan id are required" });
    }

    const leadRes = await query(
      `SELECT * FROM leads WHERE id = $1 AND source = 'pricing_checkout' LIMIT 1`,
      [referenceId]
    );
    const lead = leadRes.rows[0];
    if (!lead) {
      return res.status(404).json({ error: "Checkout reference not found" });
    }

    const plan = await findPlanById(planId);
    if (!plan) {
      return res.status(404).json({ error: "Plan not found" });
    }

    const sourcePayload = lead.source_payload && typeof lead.source_payload === "object" ? lead.source_payload : {};
    const sourcePayloadRecord = sourcePayload as Record<string, unknown>;
    const sourcePayment =
      sourcePayloadRecord.payment && typeof sourcePayloadRecord.payment === "object"
        ? (sourcePayloadRecord.payment as Record<string, unknown>)
        : {};
    const checkoutGateway = String(sourcePayment.gateway || "").trim().toLowerCase();
    const billing = await getBillingWalletCheckoutSecretsService();
    if (checkoutGateway === "razorpay") {
      if (!billing.razorpay.keyId || !billing.razorpay.keySecret || !billing.razorpay.webhookSecret) {
        return res.status(409).json({ error: "Razorpay live checkout is not fully configured" });
      }
      if (!orderId || !paymentId || !signature) {
        return res.status(400).json({ error: "Payment details are required" });
      }

      const valid = verifyRazorpaySignature({
        orderId,
        paymentId,
        signature,
        secret: billing.razorpay.keySecret,
      });
      if (!valid) {
        return res.status(400).json({ error: "Payment verification failed" });
      }
    } else if (checkoutGateway === "stripe") {
      if (!billing.stripe.publicKey || !billing.stripe.secretKey || !billing.stripe.webhookSecret) {
        return res.status(409).json({ error: "Stripe live checkout is not fully configured" });
      }

      const sessionId = String(req.body?.sessionId || "").trim();
      if (!sessionId) {
        return res.status(400).json({ error: "Stripe session id is required" });
      }

      const sessionRes = await axios.get(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
        auth: {
          username: billing.stripe.secretKey,
          password: "",
        },
        params: {
          "expand[]": "payment_intent",
        },
      });

      const session = sessionRes.data || {};
      const sessionReference = String(session.client_reference_id || session.metadata?.checkout_reference_id || "").trim();
      if (sessionReference && sessionReference !== referenceId) {
        return res.status(400).json({ error: "Stripe session does not match the checkout reference" });
      }
      if (String(session.payment_status || "").toLowerCase() !== "paid" || String(session.status || "").toLowerCase() !== "complete") {
        return res.status(400).json({ error: "Stripe payment has not completed yet" });
      }
    }

    const ownerEmail = String(lead.email || sourcePayload.email || "").trim().toLowerCase();
    const ownerName = String(lead.name || sourcePayload.name || "").trim();
    const companyName = String(sourcePayload.companyName || lead.company_name || "").trim();

    if (!ownerEmail || !ownerName || !companyName) {
      return res.status(400).json({ error: "Checkout data is incomplete" });
    }

    let ownerUserId = "";
    const existingUser = await query(`SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1`, [ownerEmail]);
    const existingUserId = String(existingUser.rows[0]?.id || "").trim();
    if (existingUserId) {
      const verified = await loginService(ownerEmail, password);
      ownerUserId = String(verified?.user?.id || existingUserId || "").trim();
    } else {
      const signup = await registerService(ownerEmail, password, ownerName);
      ownerUserId = String(signup?.user?.id || "").trim();
    }

    if (!ownerUserId) {
      return res.status(500).json({ error: "Unable to resolve account owner" });
    }

    const quote = sourcePayload.quote || {};
    const provision = await createWorkspaceService(ownerUserId, {
      name: companyName,
      companyName,
      ownerUserId,
      ownerName,
      ownerEmail,
      ownerPhone: typeof sourcePayload.phone === "string" ? sourcePayload.phone : null,
      companyWebsite: typeof sourcePayload.website === "string" ? sourcePayload.website : null,
      industry: typeof sourcePayload.industry === "string" ? sourcePayload.industry : null,
      taxId: typeof sourcePayload.taxId === "string" ? sourcePayload.taxId : null,
      planId,
      billingCycle: "monthly",
      currency: "INR",
      initialWalletTopup: 0,
      aiOverageUnitPrice: 0,
      publicCheckout: true,
      sendInvite: false,
      billingMetadata: {
        pricing_mode: "custom_checkout",
        quote,
        payment: {
          gateway: billing.billingProvider,
          orderId: orderId || null,
          paymentId: paymentId || null,
        },
      },
    });

    await query(
      `UPDATE leads
       SET status = 'paid',
           notes = COALESCE(notes, '') || CASE WHEN COALESCE(notes, '') = '' THEN '' ELSE E'\n' END || $2,
           updated_at = NOW()
       WHERE id = $1`,
      [
        referenceId,
        JSON.stringify({
          paid_at: new Date().toISOString(),
          workspace_name: String(provision?.name || companyName),
          workspace_id: String(provision?.id || ""),
        }),
      ]
    ).catch(() => null);

    const session = await loginService(ownerEmail, password);
    res.status(201).json(session);
  } catch (err) {
    next(err);
  }
}

export async function logout(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const data = await logoutService(req.user.id);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function previewInvite(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const token = String(req.query.token || "");
    if (!token) {
      return res.status(400).json({ error: "token is required" });
    }

    const data = await previewInviteTokenService(token);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function acceptInvite(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const data = await acceptInviteService({
      token: req.body?.token,
      password: req.body?.password,
      name: req.body?.name,
    });
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function requestPasswordReset(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const data = await requestPasswordResetService(req.body?.email);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function verifyPasswordResetOtp(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const data = await verifyPasswordResetOtpService(req.body?.email, req.body?.otp);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function resetPassword(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const data = await resetPasswordService(
      req.body?.email,
      req.body?.otp,
      req.body?.password
    );
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function createSupportWorkspaceSession(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const actorUserId = req.user?.id || req.user?.user_id;
    if (!actorUserId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const data = await createSupportWorkspaceSessionService({
      actorUserId,
      workspaceId: String(req.body?.workspaceId || ""),
      durationHours: req.body?.durationHours,
      consentConfirmed: req.body?.consentConfirmed === true,
      consentNote: typeof req.body?.consentNote === "string" ? req.body.consentNote : null,
    });
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function endSupportWorkspaceSession(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const actorUserId = req.user?.id || req.user?.user_id;
    if (!actorUserId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const data = await endSupportWorkspaceSessionService({
      actorUserId,
      workspaceId: req.body?.workspaceId || req.query?.workspaceId || null,
    });
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function downloadWorkspaceExport(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const file = await downloadWorkspaceExportByTokenService(String(req.query.token || ""));
    return res.download(file.filePath, file.fileName);
  } catch (err) {
    next(err);
  }
}
