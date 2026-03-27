import {
  closeAgentSessionsForUser,
  createAgentSession,
  listWorkspaceAgentPresence,
  touchAgentSessionsForUser,
  upsertAgentActivity,
} from "../models/agentPresenceModel";
import { findConversationById } from "../models/conversationModel";
import { assertWorkspaceMembership } from "./workspaceAccessService";
import {
  assertProjectContextAccess,
  resolveVisibleProjectIdsForWorkspace,
} from "./projectAccessService";

function isPresenceSchemaError(err: any) {
  return err?.code === "42P01" || err?.code === "42703";
}

export async function startAgentPresenceSession(userId: string, input?: {
  workspaceId?: string | null;
  projectId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    return await createAgentSession({
      userId,
      workspaceId: input?.workspaceId || null,
      projectId: input?.projectId || null,
      metadata: input?.metadata || {},
    });
  } catch (err) {
    if (!isPresenceSchemaError(err)) {
      throw err;
    }
    console.warn("Agent presence session skipped because presence schema is unavailable");
    return null;
  }
}

export async function touchAgentPresence(userId: string, input?: {
  workspaceId?: string | null;
  projectId?: string | null;
  lastAction?: string | null;
  activeChats?: number;
  metadata?: Record<string, unknown>;
}) {
  if (!input?.workspaceId) {
    try {
      await touchAgentSessionsForUser(userId, {
        workspaceId: null,
        projectId: input?.projectId || null,
        status: "online",
      });
    } catch (err) {
      if (!isPresenceSchemaError(err)) {
        throw err;
      }
      console.warn("Agent presence touch skipped because presence schema is unavailable");
    }
    return null;
  }

  try {
    await touchAgentSessionsForUser(userId, {
      workspaceId: input.workspaceId,
      projectId: input.projectId || null,
      status: "online",
    });

    return await upsertAgentActivity({
      userId,
      workspaceId: input.workspaceId,
      projectId: input.projectId || null,
      lastAction: input.lastAction || null,
      activeChats: input.activeChats || 0,
      metadata: input.metadata || {},
    });
  } catch (err) {
    if (!isPresenceSchemaError(err)) {
      throw err;
    }
    console.warn("Agent activity update skipped because presence schema is unavailable");
    return null;
  }
}

export async function stopAgentPresenceSession(userId: string) {
  try {
    return await closeAgentSessionsForUser(userId);
  } catch (err) {
    if (!isPresenceSchemaError(err)) {
      throw err;
    }
    console.warn("Agent presence logout skipped because presence schema is unavailable");
    return null;
  }
}

export async function listWorkspaceAgentPresenceService(
  workspaceId: string,
  userId: string,
  projectId?: string | null
) {
  await assertWorkspaceMembership(userId, workspaceId);
  if (projectId) {
    await assertProjectContextAccess(userId, projectId, workspaceId);
  }

  const visibleProjectIds = projectId
    ? null
    : await resolveVisibleProjectIdsForWorkspace(userId, workspaceId);

  return listWorkspaceAgentPresence(workspaceId, projectId || null, visibleProjectIds);
}

export async function touchAgentPresenceFromConversation(
  userId: string,
  conversationId: string,
  lastAction: string
) {
  const conversation = await findConversationById(conversationId);
  if (!conversation?.workspace_id) {
    return null;
  }

  return touchAgentPresence(userId, {
    workspaceId: conversation.workspace_id,
    projectId: conversation.project_id || null,
    lastAction,
    activeChats: conversation.assigned_to === userId ? 1 : 0,
    metadata: {
      conversationId,
    },
  });
}
