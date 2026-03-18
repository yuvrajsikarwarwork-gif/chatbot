import { Request, Response } from "express";
import { query } from "../config/db";
import axios from "axios";

const DEFAULT_PHONE_ID = process.env.PHONE_NUMBER_ID || "1030050193525162";
const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || "";

/**
 * 1. Fetch Live Inbox Leads
 * Returns leads sorted by active human sessions and recent activity.
 */
export const getInboxLeads = async (req: Request, res: Response) => {
  try {
    const result = await query(`
      SELECT id, platform_user_id, user_name, platform, bot_active, human_active, updated_at, last_user_msg_at 
      FROM leads 
      ORDER BY human_active DESC, updated_at DESC
    `);
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * 2. Fetch Chat History
 * Retrieves past messages for a specific user across any platform.
 */
export const getChatHistory = async (req: Request, res: Response) => {
  const { wa_number } = req.params; // Generic ID passed from frontend
  try {
    const result = await query(`
      SELECT id, message as text, sender, created_at as timestamp 
      FROM messages 
      WHERE platform_user_id = $1 
      ORDER BY created_at ASC
    `, [wa_number]);
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * 3. Send Manual Agent Message
 * Sends message via WhatsApp and logs it to the universal messages table.
 */
export const sendAgentMessage = async (req: Request, res: Response) => {
  const { wa_number, message, platform } = req.body;
  try {
    // Currently hardcoded for WhatsApp - will use Adapter in next phase
    if (!platform || platform === 'whatsapp') {
      await axios({
        method: "POST",
        url: `https://graph.facebook.com/v18.0/${DEFAULT_PHONE_ID}/messages`,
        data: { messaging_product: "whatsapp", to: wa_number, type: "text", text: { body: message } },
        headers: { Authorization: `Bearer ${TOKEN}` }
      });
    }

    // Universal Logging
    await query(
      `INSERT INTO messages (platform_user_id, message, sender, platform) VALUES ($1, $2, 'agent', $3)`, 
      [wa_number, message, platform || 'whatsapp']
    );
    
    await query(
      `UPDATE leads SET updated_at = NOW() WHERE platform_user_id = $1`, 
      [wa_number]
    );

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.response?.data || error.message });
  }
};

/**
 * 4. Resolve Chat Manually
 * Closes human session and returns control to the bot.
 */
export const resumeBotManually = async (req: Request, res: Response) => {
  const { wa_number, platform } = req.body;
  try {
    await query(`
      UPDATE leads 
      SET human_active = false, bot_active = true, last_node_id = NULL, retry_count = 0, updated_at = NOW()
      WHERE platform_user_id = $1
    `, [wa_number]);

    const systemMsg = "Agent session ended. Bot resumed.";
    
    // Notify User
    if (!platform || platform === 'whatsapp') {
      await axios({
        method: "POST",
        url: `https://graph.facebook.com/v18.0/${DEFAULT_PHONE_ID}/messages`,
        data: { messaging_product: "whatsapp", to: wa_number, type: "text", text: { body: systemMsg } },
        headers: { Authorization: `Bearer ${TOKEN}` }
      }).catch(() => console.warn("Could not notify user of session end"));
    }

    // Log the System message for UI visibility
    await query(
      `INSERT INTO messages (platform_user_id, message, sender, platform) VALUES ($1, $2, 'system', $3)`, 
      [wa_number, systemMsg, platform || 'whatsapp']
    );

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};