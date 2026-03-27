import { query } from "../config/db";

export async function listAssignmentsForConversation(conversationId: string) {
  const res = await query(
    `SELECT
       a.*,
       agent.name AS agent_name,
       agent.email AS agent_email,
       assigned_by_user.name AS assigned_by_name,
       assigned_by_user.email AS assigned_by_email,
       released_by_user.name AS released_by_name,
       released_by_user.email AS released_by_email
     FROM assignments a
     JOIN users agent ON agent.id = a.agent_id
     LEFT JOIN users assigned_by_user ON assigned_by_user.id = a.assigned_by
     LEFT JOIN users released_by_user ON released_by_user.id = a.released_by
     WHERE a.conversation_id = $1
     ORDER BY a.assigned_at DESC, a.created_at DESC`,
    [conversationId]
  );

  return res.rows;
}

export async function closeActiveAssignment(
  conversationId: string,
  releasedBy: string,
  nextStatus: "released" | "reassigned",
  notes?: string | null
) {
  const res = await query(
    `UPDATE assignments
     SET status = $2,
         released_at = NOW(),
         released_by = $3,
         notes = COALESCE($4, notes),
         updated_at = NOW()
     WHERE conversation_id = $1
       AND status = 'active'
     RETURNING *`,
    [conversationId, nextStatus, releasedBy, notes || null]
  );

  return res.rows[0];
}

export async function createAssignment(input: {
  conversationId: string;
  agentId: string;
  assignedBy?: string | null;
  assignmentType: string;
  notes?: string | null;
}) {
  const res = await query(
    `INSERT INTO assignments
       (conversation_id, agent_id, assigned_by, assignment_type, status, notes)
     VALUES ($1, $2, $3, $4, 'active', $5)
     RETURNING *`,
    [
      input.conversationId,
      input.agentId,
      input.assignedBy || null,
      input.assignmentType,
      input.notes || null,
    ]
  );

  return res.rows[0];
}
