import axios from "axios";
import { query } from "../config/db";

const DEFAULT_PHONE_ID = process.env.PHONE_NUMBER_ID || "1030050193525162";
const MAX_RETRY_LIMIT = 3;
const AGENT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

/* ============================
    GLOBAL STORES & LOCKS
============================ */
const processingLocks: Set<string> = new Set(); 
const ESCAPE_KEYWORDS = ["end", "exit", "stop", "cancel", "quit"];
const RESET_KEYWORDS = ["reset", "restart", "home", "menu", "start"];

const globalAny: any = global;
if (!globalAny.activeReminders) globalAny.activeReminders = new Map<string, NodeJS.Timeout>();
if (!globalAny.activeTimeouts) globalAny.activeTimeouts = new Map<string, NodeJS.Timeout>();

const activeReminders = globalAny.activeReminders;
const activeTimeouts = globalAny.activeTimeouts;

export const clearUserTimers = (from: string) => {
  if (activeReminders.has(from)) clearTimeout(activeReminders.get(from)!);
  if (activeTimeouts.has(from)) clearTimeout(activeTimeouts.get(from)!);
  activeReminders.delete(from);
  activeTimeouts.delete(from);
};

/* ============================
    HELPERS & VALIDATORS
============================ */
const getActiveToken = () => process.env.WHATSAPP_ACCESS_TOKEN || "";

const replaceVariables = (text: string, variables: any) => {
  if (!text) return "";
  return text.replace(/{{(\w+)}}/g, (_, key) => {
    return variables && variables[key] !== undefined ? variables[key] : `{{${key}}}`;
  });
};

const validators: Record<string, (v: string) => boolean> = {
  text: (v: string) => v.trim().length > 0,
  email: (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
  phone: (v: string) => /^[0-9+\-() ]{6,15}$/.test(v),
  number: (v: string) => !isNaN(Number(v)),
  date: (v: string) => !isNaN(Date.parse(v)),
  regex: (v: string, pattern: string) => new RegExp(pattern).test(v)
};

const isInputNode = (t: string) => t === "input" || t === "menu_button" || t === "menu_list";

/* ============================
    RETRY & ERROR HANDLER HELPERS
============================ */
const handleValidationError = async (lead: any, lastNode: any, from: string, phoneId: string, token: string) => {
  const currentRetries = (lead.retry_count || 0) + 1;
  
  if (currentRetries >= (lastNode.data?.maxRetries || MAX_RETRY_LIMIT)) {
    await query("UPDATE leads SET retry_count = 0 WHERE id = $1", [lead.id]);
    const limitEdge = lastNode.edges?.find((e: any) => String(e.sourceHandle) === "limit" && String(e.source) === String(lastNode.id));
    if (limitEdge) return limitEdge.target; 

    const errorNodeRes = await query("SELECT flow_json FROM flows WHERE bot_id = $1", [lead.bot_id]);
    const globalHandler = errorNodeRes.rows[0]?.flow_json?.nodes?.find((n: any) => n.type === "error_handler");
    return globalHandler ? globalHandler.id : null;
  }

  await query("UPDATE leads SET retry_count = $1 WHERE id = $2", [currentRetries, lead.id]);
  await axios({
    method: "POST", url: `https://graph.facebook.com/v18.0/${phoneId}/messages`,
    data: { messaging_product: "whatsapp", to: from, type: "text", text: { body: lastNode.data?.onInvalidMessage || "Invalid input. Please try again." } },
    headers: { Authorization: `Bearer ${token}` }
  }).catch(console.error);
  return "stay"; 
};

/* ============================
    CORE EXECUTION ENGINE
============================ */
export const executeFlowFromNode = async (startNode: any, leadId: number, from: string, nodes: any[], edges: any[], phoneId: string, token: string, botName: string, io: any) => {
  if (processingLocks.has(from)) return;
  processingLocks.add(from);

  try {
    let currentNode = startNode;
    let loop = 0;
    
    const leadRes = await query("SELECT variables, bot_id FROM leads WHERE id = $1", [leadId]);
    let vars = leadRes.rows[0]?.variables || {};

    while (currentNode && loop < 25) {
      loop++;
      console.log(`📍 [Engine] Node Hit: ${currentNode.type} (${currentNode.id})`);
      const data = currentNode.data || {};
      let payload: any = null;

      // 1. HANDOFF LOGIC
      if (currentNode.type === "assign_agent") {
        await query("UPDATE leads SET bot_active = false, human_active = true WHERE id = $1", [leadId]);
        payload = { messaging_product: "whatsapp", to: from, type: "text", text: { body: data.text || "Bot paused. An agent will be with you shortly." } };
        
        clearUserTimers(from);
        activeTimeouts.set(from, setTimeout(async () => {
            await query("UPDATE leads SET human_active = false, bot_active = true, last_node_id = NULL WHERE id = $1", [leadId]);
            await axios({
              method: "POST", url: `https://graph.facebook.com/v18.0/${phoneId}/messages`,
              data: { messaging_product: "whatsapp", to: from, type: "text", text: { body: "Agent session ended due to inactivity. The bot has resumed." } },
              headers: { Authorization: `Bearer ${token}` }
            }).catch(console.error);
        }, AGENT_TIMEOUT_MS));
      }
      else if (currentNode.type === "resume_bot") {
        await query("UPDATE leads SET bot_active = true, human_active = false WHERE id = $1", [leadId]);
        payload = { messaging_product: "whatsapp", to: from, type: "text", text: { body: data.text || "Automation resumed." } };
        clearUserTimers(from); 
      }
      
      // 2. MESSAGING LOGIC
      else if (currentNode.type === "msg_text" || currentNode.type === "input") {
        let text = replaceVariables(data.text || data.label || "...", vars);
        if (currentNode.type === "input") text += "\n\n_(Type 'reset' to rewrite)_";
        payload = { messaging_product: "whatsapp", to: from, type: "text", text: { body: text } };
      }
      else if (currentNode.type === "error_handler") {
        payload = { messaging_product: "whatsapp", to: from, type: "text", text: { body: data.text || "Too many invalid attempts. Session reset." } };
        await query("UPDATE leads SET last_node_id = NULL, variables = '{}', retry_count = 0 WHERE id = $1", [leadId]); 
      }
      else if (currentNode.type === "end") {
        payload = { messaging_product: "whatsapp", to: from, type: "text", text: { body: data.text || "Session completed." } };
        await query("UPDATE leads SET last_node_id = NULL, variables = '{}', retry_count = 0 WHERE id = $1", [leadId]);
        break;
      }
      else if (currentNode.type === "menu_button" || currentNode.type === "menu_list") {
        payload = {
          messaging_product: "whatsapp", to: from, type: "interactive",
          interactive: {
            type: "button",
            body: { text: replaceVariables(data.text || "Choose an option:", vars) },
            action: {
              buttons: [
                data.item1 && { type: "reply", reply: { id: "item1", title: data.item1.substring(0, 20) } },
                data.item2 && { type: "reply", reply: { id: "item2", title: data.item2.substring(0, 20) } },
                data.item3 && { type: "reply", reply: { id: "item3", title: data.item3.substring(0, 20) } },
                data.item4 && { type: "reply", reply: { id: "item4", title: data.item4.substring(0, 20) } }
              ].filter((b: any) => b)
            }
          }
        };
      }

      // 3. SYSTEM LOGIC (API, CONDITION, DELAY)
      else if (currentNode.type === "delay") {
        const delayMs = (data.delay || 1) * 1000;
        console.log(`⏱️ [Engine] Delaying for ${data.delay} seconds...`);
        await new Promise(res => setTimeout(res, delayMs));
      }
      else if (currentNode.type === "api") {
        try {
          const apiUrl = replaceVariables(data.url, vars);
          console.log(`🌐 [Engine] Calling API: ${apiUrl}`);
          const response = await axios({ method: data.method || "GET", url: apiUrl });
          if (data.saveTo) {
            vars[data.saveTo] = response.data; // Store JSON response
            await query("UPDATE leads SET variables=$1 WHERE id=$2", [JSON.stringify(vars), leadId]);
          }
        } catch (err: any) {
          console.error(`⚠️ API Node Failed (${currentNode.id}):`, err.message);
        }
      }
      else if (currentNode.type === "condition") {
        const { variable, operator, value } = data;
        const userVal = vars[variable] || "";
        let isTrue = false;
        
        if (operator === "equals") isTrue = String(userVal).toLowerCase() === String(value).toLowerCase();
        else if (operator === "contains") isTrue = String(userVal).toLowerCase().includes(String(value).toLowerCase());
        else if (operator === "exists") isTrue = userVal !== undefined && userVal !== "";

        const matchedHandle = isTrue ? "true" : "false";
        console.log(`🔀 [Engine] Condition evaluated as ${isTrue.toString().toUpperCase()}`);
        
        // Custom Routing for Condition Nodes
        let edge = edges.find((e: any) => String(e.source) === String(currentNode.id) && String(e.sourceHandle) === matchedHandle);
        currentNode = nodes.find((n: any) => String(n.id) === String(edge?.target));
        await query("UPDATE leads SET last_node_id = $1 WHERE id = $2", [currentNode?.id || null, leadId]);
        continue; // Skip the standard routing block below
      }

      // Execute standard Message Output
      if (payload) {
        await axios({
          method: "POST", url: `https://graph.facebook.com/v18.0/${phoneId}/messages`,
          data: payload, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
        }).catch(console.error);
        if (io) io.emit("whatsapp_message", { from: botName, text: payload.text?.body || "[Interactive Element]", isBot: true });
      }

      // Update position
      await query("UPDATE leads SET last_node_id = $1 WHERE id = $2", [currentNode.id, leadId]);

      // Handle Input Waits
      if (isInputNode(currentNode.type)) {
        clearUserTimers(from);
        const reminderDelay = (data.reminderDelay || 60) * 1000;
        const timeoutDelay = (data.timeout || 300) * 1000;

        activeReminders.set(from, setTimeout(async () => {
          await axios({
            method: "POST", url: `https://graph.facebook.com/v18.0/${phoneId}/messages`,
            data: { messaging_product: "whatsapp", to: from, type: "text", text: { body: data.reminderText || "Are you still there?" } },
            headers: { Authorization: `Bearer ${token}` }
          });

          activeTimeouts.set(from, setTimeout(async () => {
            const timeoutEdge = edges.find((e: any) => String(e.source) === String(currentNode.id) && String(e.sourceHandle) === "timeout");
            const timeoutNode = nodes.find((n: any) => String(n.id) === String(timeoutEdge?.target));
            if (timeoutNode) {
                executeFlowFromNode(timeoutNode, leadId, from, nodes, edges, phoneId, token, botName, io);
            } else {
                await query("UPDATE leads SET last_node_id = NULL, retry_count = 0 WHERE id = $1", [leadId]);
                await axios({
                  method: "POST", url: `https://graph.facebook.com/v18.0/${phoneId}/messages`,
                  data: { messaging_product: "whatsapp", to: from, type: "text", text: { body: data.timeoutFallback || "Session closed due to inactivity." } },
                  headers: { Authorization: `Bearer ${token}` }
                });
            }
          }, timeoutDelay));
        }, reminderDelay));
        break; 
      }

      // Standard Edge Routing
      let edge = edges.find((e: any) => String(e.source) === String(currentNode.id) && (!e.sourceHandle || e.sourceHandle === "response"));
      currentNode = nodes.find((n: any) => String(n.id) === String(edge?.target));
    }
  } catch (err: any) {
    console.error("Execute Flow Error:", err.message);
  } finally {
    processingLocks.delete(from);
  }
};

/* ============================
    MESSAGE INTAKE (Webhooks)
============================ */
export const processIncomingMessage = async (from: string, waName: string, incomingText: string, buttonId: string, io: any) => {
  try {
    const text = (incomingText || "").toLowerCase().trim();
    const token = getActiveToken();

    // 1. FETCH LEAD STATUS FIRST
    const leadCheck = await query("SELECT * FROM leads WHERE wa_number = $1", [from]);
    let lead = leadCheck.rows[0];

    // 2. HUMAN MODE PROTECTION
    // If a human is active, the bot MUST stay silent unless the user types 'reset'
    if (lead?.human_active && text !== "reset") {
      console.log(`👤 [Engine] Human is active for ${from}. Bot is ignoring input.`);
      return; 
    }

    // ESCAPE HATCH (End/Stop)
    if (ESCAPE_KEYWORDS.includes(text)) {
      clearUserTimers(from);
      // Hard reset everything to defaults
      await query(`
        UPDATE leads 
        SET last_node_id = NULL, 
            variables = '{}', 
            retry_count = 0, 
            human_active = false, 
            bot_active = true 
        WHERE wa_number = $1`, [from]);
        
      await axios({
        method: "POST", url: `https://graph.facebook.com/v18.0/${DEFAULT_PHONE_ID}/messages`,
        data: { messaging_product: "whatsapp", to: from, type: "text", text: { body: "Conversation ended. Type 'hi' to start again." } },
        headers: { Authorization: `Bearer ${token}` }
      });
      return; 
    }

    const activeBotsRes = await query("SELECT * FROM bots WHERE status = 'active'");
    const activeBots = activeBotsRes.rows;
    if (!activeBots.length) return;

    clearUserTimers(from);

    // RESET LOGIC
    if (text === "reset") {
       console.log(`🔄 [Engine] Resetting session for ${from}`);
       await query("UPDATE leads SET last_node_id = NULL, retry_count = 0, human_active = false, bot_active = true WHERE wa_number = $1", [from]);
       // If it was a reset, we stop here so the user can send a new trigger keyword
       return; 
    }

    // ... (rest of your existing bot matching logic)


    let targetBot = null;
    let flowData = null;
    let triggerNode = null;
    const isReset = RESET_KEYWORDS.includes(text);

    if (buttonId?.startsWith("select_bot_")) {
      const selectedId = buttonId.replace("select_bot_", "");
      await query("UPDATE leads SET bot_id = $1, last_node_id = NULL, retry_count = 0, human_active = false WHERE wa_number = $2", [selectedId, from]);
      return processIncomingMessage(from, waName, "start", "", io); 
    }

    if (lead?.bot_id && !isReset) targetBot = activeBots.find((b: any) => String(b.id) === String(lead.bot_id));

    if (!targetBot || isReset) {
      const matched = [];
      for (const b of activeBots) {
        const fRes = await query("SELECT flow_json FROM flows WHERE bot_id = $1", [b.id]);
        const flow = fRes.rows[0]?.flow_json || { nodes: [], edges: [] };
        const hasKwd = b.trigger_keywords?.split(",").map((k:string)=>k.trim().toLowerCase()).includes(text);
        const tNode = flow.nodes?.find((n:any) => n.type === "trigger" && n.data?.keywords?.split(",").map((k:string)=>k.trim().toLowerCase()).includes(text));

        if (hasKwd || tNode) matched.push({ bot: b, flow, tNode });
      }

      if (matched.length > 0) {
        targetBot = matched[0].bot;
        flowData = matched[0].flow;
        triggerNode = matched[0].tNode;
        if (lead) await query("UPDATE leads SET last_node_id = NULL, variables = '{}', human_active = false, bot_active = true, retry_count = 0 WHERE id = $1", [lead.id]);
      }
    }

    if (!targetBot) return;

    const leadRes = await query(
      `INSERT INTO leads(bot_id, wa_number, wa_name, variables, updated_at) 
       VALUES($1,$2,$3,'{}',NOW()) ON CONFLICT(wa_number) 
       DO UPDATE SET bot_id = $1, wa_name=$3, updated_at=NOW() RETURNING *`, 
      [targetBot.id, from, waName]
    );
    lead = leadRes.rows[0];

    if (!flowData) {
      const fRes = await query("SELECT flow_json FROM flows WHERE bot_id = $1", [targetBot.id]);
      flowData = fRes.rows[0]?.flow_json || { nodes: [], edges: [] };
    }

    const nodes = flowData.nodes || [];
    const edges = flowData.edges || [];
    let currentNode = null;

    if (lead.last_node_id && !isReset) {
      const lastNode = nodes.find((n: any) => String(n.id) === String(lead.last_node_id));
      
      if (lastNode && isInputNode(lastNode.type)) {
        let isValid = false;
        let matchedHandle = "response";

        if (lastNode.type === "input") {
            const type = lastNode.data.validation || "text";
            isValid = type === "regex" ? validators.regex(text, lastNode.data.regex) : (validators[type] ? validators[type](text) : true);
        } else {
            for (let i = 1; i <= 10; i++) {
                const itemText = lastNode.data[`item${i}`];
                if (itemText && (text === itemText.toLowerCase().trim() || buttonId === `item${i}`)) {
                    isValid = true;
                    matchedHandle = `item${i}`;
                    break;
                }
            }
        }

        if (!isValid) {
          const nextStep = await handleValidationError(lead, lastNode, from, DEFAULT_PHONE_ID, token);
          if (nextStep === "stay") return;
          if (nextStep) {
             const targetNode = nodes.find((n:any) => String(n.id) === String(nextStep));
             if (targetNode) return executeFlowFromNode(targetNode, lead.id, from, nodes, edges, DEFAULT_PHONE_ID, token, targetBot.name, io);
          }
          return;
        }

        await query("UPDATE leads SET retry_count = 0 WHERE id = $1", [lead.id]);
        
        if (lastNode.type === "input") {
            const v = lead.variables || {}; 
            v[lastNode.data?.variable || "input"] = incomingText; 
            await query("UPDATE leads SET variables=$1 WHERE id=$2", [JSON.stringify(v), lead.id]);
        }
        
        const edge = edges.find((e: any) => String(e.source) === String(lastNode.id) && String(e.sourceHandle) === matchedHandle);
        if (edge) {
            currentNode = nodes.find((n: any) => String(n.id) === String(edge.target));
        } else {
            await query("UPDATE leads SET last_node_id = NULL WHERE id=$1", [lead.id]);
            return;
        }
      }
    }

    if (!currentNode && (triggerNode || isReset || !lead.last_node_id)) {
      const entryNode = triggerNode || nodes.find((n: any) => n.type === "start");
      if (entryNode) {
        const edge = edges.find((e: any) => String(e.source) === String(entryNode.id));
        if (edge) currentNode = nodes.find((n: any) => String(n.id) === String(edge.target));
        else if (entryNode.type !== "start" && entryNode.type !== "trigger") currentNode = entryNode;
      }
    }

    if (currentNode) await executeFlowFromNode(currentNode, lead.id, from, nodes, edges, DEFAULT_PHONE_ID, token, targetBot.name, io);

  } catch (err: any) { 
      console.error("🔥 [Critical] ENGINE ERROR:", err.message); 
  }
};