import { Request, Response } from "express";
import { ProcessRequest, ProcessResponse } from "../types/engineTypes";
import { loadContext } from "../services/contextManager";
import { loadState, saveState } from "../state/stateManager";
import { executeFlow } from "../executors/flowExecutor";
import { logEvent } from "../services/analyticsService";

export const processMessage = async (req: Request, res: Response) => {
  try {
    const body = req.body as ProcessRequest;

    // Load active conversation and bot context
    const ctx = await loadContext(
      body.bot_id,
      body.conversation_id,
      body.message_id
    );
    
    await logEvent(
      body.conversation_id,
      body.bot_id,
      "message_received",
      { message_id: body.message_id }
    );

    const state = await loadState(body.conversation_id);

    // Provide the raw message to the executor (for inputs/conditions)
    state.last_user_message = ctx.message.message || ctx.message.text || "";

    // 1. Check for global escape hatches or agent mode before processing flow
    if (state.status === 'agent_pending' || state.waiting_agent) {
      return res.json({
        status: "ok",
        replies: [], // Bot stays silent while agent is active
        waitingInput: false,
        waitingAgent: true
      });
    }

    // 2. Execute the Flow Logic
    const replies = await executeFlow(ctx.flow, state);

    // 3. Persist the updated state (variables, node_id, waiting flags)
    await saveState(state);

    // 4. Return standard response to the main backend messageRouter
    const response: ProcessResponse = {
      status: "ok",
      replies,
      waitingInput: !!state.waiting_input,
      waitingAgent: !!state.waiting_agent
    };

    res.json(response);

  } catch (err: any) {
    console.error("[Engine] Execution Error:", err.message);

    res.status(500).json({
      status: "error",
      replies: [],
      waitingInput: false,
      waitingAgent: false
    });
  }
};