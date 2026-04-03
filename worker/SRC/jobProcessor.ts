// worker/src/jobProcessor.ts

import {
  processMessage,
  processAI,
} from "./engineClient";

import {
  saveManyMessages,
} from "./messageRepo";

import {
  getState,
  updateState,
  createState,
} from "./stateRepo";

import {
  logEvent,
} from "./analyticsRepo";
import path from "path";

const { sendWaitingNodeReminder, handleWaitingNodeTimeout } = require(
  path.resolve(process.cwd(), "../backend-api/dist/services/flowEngine")
);


export const processJob = async (
  job: any
) => {
  const type = job.job_type || job.type;
  const payload = job.payload || job.payload_json;

  if (!payload) {
    const err: any = new Error(
      "Invalid payload"
    );
    err.fatal = true;
    throw err;
  }

  switch (type) {
    case "process_message":
      return handleProcessMessage(
        payload
      );

    case "ai_response":
      return handleAIResponse(
        payload
      );

    case "send_response":
      return handleSendResponse(
        payload
      );

    case "analytics_event":
      return handleAnalytics(
        payload
      );

    case "agent_handoff":
      return handleAgentHandoff(
        payload
      );

    case "flow_wait_reminder":
      await sendWaitingNodeReminder({
        conversationId: payload.conversationId,
        waitingNodeId: payload.waitingNodeId,
        reminderText: payload.reminderText,
        io: (global as any).io,
      });
      break;

    case "flow_wait_timeout":
      await handleWaitingNodeTimeout({
        conversationId: payload.conversationId,
        botId: payload.botId,
        platformUserId: payload.platformUserId,
        waitingNodeId: payload.waitingNodeId,
        channel: payload.channel,
        timeoutFallback: payload.timeoutFallback,
        io: (global as any).io,
      });
      break;

    default: {
      const err: any = new Error(
        "Unknown job type"
      );
      err.fatal = true;
      throw err;
    }
  }
};


const handleProcessMessage =
  async (payload: any) => {
    const {
      conversationId,
      botId,
      message,
    } = payload;


    // ✅ Scoped to botId for multi-tenancy safety
    let state = await getState(
      botId,
      conversationId
    );

    if (!state) {
      await createState(
        botId,
        conversationId,
        {}
      );

      state = {
        variables: {},
        waiting_input: false,
        waiting_agent: false,
        input_variable: null,
        current_node_id: null,
      };
    }


    const engineRes =
      await processMessage({
        bot_id: botId,
        conversation_id: conversationId,
        message_id: payload.messageId || payload.message_id,
        message,
      });


    if (
      engineRes.replies &&
      engineRes.replies.length
    ) {
      await saveManyMessages(
        botId,
        conversationId,
        engineRes.replies
      );
    }


    if (engineRes.state) {
      await updateState(
        conversationId,
        engineRes.state
      );
    }


    await logEvent({
      botId, // ✅ Scoped log
      conversationId,
      type: "process_message",
    });
  };


const handleAIResponse =
  async (payload: any) => {
    const {
      conversationId,
      botId,
      prompt,
    } = payload;


    // ✅ Scoped to botId for multi-tenancy safety
    const state =
      await getState(
        botId,
        conversationId
      );


    const engineRes =
      await processAI({
        bot_id: botId,
        conversation_id: conversationId,
        message: {
          text: prompt,
        },
        message_id: payload.messageId || payload.message_id,
        prompt,
      });


    if (
      engineRes.replies
    ) {
      await saveManyMessages(
        botId,
        conversationId,
        engineRes.replies
      );
    }


    if (
      engineRes.state
    ) {
      await updateState(
        conversationId,
        engineRes.state
      );
    }


    await logEvent({
      botId, // ✅ Scoped log
      conversationId,
      type: "ai_response",
    });
  };


const handleSendResponse =
  async (payload: any) => {
    if (
      payload.messages
    ) {
      await saveManyMessages(
        payload.botId,
        payload.conversationId,
        payload.messages
      );
    }

    await logEvent({
      botId: payload.botId, // ✅ Added botId from payload
      type:
        "send_response",
    });
  };


const handleAnalytics =
  async (payload: any) => {
    await logEvent(payload);
  };


const handleAgentHandoff =
  async (payload: any) => {
    await logEvent({
      botId: payload.botId, // ✅ Added botId from payload
      type:
        "agent_handoff",
      data: payload,
    });
  };
