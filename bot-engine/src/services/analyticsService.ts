import { query } from "../adapters/dbAdapter";

export const logEvent = async (
  conversationId: string,
  botId: string,
  type: string,
  data: any
) => {

  await query(
    `
    INSERT INTO analytics_events
    (conversation_id, bot_id, event_type, event_payload)
    VALUES ($1,$2,$3,$4)
    `,
    [
      conversationId,
      botId,
      type,
      JSON.stringify(data)
    ]
  );

};
