import { query } from "../adapters/dbAdapter";
import { logEvent } from "../services/analyticsService";

// Helper to inject {{variables}} into message text
const replaceVariables = (text: string, variables: any) => {
  if (!text) return "";
  return text.replace(/{{(\w+)}}/g, (_, key) => {
    return variables && variables[key] !== undefined ? variables[key] : `{{${key}}}`;
  });
};

export const executeFlow = async (flow: any, state: any) => {
  if (!flow || !flow.flow_json) return [];

  const flowJson = typeof flow.flow_json === "string" ? JSON.parse(flow.flow_json) : flow.flow_json;
  const nodes = flowJson.nodes || [];
  const edges = flowJson.edges || [];

  // Fallback to finding 'start' or 'trigger' node if no specific current_node_id exists
  let currentNodeId = state.current_node_id || flowJson.startNode || nodes.find((n: any) => n.type === 'start' || n.type === 'trigger')?.id;

  const replies: any[] = [];
  const vars = state.variables || {};

  if (state.status === "agent_pending" || state.waiting_agent) return replies;

  let steps = 0;
  const MAX_STEPS = 25; // Prevent infinite loops

  while (steps < MAX_STEPS && currentNodeId) {
    const node = nodes.find((n: any) => String(n.id) === String(currentNodeId));
    if (!node) break;

    await logEvent(state.conversation_id, flow.bot_id, "node_execute", { nodeId: node.id, type: node.type });

    // ---------- MESSAGING NODES ----------
    if (node.type === "message" || node.type === "msg_text") {
      replies.push({
        type: "text",
        text: replaceVariables(node.data.text || node.data.label || "", vars)
      });
    }

    if (node.type === "send_template") {
      replies.push({
        type: "template",
        templateName: node.data.templateName,
        languageCode: node.data.language || "en_US",
        text: replaceVariables(node.data.text || "", vars)
      });
    }

    if (node.type === "msg_media") {
      replies.push({
        type: "media",
        mediaUrl: node.data.media_url,
        text: replaceVariables(node.data.text || "", vars)
      });
    }

    if (node.type === "menu_button" || node.type === "menu_list") {
      const buttons = [];
      for (let i = 1; i <= 10; i++) {
        if (node.data[`item${i}`]) {
          buttons.push({ id: `item${i}`, title: replaceVariables(node.data[`item${i}`], vars).substring(0, 20) });
        }
      }
      replies.push({
        type: "interactive",
        text: replaceVariables(node.data.text || "Choose an option:", vars),
        buttons: buttons
      });
      
      // Stop execution and wait for user reply
      state.waiting_input = true;
      state.current_node_id = currentNodeId;
      break;
    }

    // ---------- LOGIC & DATA NODES ----------
    if (node.type === "input") {
      if (state.waiting_input) {
        // User replied, save the response
        const varName = state.input_variable || node.data.variable || "last_input";
        vars[varName] = state.last_user_message;
        
        state.waiting_input = false;
        state.input_variable = null;
      } else {
        // First time hitting input node, send the prompt and wait
        if (node.data.text) {
          replies.push({ type: "text", text: replaceVariables(node.data.text, vars) });
        }
        state.waiting_input = true;
        state.input_variable = node.data.variable;
        state.current_node_id = currentNodeId;
        break;
      }
    }

    if (node.type === "action" || node.type === "save") {
      const varName = node.data.variable;
      const val = node.data.value || node.data.leadField;
      if (varName) vars[varName] = val;
    }

    if (node.type === "condition") {
      const variable = node.data.variable;
      const value = String(node.data.value).toLowerCase();
      const operator = node.data.operator || "equals";
      const currentValue = String(vars[variable] || "").toLowerCase();

      let result = false;
      if (operator === "equals") result = currentValue === value;
      if (operator === "not_equals") result = currentValue !== value;
      if (operator === "contains") result = currentValue.includes(value);
      if (operator === "exists") result = vars[variable] !== undefined && vars[variable] !== "";
      if (operator === "gt") result = Number(vars[variable]) > Number(node.data.value);
      if (operator === "lt") result = Number(vars[variable]) < Number(node.data.value);

      const matchedHandle = result ? "true" : "false";
      
      // Support both React Flow (source/target) and custom (from/to) edge formats
      const edge = edges.find((e: any) => 
        (String(e.source) === String(currentNodeId) || String(e.from) === String(currentNodeId)) && 
        (String(e.sourceHandle) === matchedHandle || String(e.label) === matchedHandle)
      );

      if (!edge) break;
      currentNodeId = edge.target || edge.to;
      steps++;
      continue;
    }

    // ---------- STATE & SYSTEM NODES ----------
    if (node.type === "handoff" || node.type === "assign_agent") {
      state.waiting_agent = true;
      state.status = "agent_pending";

      await query(
        `INSERT INTO agent_tickets (conversation_id, bot_id, status) VALUES ($1,$2,$3)`,
        [state.conversation_id, flow.bot_id, "open"]
      );

      await logEvent(state.conversation_id, flow.bot_id, "handoff", {});

      replies.push({ type: "text", text: replaceVariables(node.data.text || "Connecting you to an agent...", vars) });
      state.current_node_id = currentNodeId;
      break;
    }

    if (node.type === "end") {
      state.current_node_id = null;
      state.waiting_input = false;
      break;
    }

    // ---------- STANDARD EDGE TRAVERSAL ----------
    // Find next node via default response handles
    const edge = edges.find((e: any) => 
      (String(e.source) === String(currentNodeId) || String(e.from) === String(currentNodeId)) && 
      (!e.sourceHandle || e.sourceHandle === "response" || !e.label)
    );

    if (!edge) {
      // Flow reached a dead end naturally
      state.current_node_id = null;
      break; 
    }

    currentNodeId = edge.target || edge.to;
    steps++;
  }

  state.variables = vars;
  if (!state.waiting_input && !state.waiting_agent) {
    state.current_node_id = currentNodeId;
  }

  return replies;
};
