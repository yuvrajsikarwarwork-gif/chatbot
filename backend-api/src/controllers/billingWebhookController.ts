import crypto from "crypto";
import { Request, Response } from "express";

import { query } from "../config/db";
import { getBillingWalletCheckoutSecretsService } from "../services/platformSettingsService";

function verifyRazorpayWebhook(rawBody: string, signature: string, secret: string) {
  if (!rawBody || !signature || !secret) {
    return false;
  }

  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return expected === signature;
}

function verifyStripeWebhook(rawBody: string, signatureHeader: string, secret: string) {
  if (!rawBody || !signatureHeader || !secret) {
    return false;
  }

  const parts = signatureHeader.split(",").reduce<Record<string, string>>((acc, part) => {
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

  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return expected === signature;
}

function parseRawJson(rawBody?: Buffer) {
  if (!rawBody || rawBody.length === 0) {
    return {};
  }

  try {
    return JSON.parse(rawBody.toString("utf8"));
  } catch {
    return {};
  }
}

export async function handleBillingWebhook(req: Request, res: Response) {
  const billing = await getBillingWalletCheckoutSecretsService();
  const rawBody = req.rawBody?.toString("utf8") || JSON.stringify(req.body || {});
  const payload = parseRawJson(req.rawBody) || (req.body && typeof req.body === "object" ? req.body : {});
  const signature = String(req.header("x-razorpay-signature") || req.header("stripe-signature") || "").trim();
  const eventType = String(payload.event || payload.type || "").trim().toLowerCase();
  const eventId = String(payload.id || payload.event_id || "").trim();
  const paymentEntity = payload?.payload?.payment?.entity || payload?.payload?.order?.entity || payload?.data?.object || {};
  const orderId = String(paymentEntity.order_id || paymentEntity.orderId || paymentEntity.client_reference_id || paymentEntity.metadata?.checkout_reference_id || "").trim();
  const paymentId = String(paymentEntity.id || paymentEntity.payment_id || paymentEntity.payment_intent || "").trim();

  if (billing.billingProvider === "razorpay") {
    if (!billing.razorpay.webhookSecret) {
      return res.status(409).json({ error: "Razorpay webhook secret is not configured" });
    }
    if (!verifyRazorpayWebhook(rawBody, signature, billing.razorpay.webhookSecret)) {
      return res.status(401).json({ error: "Invalid webhook signature" });
    }
  } else if (billing.billingProvider === "stripe") {
    if (!billing.stripe.webhookSecret) {
      return res.status(409).json({ error: "Stripe webhook secret is not configured" });
    }
    if (!verifyStripeWebhook(rawBody, signature, billing.stripe.webhookSecret)) {
      return res.status(401).json({ error: "Invalid webhook signature" });
    }
    if (!eventId) {
      return res.status(400).json({ error: "Missing Stripe event id" });
    }
    const eventInsert = await query(
      `INSERT INTO processed_stripe_events (event_id, event_type)
       VALUES ($1, $2)
       ON CONFLICT (event_id) DO NOTHING
       RETURNING event_id`,
      [eventId, eventType || "unknown"]
    );
    if (!eventInsert.rows[0]) {
      return res.status(200).send("Duplicate event ignored");
    }
  }

  let matchedLead = null;
  if (orderId) {
    const leadRes = await query(
      `SELECT *
       FROM leads
       WHERE source = 'pricing_checkout'
         AND (
           source_payload->'payment'->>'orderId' = $1
           OR source_payload->'payment'->>'sessionId' = $1
           OR source_payload->'payment'->>'client_reference_id' = $1
         )
       LIMIT 1`,
      [orderId]
    );
    matchedLead = leadRes.rows[0] || null;
  }

  if (matchedLead) {
    const sourcePayload = matchedLead.source_payload && typeof matchedLead.source_payload === "object"
      ? matchedLead.source_payload
      : {};
    const nextPayload = {
      ...sourcePayload,
      payment: {
        ...(sourcePayload.payment && typeof sourcePayload.payment === "object" ? sourcePayload.payment : {}),
        gateway: billing.billingProvider,
        orderId: orderId || null,
        paymentId: paymentId || null,
        sessionId: String(paymentEntity.id || paymentEntity.session_id || "").trim() || null,
        eventType,
        receivedAt: new Date().toISOString(),
      },
    };

    await query(
      `UPDATE leads
       SET status = CASE WHEN status = 'paid' THEN status ELSE 'paid' END,
           source_payload = $2::jsonb,
           notes = COALESCE(notes, '') || CASE WHEN COALESCE(notes, '') = '' THEN '' ELSE E'\n' END || $3,
           updated_at = NOW()
       WHERE id = $1`,
      [
        matchedLead.id,
        JSON.stringify(nextPayload),
        JSON.stringify({
          billing_webhook_event: eventType,
          order_id: orderId || null,
          payment_id: paymentId || null,
          received_at: new Date().toISOString(),
        }),
      ]
    );
  }

  return res.status(200).json({
    ok: true,
    eventType,
    matched: Boolean(matchedLead),
  });
}
