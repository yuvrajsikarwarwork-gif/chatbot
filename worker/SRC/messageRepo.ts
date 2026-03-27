import { query } from "../adapters/dbAdapter";

const toMessageText = (message: any) =>
  message.text ||
  message.content?.text ||
  message.templateName ||
  null;

export const saveMessage = async (
  botId: string,
  conversationId: string,
  message: any
) => {
  await query(
    `
    INSERT INTO messages (
      bot_id,
      conversation_id,
      sender,
      message_type,
      text,
      content,
      created_at
    )
    VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW())
    `,
    [
      botId,
      conversationId,
      message.sender,
      message.type || "text",
      toMessageText(message),
      JSON.stringify(message),
    ]
  );
};

export const saveManyMessages = async (
  botId: string,
  conversationId: string,
  messages: any[]
) => {
  for (const msg of messages) {
    await saveMessage(botId, conversationId, {
      sender: msg.sender || "bot",
      ...msg,
    });
  }
};
