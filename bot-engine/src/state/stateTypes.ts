export interface ConversationState {
  bot_id?: string;
  conversation_id: string;
  current_node_id: string | null;
  variables: Record<string, any>;
  bookmarked_state?: Record<string, any> | null;
  waiting_input: boolean;
  waiting_agent: boolean;
  input_variable: string | null;
  status?: string | null;

  // runtime only
  last_user_message?: string;
}
