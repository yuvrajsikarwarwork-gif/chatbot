import apiClient from "./apiClient";

export interface Conversation {
  id: string;
  bot_id: string;
  user_identifier?: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender: string;
  message?: string;
  content?: any;
  isBot?: boolean;
}

export const messageService = {
  getConversations: async (botId: string): Promise<Conversation[]> => {
    const res = await apiClient.get("/conversations", {
      params: { botId },
    });
    return res.data;
  },

  getMessages: async (conversationId: string): Promise<Message[]> => {
    const res = await apiClient.get(`/conversations/${conversationId}/messages`);
    return res.data;
  },

  sendWhatsApp: async (to: string, text: string) => {
    throw new Error(
      `messageService.sendWhatsApp is deprecated. Use a conversation-bound reply path instead. Attempted target: ${to} (${text.length} chars).`
    );
  },
};
