import { query } from "../adapters/dbAdapter";

export const getState = async (
  botId: string,
  conversationId: string
) => {
  const res = await query(
    `
    SELECT s.*
    FROM conversation_state s
    JOIN conversations c ON s.conversation_id = c.id
    WHERE s.conversation_id = $1 AND c.bot_id = $2
    LIMIT 1
    `,
    [conversationId, botId]
  );

  return res.rows[0] || null;
};

export const createState = async (
  botId: string,
  conversationId: string,
  state: any
) => {
  await query(
    `
    INSERT INTO conversation_state (
      bot_id,
      conversation_id,
      current_node_id,
      variables,
      waiting_input,
      waiting_agent,
      input_variable,
      updated_at
    )
    VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, NOW())
    `,
    [
      botId,
      conversationId,
      state.current_node_id || null,
      JSON.stringify(state.variables || {}),
      Boolean(state.waiting_input),
      Boolean(state.waiting_agent),
      state.input_variable || null,
    ]
  );
};

export const updateState = async (
  conversationId: string,
  state: any
) => {
  await query(
    `
    UPDATE conversation_state
    SET
      current_node_id = $1,
      variables = $2::jsonb,
      waiting_input = $3,
      waiting_agent = $4,
      input_variable = $5,
      status = $6,
      updated_at = NOW()
    WHERE conversation_id = $7
    `,
    [
      state.current_node_id || null,
      JSON.stringify(state.variables || {}),
      Boolean(state.waiting_input),
      Boolean(state.waiting_agent),
      state.input_variable || null,
      state.status || null,
      conversationId,
    ]
  );
};
