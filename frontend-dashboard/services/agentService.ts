import apiClient from "./apiClient";

export interface Ticket {
  id: string;
  bot_id: string;
  conversation_id: string;
  status: 'open' | 'pending' | 'closed';
  priority: 'low' | 'medium' | 'high';
  subject: string;
  created_at: string;
}

export const agentService = {
  getTickets: async (botId: string): Promise<Ticket[]> => {
    const res = await apiClient.get(`/chat/tickets/${botId}`);
    return res.data;
  },
  
  replyToTicket: async (ticketId: string, message: string) => {
    return await apiClient.post(`/chat/tickets/${ticketId}/reply`, { message });
  },

  closeTicket: async (ticketId: string) => {
    return await apiClient.post(`/chat/tickets/${ticketId}/close`);
  }
};
