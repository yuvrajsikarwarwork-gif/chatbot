import { query } from "../config/db";
import { findConversationSettingsByWorkspace } from "../models/conversationSettingsModel";
import {
  closeActiveAssignment,
  createAssignment,
  listAssignmentsForConversation,
} from "../models/conversationAssignmentModel";
import {
  findConversationById,
  findConversationDetailById,
  updateConversationAssignmentById,
} from "../models/conversationModel";
import { createConversationEvent } from "../models/conversationEventModel";
import {
  assertWorkspaceMembership,
  getMembershipAgentSkills,
  getMembershipAgentScope,
} from "./workspaceAccessService";
import {
  assertProjectContextAccess,
  assertProjectMembership,
  resolveProjectAccess,
  resolveVisibleProjectIdsForWorkspace,
} from "./projectAccessService";
import { logAuditSafe } from "./auditLogService";

const ASSIGNABLE_ROLES = new Set(["workspace_admin", "workspace_owner", "admin", "agent"]);

type AssignmentCapacitySummary = {
  user_id: string;
  role: string;
  name: string | null;
  email: string | null;
  open_assignment_count: number;
  pending_assignment_count: number;
  capacity_limit: number;
  capacity_remaining: number;
  capacity_ratio: number;
  capacity_status: "available" | "near_capacity" | "at_capacity";
  last_assigned_at: string | null;
  has_project_access: boolean;
  scope_matches: boolean;
  eligible_for_assignment: boolean;
  recommended: boolean;
  agent_skills: string[];
  required_skills: string[];
  matched_skill_count: number;
  skill_match: boolean;
};

async function assertConversationAccess(conversationId: string, userId: string) {
  const conversation = await findConversationById(conversationId);
  if (!conversation) {
    throw { status: 404, message: "Conversation not found" };
  }

  if (!conversation.workspace_id) {
    throw { status: 400, message: "Conversation assignments require a workspace conversation" };
  }

  if (conversation.project_id) {
    await assertProjectMembership(userId, conversation.project_id);
  }

  const membership = await assertWorkspaceMembership(userId, conversation.workspace_id);
  if (!membership) {
    throw { status: 403, message: "Forbidden" };
  }

  return { conversation, membership };
}

async function getAssignableMembership(workspaceId: string, agentId: string) {
  const res = await query(
    `SELECT
       wm.*,
       COALESCE(wm.permissions_json, '{}'::jsonb) ||
       jsonb_build_object(
         'agent_scope',
         COALESCE(scope.agent_scope_json, '{}'::jsonb)
       ) AS permissions_json,
       u.name,
       u.email,
       u.role AS global_role
     FROM workspace_memberships wm
     JOIN users u ON u.id = wm.user_id
     LEFT JOIN LATERAL (
       SELECT jsonb_build_object(
         'projectIds', COALESCE(to_jsonb(ARRAY_REMOVE(ARRAY_AGG(DISTINCT project_id::text), NULL)), '[]'::jsonb),
         'campaignIds', COALESCE(to_jsonb(ARRAY_REMOVE(ARRAY_AGG(DISTINCT campaign_id::text), NULL)), '[]'::jsonb),
         'platforms', COALESCE(to_jsonb(ARRAY_REMOVE(ARRAY_AGG(DISTINCT LOWER(platform)), NULL)), '[]'::jsonb),
         'channelIds', COALESCE(to_jsonb(ARRAY_REMOVE(ARRAY_AGG(DISTINCT channel_id::text), NULL)), '[]'::jsonb)
       ) AS agent_scope_json
       FROM agent_scope s
       WHERE s.workspace_id = wm.workspace_id
         AND s.user_id = wm.user_id
     ) scope ON true
     WHERE wm.workspace_id = $1
       AND wm.user_id = $2
     LIMIT 1`,
    [workspaceId, agentId]
  );

  const membership = res.rows[0];
  if (!membership || membership.status !== "active" || !ASSIGNABLE_ROLES.has(String(membership.role))) {
    throw { status: 400, message: "Assigned user must be an active workspace agent, admin, or owner" };
  }

  return membership;
}

function getConversationPlatform(conversation: any) {
  return String(conversation.platform || conversation.channel || "").trim().toLowerCase();
}

function matchesConversationScope(
  conversation: any,
  membership: { permissions_json?: Record<string, unknown> | null } | null | undefined
) {
  const scope = getMembershipAgentScope(membership);
  if (scope.projectIds.length > 0 && !scope.projectIds.includes(String(conversation.project_id || ""))) {
    return false;
  }
  if (scope.campaignIds.length > 0 && !scope.campaignIds.includes(String(conversation.campaign_id || ""))) {
    return false;
  }
  if (scope.platforms.length > 0 && !scope.platforms.includes(getConversationPlatform(conversation))) {
    return false;
  }
  if (scope.channelIds.length > 0 && !scope.channelIds.includes(String(conversation.channel_id || ""))) {
    return false;
  }
  return true;
}

async function getRequiredSkillsForConversation(conversation: any) {
  const skills = new Set<string>();
  const addSkill = (value: unknown) => {
    const normalized = String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_");
    if (normalized) {
      skills.add(normalized);
    }
  };

  addSkill(conversation.platform || conversation.channel);
  addSkill(conversation.inbox_status || conversation.status);
  addSkill(conversation.campaign_name);
  addSkill(conversation.list_name);
  addSkill(conversation.entry_point_name);

  const context = conversation.context_json && typeof conversation.context_json === "object"
    ? conversation.context_json
    : {};
  const contextSkills = Array.isArray((context as Record<string, unknown>).requiredSkills)
    ? ((context as Record<string, unknown>).requiredSkills as unknown[])
    : Array.isArray((context as Record<string, unknown>).required_skills)
      ? ((context as Record<string, unknown>).required_skills as unknown[])
      : [];
  contextSkills.forEach(addSkill);

  if (conversation.id) {
    const tagRes = await query(
      `SELECT tag
       FROM conversation_tags
       WHERE conversation_id = $1`,
      [conversation.id]
    );
    for (const row of tagRes.rows) {
      addSkill(row.tag);
    }
  }

  return Array.from(skills);
}

async function assertAssignableProjectAccess(projectId: string | null | undefined, agentId: string) {
  if (!projectId) {
    return;
  }

  const access = await resolveProjectAccess(agentId, projectId);
  if (!access) {
    throw { status: 400, message: "Assigned user must have access to the same project" };
  }
}

async function assertAssignableConversationScope(
  conversation: any,
  membership: { permissions_json?: Record<string, unknown> | null } | null | undefined
) {
  if (!matchesConversationScope(conversation, membership)) {
    throw {
      status: 400,
      message: "Assigned user does not have platform, campaign, or channel access for this conversation",
    };
  }
}

function deriveCapacityStatus(openAssignmentCount: number, maxOpenChats: number) {
  if (openAssignmentCount >= maxOpenChats) {
    return "at_capacity" as const;
  }
  if (openAssignmentCount / Math.max(1, maxOpenChats) >= 0.8) {
    return "near_capacity" as const;
  }
  return "available" as const;
}

async function listAssignmentCapacityCandidates(input: {
  workspaceId: string;
  projectId?: string | null;
  visibleProjectIds?: string[] | null;
  conversation?: any | null;
  maxOpenChats: number;
  defaultAgentId?: string | null;
}) {
  const requiredSkills = input.conversation
    ? await getRequiredSkillsForConversation(input.conversation)
    : [];

  const candidateParams: Array<string | string[] | null> = [
    input.workspaceId,
    input.defaultAgentId || null,
  ];
  let conversationScopeClause = "";

  if (input.projectId) {
    candidateParams.push(input.projectId);
    conversationScopeClause = `AND c.project_id = $${candidateParams.length}`;
  } else if (Array.isArray(input.visibleProjectIds)) {
    if (input.visibleProjectIds.length === 0) {
      return [] as AssignmentCapacitySummary[];
    }

    candidateParams.push(input.visibleProjectIds);
    conversationScopeClause = `AND c.project_id = ANY($${candidateParams.length})`;
  }

  const candidateRes = await query(
    `SELECT
       wm.user_id,
       wm.role,
       COALESCE(wm.permissions_json, '{}'::jsonb) ||
       jsonb_build_object(
         'agent_scope',
         COALESCE(scope.agent_scope_json, '{}'::jsonb)
       ) AS permissions_json,
       u.name,
       u.email,
       COUNT(a.id) FILTER (
         WHERE a.status = 'active'
           AND c.workspace_id = wm.workspace_id
           ${conversationScopeClause}
       )::int AS open_assignment_count,
       COUNT(a.id) FILTER (
         WHERE a.status = 'active'
           AND c.workspace_id = wm.workspace_id
           ${conversationScopeClause}
           AND c.status = 'agent_pending'
       )::int AS pending_assignment_count,
       MAX(a.assigned_at) FILTER (WHERE a.status IN ('active', 'released', 'reassigned')) AS last_assigned_at
     FROM workspace_memberships wm
     JOIN users u ON u.id = wm.user_id
     LEFT JOIN LATERAL (
       SELECT jsonb_build_object(
         'projectIds', COALESCE(to_jsonb(ARRAY_REMOVE(ARRAY_AGG(DISTINCT project_id::text), NULL)), '[]'::jsonb),
         'campaignIds', COALESCE(to_jsonb(ARRAY_REMOVE(ARRAY_AGG(DISTINCT campaign_id::text), NULL)), '[]'::jsonb),
         'platforms', COALESCE(to_jsonb(ARRAY_REMOVE(ARRAY_AGG(DISTINCT LOWER(platform)), NULL)), '[]'::jsonb),
         'channelIds', COALESCE(to_jsonb(ARRAY_REMOVE(ARRAY_AGG(DISTINCT channel_id::text), NULL)), '[]'::jsonb)
       ) AS agent_scope_json
       FROM agent_scope s
       WHERE s.workspace_id = wm.workspace_id
         AND s.user_id = wm.user_id
     ) scope ON true
     LEFT JOIN assignments a
       ON a.agent_id = wm.user_id
     LEFT JOIN conversations c
       ON c.id = a.conversation_id
      AND c.workspace_id = wm.workspace_id
     WHERE wm.workspace_id = $1
       AND wm.status = 'active'
       AND wm.role IN ('workspace_admin', 'workspace_owner', 'admin', 'editor', 'user', 'agent')
     GROUP BY wm.user_id, wm.role, wm.permissions_json, scope.agent_scope_json, u.name, u.email
     ORDER BY
       CASE WHEN wm.user_id = $2 THEN 0 ELSE 1 END,
       COUNT(a.id) FILTER (
         WHERE a.status = 'active'
           AND c.workspace_id = wm.workspace_id
           ${conversationScopeClause}
       ) ASC,
       MAX(a.assigned_at) FILTER (WHERE a.status IN ('active', 'released', 'reassigned')) ASC NULLS FIRST,
       wm.user_id ASC`,
    candidateParams
  );

  const rows = await Promise.all(
    candidateRes.rows.map(async (row) => {
      const hasProjectAccess = input.projectId
        ? Boolean(await resolveProjectAccess(String(row.user_id), input.projectId))
        : true;
      const scopeMatches = input.conversation
        ? matchesConversationScope(input.conversation, row)
        : true;
      const agentSkills = getMembershipAgentSkills(row);
      const matchedSkillCount =
        requiredSkills.length === 0
          ? 0
          : requiredSkills.filter((skill) => agentSkills.includes(skill)).length;
      const skillMatch = requiredSkills.length === 0 || matchedSkillCount > 0;
      const hasAssignableRole = ASSIGNABLE_ROLES.has(String(row.role));
      const openAssignmentCount = Number(row.open_assignment_count || 0);
      const pendingAssignmentCount = Number(row.pending_assignment_count || 0);
      const capacityRemaining = Math.max(0, input.maxOpenChats - openAssignmentCount);
      const eligibleForAssignment =
        hasAssignableRole &&
        hasProjectAccess &&
        scopeMatches &&
        skillMatch &&
        openAssignmentCount < input.maxOpenChats;

      const candidate: AssignmentCapacitySummary = {
        user_id: String(row.user_id),
        role: String(row.role),
        name: row.name || null,
        email: row.email || null,
        open_assignment_count: openAssignmentCount,
        pending_assignment_count: pendingAssignmentCount,
        capacity_limit: input.maxOpenChats,
        capacity_remaining: capacityRemaining,
        capacity_ratio: Number((openAssignmentCount / Math.max(1, input.maxOpenChats)).toFixed(2)),
        capacity_status: deriveCapacityStatus(openAssignmentCount, input.maxOpenChats),
        last_assigned_at: row.last_assigned_at || null,
        has_project_access: hasProjectAccess,
        scope_matches: scopeMatches,
        eligible_for_assignment: eligibleForAssignment,
        recommended: false,
        agent_skills: agentSkills,
        required_skills: requiredSkills,
        matched_skill_count: matchedSkillCount,
        skill_match: skillMatch,
      };

      return candidate;
    })
  );

  const recommendedCandidate =
    rows.find((row) => row.eligible_for_assignment && input.defaultAgentId && row.user_id === input.defaultAgentId) ||
    [...rows]
      .filter((row) => row.eligible_for_assignment)
      .sort((left, right) => {
        if (right.matched_skill_count !== left.matched_skill_count) {
          return right.matched_skill_count - left.matched_skill_count;
        }
        if (left.open_assignment_count !== right.open_assignment_count) {
          return left.open_assignment_count - right.open_assignment_count;
        }
        if (left.pending_assignment_count !== right.pending_assignment_count) {
          return left.pending_assignment_count - right.pending_assignment_count;
        }
        const leftAssigned = left.last_assigned_at ? new Date(left.last_assigned_at).getTime() : 0;
        const rightAssigned = right.last_assigned_at ? new Date(right.last_assigned_at).getTime() : 0;
        if (leftAssigned !== rightAssigned) {
          return leftAssigned - rightAssigned;
        }
        return left.user_id.localeCompare(right.user_id);
      })[0];

  return rows.map((row) => ({
    ...row,
    recommended: Boolean(recommendedCandidate && recommendedCandidate.user_id === row.user_id),
  }));
}

async function assertAssignmentActionAllowed(input: {
  actorUserId: string;
  actorRole: string;
  workspaceId: string;
  targetAgentId: string | null;
}) {
  if (["workspace_owner", "admin"].includes(input.actorRole)) {
    return;
  }

  if (input.actorRole !== "agent") {
    throw { status: 403, message: "Forbidden" };
  }

  const settings = await findConversationSettingsByWorkspace(input.workspaceId);
  if (!settings?.allow_agent_takeover) {
    throw { status: 403, message: "Agent takeover is disabled for this workspace" };
  }

  if (input.targetAgentId && input.targetAgentId !== input.actorUserId) {
    throw { status: 403, message: "Agents can only assign conversations to themselves" };
  }
}

async function logAssignmentEvent(input: {
  conversationId: string;
  workspaceId: string;
  actorUserId: string;
  eventType: string;
  payload: Record<string, unknown>;
}) {
  try {
    await createConversationEvent({
      conversationId: input.conversationId,
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      eventType: input.eventType,
      eventPayload: input.payload,
    });
  } catch (err) {
    console.warn("Assignment event logging skipped", err);
  }
}

export async function assignConversationService(
  conversationId: string,
  payload: { agentId?: string; assignmentType?: string; notes?: string },
  userId: string
) {
  const { conversation, membership } = await assertConversationAccess(conversationId, userId);
  const agentId = String(payload.agentId || "").trim();
  if (!agentId) {
    throw { status: 400, message: "agentId is required" };
  }

  await assertAssignmentActionAllowed({
    actorUserId: userId,
    actorRole: String(membership.role),
    workspaceId: conversation.workspace_id,
    targetAgentId: agentId,
  });

  const targetMembership = await getAssignableMembership(conversation.workspace_id, agentId);
  await assertAssignableProjectAccess(conversation.project_id, agentId);
  await assertAssignableConversationScope(conversation, targetMembership);
  const assignmentType = String(payload.assignmentType || "manual").trim().toLowerCase();
  if (!["manual", "auto", "round_robin"].includes(assignmentType)) {
    throw { status: 400, message: "assignmentType is invalid" };
  }

  await closeActiveAssignment(conversationId, userId, "reassigned", payload.notes || null);
  await createAssignment({
    conversationId,
    agentId,
    assignedBy: userId,
    assignmentType,
    notes: payload.notes || null,
  });

  await updateConversationAssignmentById({
    id: conversationId,
    assignedTo: agentId,
    assignmentMode: assignmentType,
    status: "agent_pending",
  });

  await logAssignmentEvent({
    conversationId,
    workspaceId: conversation.workspace_id,
    actorUserId: userId,
    eventType: "assignment_created",
    payload: {
      agentId,
      assignmentType,
      targetRole: targetMembership.role,
      notes: payload.notes || null,
    },
  });
  await logAuditSafe({
    userId,
    workspaceId: conversation.workspace_id,
    projectId: conversation.project_id,
    action: "assign",
    entity: "assignment",
    entityId: conversationId,
    newData: {
      agentId,
      assignmentType,
      notes: payload.notes || null,
    },
  });

  return findConversationDetailById(conversationId);
}

export async function reassignConversationService(
  conversationId: string,
  payload: { agentId?: string; assignmentType?: string; notes?: string },
  userId: string
) {
  return assignConversationService(conversationId, payload, userId);
}

export async function releaseConversationService(
  conversationId: string,
  payload: { notes?: string } | undefined,
  userId: string
) {
  const { conversation, membership } = await assertConversationAccess(conversationId, userId);

  await assertAssignmentActionAllowed({
    actorUserId: userId,
    actorRole: String(membership.role),
    workspaceId: conversation.workspace_id,
    targetAgentId: null,
  });

  if (String(membership.role) === "agent" && conversation.assigned_to && conversation.assigned_to !== userId) {
    throw { status: 403, message: "Agents can only release their own conversations" };
  }

  await closeActiveAssignment(conversationId, userId, "released", payload?.notes || null);
  await updateConversationAssignmentById({
    id: conversationId,
    assignedTo: null,
    assignmentMode: null,
    status: "active",
  });

  await logAssignmentEvent({
    conversationId,
    workspaceId: conversation.workspace_id,
    actorUserId: userId,
    eventType: "assignment_released",
    payload: {
      notes: payload?.notes || null,
    },
  });
  await logAuditSafe({
    userId,
    workspaceId: conversation.workspace_id,
    projectId: conversation.project_id,
    action: "release",
    entity: "assignment",
    entityId: conversationId,
    oldData: {
      assignedTo: conversation.assigned_to,
    },
    newData: {
      assignedTo: null,
      notes: payload?.notes || null,
    },
  });

  return findConversationDetailById(conversationId);
}

export async function listConversationAssignmentsService(conversationId: string, userId: string) {
  await assertConversationAccess(conversationId, userId);
  return listAssignmentsForConversation(conversationId);
}

export async function listAssignmentCapacityService(
  input: {
    workspaceId?: string | null;
    projectId?: string | null;
    conversationId?: string | null;
  },
  userId: string
) {
  const workspaceId = String(input.workspaceId || "").trim();
  if (!workspaceId) {
    throw { status: 400, message: "workspaceId is required" };
  }

  await assertWorkspaceMembership(userId, workspaceId);

  let conversation = null;
  if (input.conversationId) {
    const accessResult = await assertConversationAccess(String(input.conversationId), userId);
    conversation = accessResult.conversation;
  }

  const settings = await findConversationSettingsByWorkspace(workspaceId);
  const maxOpenChats = Math.max(1, Number(settings?.max_open_chats || 25));
  const defaultAgentId = settings?.default_agent || null;
  const requestedProjectId = String(input.projectId || "").trim() || null;
  if (requestedProjectId) {
    await assertProjectContextAccess(userId, requestedProjectId, workspaceId);
  }

  const projectId = String(requestedProjectId || conversation?.project_id || "").trim() || null;
  const visibleProjectIds =
    projectId || conversation?.project_id
      ? null
      : await resolveVisibleProjectIdsForWorkspace(userId, workspaceId);

  const candidates = await listAssignmentCapacityCandidates({
    workspaceId,
    projectId,
    visibleProjectIds,
    conversation,
    maxOpenChats,
    defaultAgentId,
  });

  return {
    maxOpenChats,
    defaultAgentId,
    conversationId: conversation?.id || null,
    requiredSkills: candidates[0]?.required_skills || [],
    summary: {
      totalCandidates: candidates.length,
      eligibleCandidates: candidates.filter((candidate) => candidate.eligible_for_assignment).length,
      availableCandidates: candidates.filter((candidate) => candidate.capacity_status === "available").length,
      nearCapacityCandidates: candidates.filter((candidate) => candidate.capacity_status === "near_capacity").length,
      atCapacityCandidates: candidates.filter((candidate) => candidate.capacity_status === "at_capacity").length,
      skillMatchedCandidates: candidates.filter((candidate) => candidate.skill_match).length,
    },
    candidates,
  };
}

export async function autoAssignConversationIfEligible(conversationId: string) {
  const conversation = await findConversationById(conversationId);
  if (!conversation?.workspace_id || conversation.assigned_to) {
    return findConversationDetailById(conversationId);
  }

  const settings = await findConversationSettingsByWorkspace(conversation.workspace_id);
  if (!settings?.auto_assign || !settings.allow_agent_takeover) {
    return findConversationDetailById(conversationId);
  }

  const maxOpenChats = Math.max(1, Number(settings.max_open_chats || 25));
  const defaultAgentId = settings.default_agent || null;

  const candidates = await listAssignmentCapacityCandidates({
    workspaceId: conversation.workspace_id,
    projectId: conversation.project_id,
    conversation,
    maxOpenChats,
    defaultAgentId,
  });

  const candidate = candidates.find((row) => row.recommended) || candidates.find((row) => row.eligible_for_assignment);

  if (!candidate) {
    return findConversationDetailById(conversationId);
  }

  await createAssignment({
    conversationId,
    agentId: candidate.user_id,
    assignedBy: null,
    assignmentType: defaultAgentId && candidate.user_id === defaultAgentId ? "auto" : "round_robin",
    notes: "Auto-assigned by workspace conversation settings",
  });

  await updateConversationAssignmentById({
    id: conversationId,
    assignedTo: candidate.user_id,
    assignmentMode: defaultAgentId && candidate.user_id === defaultAgentId ? "auto" : "round_robin",
    status: "agent_pending",
  });

  await logAssignmentEvent({
    conversationId,
    workspaceId: conversation.workspace_id,
    actorUserId: candidate.user_id,
    eventType: "assignment_auto_created",
    payload: {
      agentId: candidate.user_id,
      strategy:
        defaultAgentId && candidate.user_id === defaultAgentId
          ? "default_agent"
          : "balanced_lowest_load_recent_assignment",
    },
  });

  return findConversationDetailById(conversationId);
}

export async function applyConversationWorkspacePolicies(conversationId: string) {
  return autoAssignConversationIfEligible(conversationId);
}
