import { query } from "../config/db";

type JsonRecord = Record<string, any>;

const parseJsonObject = (value: any): JsonRecord => {
  if (!value) {
    return {};
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  return value && typeof value === "object" ? value : {};
};

export const patchConversationContext = async (input: {
  conversationId: string;
  set?: JsonRecord;
  removeKeys?: string[];
}) => {
  const res = await query(
    `SELECT context_json
     FROM conversations
     WHERE id = $1
     LIMIT 1`,
    [input.conversationId]
  );

  const currentContext = parseJsonObject(res.rows[0]?.context_json);
  const nextContext = {
    ...currentContext,
    ...(input.set || {}),
  };

  for (const key of input.removeKeys || []) {
    delete nextContext[key];
  }

  await query(
    `UPDATE conversations
     SET context_json = $2::jsonb,
         updated_at = NOW()
     WHERE id = $1`,
    [input.conversationId, JSON.stringify(nextContext)]
  );

  return nextContext;
};
