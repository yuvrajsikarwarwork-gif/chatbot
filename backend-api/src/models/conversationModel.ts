import { query } from "../config/db";
import { upsertContactWithIdentity } from "../services/contactIdentityService";

type ConversationFilterInput = {
  workspaceId?: string | null;
  projectId?: string | null;
  botId?: string | null;
  campaignId?: string | null;
  channelId?: string | null;
  platform?: string | null;
  platformAccountId?: string | null;
  flowId?: string | null;
  listId?: string | null;
  agentId?: string | null;
  status?: string | null;
  search?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  visibleAgentId?: string | null;
  includeVisibleUnassigned?: boolean;
  allowedProjectIds?: string[] | null;
  allowedCampaignIds?: string[] | null;
  allowedPlatforms?: string[] | null;
  allowedChannelIds?: string[] | null;
};

type ConversationMessageInput = {
  text?: string | null;
  type?: string | null;
  templateName?: string | null;
  languageCode?: string | null;
  mediaUrl?: string | null;
  buttons?: Array<{ id: string; title: string }> | null;
};

export async function findConversation(
  botId: string,
  channel: string,
  externalId: string
) {
  const res = await query(
    `
    SELECT c.*
    FROM conversations c
    JOIN contacts ct ON c.contact_id = ct.id
    WHERE c.bot_id = $1
      AND c.channel = $2
      AND ct.platform_user_id = $3
    `,
    [botId, channel, externalId]
  );

  return res.rows[0];
}

export async function createConversation(
  botId: string,
  channel: string,
  externalId: string,
  contactName = "User"
) {
  const botRes = await query(
    `SELECT workspace_id, project_id
     FROM bots
     WHERE id = $1
     LIMIT 1`,
    [botId]
  );
  const workspaceId = botRes.rows[0]?.workspace_id || null;
  const projectId = botRes.rows[0]?.project_id || null;

  const contact = await upsertContactWithIdentity({
    botId,
    workspaceId,
    platform: channel,
    platformUserId: externalId,
    name: contactName,
    phone: channel === "whatsapp" ? externalId : null,
    email: channel === "email" ? externalId : null,
  });

  const res = await query(
    `
    INSERT INTO conversations
    (bot_id, workspace_id, project_id, contact_id, channel, platform, contact_name, contact_phone, status, variables)
    VALUES ($1, $2, $3, $4, $5, $5, $6, $7, 'active', '{}'::jsonb)
    ON CONFLICT (contact_id, channel)
    DO UPDATE SET
      updated_at = CURRENT_TIMESTAMP,
      contact_name = COALESCE(conversations.contact_name, EXCLUDED.contact_name),
      contact_phone = COALESCE(conversations.contact_phone, EXCLUDED.contact_phone)
    RETURNING *
    `,
    [botId, workspaceId, projectId, contact.id, channel, contact.name, contact.phone]
  );

  return res.rows[0];
}

const BASE_CONVERSATION_SELECT = `
  SELECT
    c.*,
    COALESCE(NULLIF(c.contact_name, ''), ct.name) AS display_name,
    COALESCE(NULLIF(c.contact_phone, ''), ct.phone, ct.platform_user_id) AS contact_phone_resolved,
    ct.platform_user_id AS external_id,
    b.name AS bot_name,
    cp.name AS campaign_name,
    cc.name AS channel_name,
    ep.name AS entry_point_name,
    f.flow_name,
    l.name AS list_name,
    pa.name AS platform_account_name,
    pa.account_id AS platform_account_external_id,
    pa.phone_number AS platform_account_phone_number,
    assigned.name AS assigned_to_name,
    unread.unread_count,
    inbound.last_inbound_at,
    outbound.last_outbound_at,
    latest.last_message_text,
    latest.last_message_type,
    latest.last_sender_type,
    GREATEST(
      COALESCE(c.last_message_at, c.created_at),
      COALESCE(latest.last_message_at, c.created_at),
      COALESCE(c.updated_at, c.created_at),
      c.created_at
    ) AS effective_last_message_at,
    CASE
      WHEN c.status = 'agent_pending' THEN 'pending'
      WHEN c.status = 'active' THEN 'bot'
      ELSE c.status
    END AS inbox_status
`;

const BASE_CONVERSATION_JOINS = `
  FROM conversations c
  JOIN contacts ct ON c.contact_id = ct.id
  JOIN bots b ON c.bot_id = b.id
  LEFT JOIN campaigns cp ON cp.id = c.campaign_id
  LEFT JOIN campaign_channels cc ON cc.id = c.channel_id
  LEFT JOIN entry_points ep ON ep.id = c.entry_point_id
  LEFT JOIN flows f ON f.id = c.flow_id
  LEFT JOIN lists l ON l.id = c.list_id
  LEFT JOIN platform_accounts pa ON pa.id = c.platform_account_id
  LEFT JOIN users assigned ON assigned.id = c.assigned_to
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::INTEGER AS unread_count
    FROM messages m
    WHERE m.conversation_id = c.id
      AND COALESCE(m.sender_type, m.sender, 'user') = 'user'
  ) unread ON true
  LEFT JOIN LATERAL (
    SELECT MAX(m.created_at) AS last_inbound_at
    FROM messages m
    WHERE m.conversation_id = c.id
      AND COALESCE(m.sender_type, m.sender, 'user') = 'user'
  ) inbound ON true
  LEFT JOIN LATERAL (
    SELECT MAX(m.created_at) AS last_outbound_at
    FROM messages m
    WHERE m.conversation_id = c.id
      AND COALESCE(m.sender_type, m.sender, 'user') IN ('bot', 'agent')
  ) outbound ON true
  LEFT JOIN LATERAL (
    SELECT
      m.created_at AS last_message_at,
      COALESCE(m.text, m.message, m.content ->> 'text') AS last_message_text,
      COALESCE(m.message_type, m.content ->> 'type', 'text') AS last_message_type,
      COALESCE(m.sender_type, m.sender, 'user') AS last_sender_type
    FROM messages m
    WHERE m.conversation_id = c.id
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT 1
  ) latest ON true
`;

function buildConversationFilterQuery(filters: ConversationFilterInput) {
  const clauses: string[] = [];
  const values: unknown[] = [];

  const add = (sql: string, value: unknown) => {
    values.push(value);
    clauses.push(sql.replace("?", `$${values.length}`));
  };

  if (filters.workspaceId) add("c.workspace_id = ?", filters.workspaceId);
  if (filters.projectId) add("c.project_id = ?", filters.projectId);
  if (filters.botId) add("c.bot_id = ?", filters.botId);
  if (filters.campaignId) add("c.campaign_id = ?", filters.campaignId);
  if (filters.channelId) add("c.channel_id = ?", filters.channelId);
  if (filters.platform) add("COALESCE(c.platform, c.channel) = ?", filters.platform);
  if (filters.platformAccountId) add("c.platform_account_id = ?", filters.platformAccountId);
  if (filters.flowId) add("c.flow_id = ?", filters.flowId);
  if (filters.listId) add("c.list_id = ?", filters.listId);
  if (filters.agentId === "unassigned") {
    clauses.push("c.assigned_to IS NULL");
  } else if (filters.agentId) {
    add("c.assigned_to = ?", filters.agentId);
  }
  if (filters.status) {
    if (filters.status === "pending") {
      clauses.push("c.status = 'agent_pending'");
    } else if (filters.status === "bot") {
      clauses.push("c.status = 'active'");
    } else {
      add("c.status = ?", filters.status);
    }
  }
  if (filters.dateFrom) add("COALESCE(c.last_message_at, c.updated_at, c.created_at) >= ?", filters.dateFrom);
  if (filters.dateTo) add("COALESCE(c.last_message_at, c.updated_at, c.created_at) <= ?", filters.dateTo);
  if (filters.search) {
    add(
      "(COALESCE(c.contact_name, ct.name, '') ILIKE ? OR COALESCE(c.contact_phone, ct.phone, ct.platform_user_id, '') ILIKE ? OR COALESCE(cp.name, '') ILIKE ?)",
      `%${filters.search}%`
    );
    const searchRef = `$${values.length}`;
    clauses[clauses.length - 1] = `(COALESCE(c.contact_name, ct.name, '') ILIKE ${searchRef} OR COALESCE(c.contact_phone, ct.phone, ct.platform_user_id, '') ILIKE ${searchRef} OR COALESCE(cp.name, '') ILIKE ${searchRef})`;
  }
  if (filters.visibleAgentId) {
    if (filters.includeVisibleUnassigned) {
      add("(c.assigned_to = ? OR c.assigned_to IS NULL)", filters.visibleAgentId);
    } else {
      add("c.assigned_to = ?", filters.visibleAgentId);
    }
  }
  if (Array.isArray(filters.allowedProjectIds) && filters.allowedProjectIds.length > 0) {
    add("c.project_id = ANY(?)", filters.allowedProjectIds);
  } else if (Array.isArray(filters.allowedProjectIds)) {
    clauses.push("1 = 0");
  }
  if (Array.isArray(filters.allowedCampaignIds) && filters.allowedCampaignIds.length > 0) {
    add("c.campaign_id = ANY(?)", filters.allowedCampaignIds);
  } else if (Array.isArray(filters.allowedCampaignIds)) {
    clauses.push("1 = 0");
  }
  if (Array.isArray(filters.allowedPlatforms) && filters.allowedPlatforms.length > 0) {
    add("LOWER(COALESCE(c.platform, c.channel, '')) = ANY(?)", filters.allowedPlatforms);
  } else if (Array.isArray(filters.allowedPlatforms)) {
    clauses.push("1 = 0");
  }
  if (Array.isArray(filters.allowedChannelIds) && filters.allowedChannelIds.length > 0) {
    add("c.channel_id = ANY(?)", filters.allowedChannelIds);
  } else if (Array.isArray(filters.allowedChannelIds)) {
    clauses.push("1 = 0");
  }

  return {
    whereSql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    values,
  };
}

export async function findConversationsByBot(botId: string) {
  const { whereSql, values } = buildConversationFilterQuery({ botId });
  const res = await query(
    `
    ${BASE_CONVERSATION_SELECT}
    ${BASE_CONVERSATION_JOINS}
    ${whereSql}
    ORDER BY GREATEST(
      COALESCE(c.last_message_at, c.created_at),
      COALESCE(latest.last_message_at, c.created_at),
      COALESCE(c.updated_at, c.created_at),
      c.created_at
    ) DESC
    `,
    values
  );

  return res.rows;
}

export async function findConversationsByFilters(filters: ConversationFilterInput) {
  const { whereSql, values } = buildConversationFilterQuery(filters);
  const res = await query(
    `
    ${BASE_CONVERSATION_SELECT}
    ${BASE_CONVERSATION_JOINS}
    ${whereSql}
    ORDER BY GREATEST(
      COALESCE(c.last_message_at, c.created_at),
      COALESCE(latest.last_message_at, c.created_at),
      COALESCE(c.updated_at, c.created_at),
      c.created_at
    ) DESC
    `,
    values
  );

  return res.rows;
}

export async function findConversationById(id: string) {
  const res = await query(
    `
    ${BASE_CONVERSATION_SELECT}
    ${BASE_CONVERSATION_JOINS}
    WHERE c.id = $1
    `,
    [id]
  );

  return res.rows[0];
}

export async function findConversationByIdAndProject(id: string, projectId: string) {
  const res = await query(
    `
    ${BASE_CONVERSATION_SELECT}
    ${BASE_CONVERSATION_JOINS}
    WHERE c.id = $1
      AND c.project_id = $2
    `,
    [id, projectId]
  );

  return res.rows[0];
}

export async function findConversationDetailById(id: string) {
  const res = await query(
    `
    SELECT
      c.*,
      COALESCE(NULLIF(c.contact_name, ''), ct.name) AS display_name,
      COALESCE(NULLIF(c.contact_phone, ''), ct.phone, ct.platform_user_id) AS contact_phone_resolved,
      ct.email AS contact_email,
      ct.platform_user_id AS external_id,
      b.name AS bot_name,
      cp.name AS campaign_name,
      cc.name AS channel_name,
      ep.name AS entry_point_name,
      f.flow_name,
      l.name AS list_name,
      pa.name AS platform_account_name,
      pa.account_id AS platform_account_external_id,
      pa.phone_number AS platform_account_phone_number,
      assigned.name AS assigned_to_name,
      unread.unread_count,
      inbound.last_inbound_at,
      outbound.last_outbound_at,
      COALESCE(tags.tags, '[]'::jsonb) AS tags,
      COALESCE(notes.notes, '[]'::jsonb) AS notes
    FROM conversations c
    JOIN contacts ct ON c.contact_id = ct.id
    JOIN bots b ON c.bot_id = b.id
    LEFT JOIN campaigns cp ON cp.id = c.campaign_id
    LEFT JOIN campaign_channels cc ON cc.id = c.channel_id
    LEFT JOIN entry_points ep ON ep.id = c.entry_point_id
    LEFT JOIN flows f ON f.id = c.flow_id
    LEFT JOIN lists l ON l.id = c.list_id
    LEFT JOIN platform_accounts pa ON pa.id = c.platform_account_id
    LEFT JOIN users assigned ON assigned.id = c.assigned_to
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::INTEGER AS unread_count
      FROM messages m
      WHERE m.conversation_id = c.id
        AND COALESCE(m.sender_type, m.sender, 'user') = 'user'
    ) unread ON true
    LEFT JOIN LATERAL (
      SELECT MAX(m.created_at) AS last_inbound_at
      FROM messages m
      WHERE m.conversation_id = c.id
        AND COALESCE(m.sender_type, m.sender, 'user') = 'user'
    ) inbound ON true
    LEFT JOIN LATERAL (
      SELECT MAX(m.created_at) AS last_outbound_at
      FROM messages m
      WHERE m.conversation_id = c.id
        AND COALESCE(m.sender_type, m.sender, 'user') IN ('bot', 'agent')
    ) outbound ON true
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(
        jsonb_build_object(
          'tag', t.tag,
          'created_at', t.created_at,
          'created_by', t.created_by
        )
        ORDER BY t.created_at DESC, t.tag ASC
      ) AS tags
      FROM conversation_tags t
      WHERE t.conversation_id = c.id
    ) tags ON true
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', n.id,
          'note', n.note,
          'author_user_id', n.author_user_id,
          'author_name', u.name,
          'author_email', u.email,
          'created_at', n.created_at,
          'updated_at', n.updated_at
        )
        ORDER BY n.created_at DESC
      ) AS notes
      FROM conversation_notes n
      LEFT JOIN users u ON u.id = n.author_user_id
      WHERE n.conversation_id = c.id
    ) notes ON true
    WHERE c.id = $1
    `,
    [id]
  );

  return res.rows[0];
}

export async function findMessagesForConversation(conversationId: string) {
  const res = await query(
    `
    SELECT
      m.*,
      COALESCE(m.sender_type, m.sender, 'user') AS sender_type_resolved,
      COALESCE(m.message_type, m.content ->> 'type', 'text') AS message_type_resolved,
      COALESCE(m.text, m.message, m.content ->> 'text') AS text_resolved
    FROM messages m
    WHERE m.conversation_id = $1
    ORDER BY m.created_at ASC, m.id ASC
    `,
    [conversationId]
  );

  return res.rows;
}

export async function updateConversationStatusById(id: string, status: string) {
  const res = await query(
    `UPDATE conversations
     SET status = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING *`,
    [status, id]
  );

  return res.rows[0];
}

export async function updateConversationAssignmentById(input: {
  id: string;
  assignedTo: string | null;
  assignmentMode?: string | null;
  status?: string | null;
}) {
  const res = await query(
    `UPDATE conversations
     SET assigned_to = $2,
         assigned_at = CASE WHEN $2 IS NULL THEN NULL ELSE NOW() END,
         assignment_mode = $3,
         status = COALESCE($4, status),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [input.id, input.assignedTo, input.assignmentMode || null, input.status || null]
  );

  return res.rows[0];
}

export async function updateConversationListById(id: string, listId: string | null) {
  const res = await query(
    `UPDATE conversations
     SET list_id = $2,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, listId]
  );

  return res.rows[0];
}

export async function mergeConversationContextById(
  id: string,
  contextPatch: Record<string, unknown>
) {
  const res = await query(
    `UPDATE conversations
     SET context_json = COALESCE(context_json, '{}'::jsonb) || $2::jsonb,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, JSON.stringify(contextPatch)]
  );

  return res.rows[0];
}

export async function touchConversationAfterReply(
  id: string,
  input: ConversationMessageInput
) {
  const res = await query(
    `UPDATE conversations
     SET status = 'agent_pending',
         last_message_at = NOW(),
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, workspace_id, status, assigned_to, last_message_at`,
    [id]
  );

  return {
    conversation: res.rows[0],
    messageSummary: {
      type: input.type || "text",
      text: input.text || null,
      templateName: input.templateName || null,
      languageCode: input.languageCode || null,
      mediaUrl: input.mediaUrl || null,
      buttons: input.buttons || null,
    },
  };
}
