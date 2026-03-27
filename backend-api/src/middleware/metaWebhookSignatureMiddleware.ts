import crypto from "crypto";
import { NextFunction, Request, Response } from "express";

import { env } from "../config/env";

function shouldVerifyMetaSignature(req: Request) {
  if (req.method.toUpperCase() !== "POST") {
    return false;
  }

  const platform = String(req.params.platform || "whatsapp").trim().toLowerCase();
  return platform === "whatsapp" || platform === "facebook" || platform === "instagram";
}

function computeExpectedSignature(rawBody: Buffer) {
  return `sha256=${crypto
    .createHmac("sha256", env.META_APP_SECRET)
    .update(rawBody)
    .digest("hex")}`;
}

export function verifyMetaWebhookSignature(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (!shouldVerifyMetaSignature(req)) {
    return next();
  }

  if (!env.META_APP_SECRET) {
    console.error("Meta webhook signature verification is enabled, but META_APP_SECRET is missing.");
    return res.status(500).json({ error: "META_APP_SECRET is not configured" });
  }

  const signature = String(req.headers["x-hub-signature-256"] || "").trim();
  if (!signature) {
    return res.status(401).json({ error: "Missing Meta webhook signature" });
  }

  if (!req.rawBody || !Buffer.isBuffer(req.rawBody)) {
    return res.status(400).json({ error: "Missing raw request body for signature verification" });
  }

  const expectedSignature = computeExpectedSignature(req.rawBody);
  const receivedBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");

  if (
    receivedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(receivedBuffer, expectedBuffer)
  ) {
    return res.status(401).json({ error: "Invalid Meta webhook signature" });
  }

  return next();
}
