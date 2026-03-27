import { getMessageById } from "../repositories/messageRepo";
import { getConversationById } from "../repositories/conversationRepo";
import { getBotById } from "../repositories/botRepo";
import { getFlowByBotId } from "../repositories/flowRepo";
import { getStateByConversationId } from "../repositories/stateRepo";

export const loadContext = async (
  botId: string,
  conversationId: string,
  messageId?: string
) => {
  const message = messageId
    ? await getMessageById(messageId)
    : null;

  const conversation =
    await getConversationById(conversationId);

  const bot = await getBotById(botId);

  const flow = await getFlowByBotId(botId);

  const state =
    await getStateByConversationId(conversationId);

  return {
    message,
    conversation,
    bot,
    flow,
    state
  };
};
