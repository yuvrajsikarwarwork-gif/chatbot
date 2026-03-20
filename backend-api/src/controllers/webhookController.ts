import { Request, Response } from "express";
import * as FlowEngine from "../services/flowEngine";
import { query } from "../config/db";
import { routeMessage } from "../services/messageRouter";

export const verifyWebhook = (req: Request, res: Response) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  const verifyToken = process.env.WA_VERIFY_TOKEN || process.env.VERIFY_TOKEN;

  if (mode === "subscribe" && token === verifyToken) {
    console.log("✅ Meta Webhook Successfully Verified!");
    return res.status(200).send(challenge);
  }
  console.warn("❌ Webhook Verification Failed. Token Mismatch.");
  return res.sendStatus(403);
};

export const receiveMessage = async (req: Request, res: Response) => {
  const body = req.body;
  const io = req.app.get("io");

  // 🔴 ADDED LOGGING: See exactly what Meta is sending
  console.log("\n=========================================");
  console.log("📩 INCOMING WEBHOOK FROM META:");
  console.log(JSON.stringify(body, null, 2));
  console.log("=========================================\n");

  if (body.entry?.[0]?.changes?.[0]?.value?.statuses) return res.sendStatus(200);
  if (body.object !== "whatsapp_business_account") return res.sendStatus(404);

  const value = body.entry?.[0]?.changes?.[0]?.value;
  const message = value?.messages?.[0];
  if (!message) return res.sendStatus(200);

  const phoneNumberId = value?.metadata?.phone_number_id;
  const from = message.from;
  const waName = value?.contacts?.[0]?.profile?.name || "User";

  try {
    const botRes = await query(
      `SELECT bot_id FROM integrations WHERE channel = 'whatsapp' AND credentials->>'phone_number_id' = $1 AND is_active = true LIMIT 1`, 
      [phoneNumberId]
    );
    const botId = botRes.rows[0]?.bot_id;
    
    // 🔴 ADDED LOGGING: Warn if phone number doesn't match the DB
    if (!botId) {
      console.warn(`\n⚠️ ALERT: Meta sent a message to Phone ID '${phoneNumberId}', but no active bot matches this in your database!`);
      console.warn(`Fix: Copy '${phoneNumberId}' and paste it into your Bot's WhatsApp settings in the dashboard.\n`);
      return res.sendStatus(200); 
    }

    let incomingText = "";
    let buttonId = "";

    if (message.type === "text") {
      incomingText = message.text?.body || "";
    } else if (message.type === "interactive") {
      const interactive = message.interactive;
      buttonId = interactive.button_reply?.id || interactive.list_reply?.id || "";
      incomingText = interactive.button_reply?.title || interactive.list_reply?.title || buttonId;
    }

    console.log(`✅ Routing message from ${waName} to Bot ID: ${botId}`);

    // Trigger engine (which creates/finds conversation)
    const result = await FlowEngine.processIncomingMessage(botId, from, waName, incomingText, buttonId, io, "whatsapp");
    if (result?.conversationId && result.actions?.length) {
      for (const action of result.actions) {
        await routeMessage(result.conversationId, action, io);
      }
    }

    // Dashboard Sync
    const convRes = await query(
      `SELECT c.id FROM conversations c 
       JOIN contacts ct ON c.contact_id = ct.id 
       WHERE ct.platform_user_id = $1 AND c.bot_id = $2 AND c.channel = 'whatsapp'`,
      [from, botId]
    );

    if (io && convRes.rows[0]) {
      io.emit("dashboard_update", {
        conversationId: convRes.rows[0].id,
        botId,
        channel: "whatsapp",
        platformUserId: from,
        text: incomingText,
        isBot: false,
        timestamp: new Date().toISOString()
      });
    }

  } catch (err: any) {
    console.error("❌ WEBHOOK ERROR:", err.message);
  }

  return res.sendStatus(200);
};