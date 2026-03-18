import { Request, Response } from "express";
import * as FlowEngine from "../services/flowEngine";
import { query } from "../config/db";

/**
 * 1. Webhook Verification
 */
export const verifyWebhook = (req: Request, res: Response) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  const verifyToken = process.env.WA_VERIFY_TOKEN || process.env.VERIFY_TOKEN;

  if (mode === "subscribe" && token === verifyToken) {
    console.log("✅ Webhook verified");
    return res.status(200).send(challenge);
  }

  console.log("❌ Verify failed");
  return res.sendStatus(403);
};

/**
 * 2. Receive message
 */
export const receiveMessage = async (req: Request, res: Response) => {
  const body = req.body;
  const io = req.app.get("io");

  if (body.entry?.[0]?.changes?.[0]?.value?.statuses) {
    return res.sendStatus(200);
  }

  if (body.object !== "whatsapp_business_account") {
    return res.sendStatus(404);
  }

  const entry = body.entry?.[0];
  const change = entry?.changes?.[0];
  const value = change?.value;
  const message = value?.messages?.[0];

  if (!message) {
    return res.sendStatus(200);
  }

  const phoneNumberId = value?.metadata?.phone_number_id;
  if (!phoneNumberId) return res.sendStatus(200);

  let botId: string | null = null;

  try {
    // ✅ PATCH: Query the integrations table JSONB instead of the bots table directly
    const botRes = await query(
      `SELECT bot_id FROM integrations 
       WHERE channel = 'whatsapp' 
       AND (credentials->>'phone_number_id' = $1 OR config->>'phone_number_id' = $1)
       AND is_active = true LIMIT 1`, 
      [phoneNumberId]
    );
    botId = botRes.rows[0]?.bot_id;

    if (!botId) {
      console.log(`⚠️ Webhook received for unconfigured or inactive phone ID: ${phoneNumberId}`);
      return res.sendStatus(200); 
    }

    await query(
      "INSERT INTO webhook_logs (bot_id, incoming_payload) VALUES ($1, $2)", 
      [botId, JSON.stringify(body)]
    ).catch(e => console.error("Failed to log webhook payload:", e.message));

  } catch (err: any) {
    console.error("DB ERROR (Bot Lookup):", err.message);
    return res.sendStatus(200);
  }

  const from = message.from;
  const waName = value?.contacts?.[0]?.profile?.name || "User";

  let incomingText = "";
  let buttonId = "";

  if (message.type === "text") {
    incomingText = (message.text?.body || "").toLowerCase().trim();
  } else if (message.type === "interactive") {
    const interactive = message.interactive;
    buttonId = interactive.button_reply?.id || interactive.list_reply?.id || "";
    incomingText = (interactive.button_reply?.title || interactive.list_reply?.title || buttonId).toLowerCase().trim();
  }

  console.log(`MSG [Bot:${botId}]:`, from, incomingText, buttonId);

  if (io) {
    io.emit("whatsapp_message", {
      botId,
      from,
      text: incomingText,
      isBot: false
    });
  }

  try {
    const leadRes = await query("SELECT human_active FROM leads WHERE wa_number=$1 AND bot_id=$2", [from, botId]);
    const isHuman = leadRes.rows[0]?.human_active;

    if (isHuman) {
      const lower = incomingText.toLowerCase().trim();
      if (lower !== "reset") {
        console.log(`👤 Human active for lead ${from} on bot ${botId}`);
        return res.sendStatus(200);
      }
    }

    FlowEngine.processIncomingMessage(
      botId, 
      from,
      waName,
      incomingText,
      buttonId,
      io
    ).catch(async (err: any) => {
      console.error("ENGINE ERROR:", err.message);
      // ✅ PATCH: Catch DB insertion errors so they don't break the thread if schema is still missing
      await query(
        "INSERT INTO webhook_logs (bot_id, wa_number, error_message) VALUES ($1,$2,$3)", 
        [botId, from, err.message]
      ).catch((logErr) => console.error("Failed to write error to webhook_logs:", logErr.message));
    });

  } catch (err: any) {
    console.error("DB/ROUTING ERROR:", err.message);
  }

  return res.sendStatus(200);
};