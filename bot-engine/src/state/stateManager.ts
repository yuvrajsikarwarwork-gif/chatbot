import { getStateByConversationId } from "../repositories/stateRepo";
import { query } from "../adapters/dbAdapter";
import { ConversationState } from "./stateTypes";

export const loadState = async (
  conversationId: string,
  botId: string
): Promise<ConversationState> => {

  let state = await getStateByConversationId(
    conversationId
  );

  if (!state) {
    const newState: ConversationState = {
      bot_id: botId,
      conversation_id: conversationId,
      current_node_id: null,
      variables: {},
      waiting_input: false,
      waiting_agent: false,
      input_variable: null,
      status: null
    };

    await query(
      `
      INSERT INTO conversation_state
      (bot_id, conversation_id, current_node_id, variables, waiting_input, waiting_agent, input_variable, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      `,
      [
        newState.bot_id,
        newState.conversation_id,
        newState.current_node_id,
        JSON.stringify(newState.variables),
        newState.waiting_input,
        newState.waiting_agent,
        newState.input_variable,
        newState.status
      ]
    );

    return newState;
  }

  return {
    bot_id: state.bot_id || botId,
    conversation_id: state.conversation_id,
    current_node_id: state.current_node_id ?? state.current_node ?? null,
    variables: state.variables || state.context_variables || {},
    waiting_input: Boolean(state.waiting_input),
    waiting_agent: Boolean(state.waiting_agent),
    input_variable: state.input_variable || null,
    status: state.status || null
  };
};

export const saveState = async (
  state: ConversationState
) => {

  await query(
    `
    UPDATE conversation_state
    SET
      current_node_id = $1,
      variables = $2,
      waiting_input = $3,
      waiting_agent = $4,
      input_variable = $5,
      status = $6
    WHERE conversation_id = $7
    `,
    [
      state.current_node_id,
      JSON.stringify(state.variables),
      state.waiting_input,
      state.waiting_agent,
      state.input_variable,
      state.status || null,
      state.conversation_id
    ]
  );

};
