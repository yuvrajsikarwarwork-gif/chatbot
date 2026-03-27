// src/services/analyticsService.ts

import {
  countMessagesByBot,
  countConversationsByBot,
  getEventsByBot,
} from "../models/analyticsModel";

import { findBotById } from "../models/botModel";
import { findWorkspacesByUser } from "../models/workspaceModel";
import {
  getWorkspaceAnalyticsEvents,
  getWorkspaceAnalyticsOverview,
} from "./runtimeAnalyticsService";
import { listWorkspaceAgentPresenceService } from "./agentPresenceService";
import {
  assertProjectContextAccess,
  resolveVisibleProjectIdsForWorkspace,
} from "./projectAccessService";
import {
  assertBotWorkspacePermission,
  assertWorkspaceMembership,
  WORKSPACE_PERMISSIONS,
} from "./workspaceAccessService";

export async function getBotStatsService(
  botId: string,
  userId: string
) {
  await assertBotWorkspacePermission(userId, botId, WORKSPACE_PERMISSIONS.createFlow);

  const messages = await countMessagesByBot(
    botId
  );

  const conversations =
    await countConversationsByBot(botId);

  return {
    messages,
    conversations,
  };
}

export async function getEventsService(
  botId: string,
  userId: string
) {
  await assertBotWorkspacePermission(userId, botId, WORKSPACE_PERMISSIONS.createFlow);

  return getEventsByBot(botId);
}

export async function getWorkspaceStatsService(
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

  return getWorkspaceAnalyticsOverview(userId, workspaceId, projectId, visibleProjectIds);
}

export async function getWorkspaceEventsService(
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

  return getWorkspaceAnalyticsEvents(userId, workspaceId, projectId, visibleProjectIds);
}

export async function getWorkspaceUsageSummaryService(userId: string) {
  const workspaces = await findWorkspacesByUser(userId);

  const summary = workspaces.reduce(
    (acc, workspace: any) => {
      acc.totalWorkspaces += 1;
      acc.totalCampaigns += Number(workspace.campaign_count || 0);
      acc.totalPlatformAccounts += Number(workspace.platform_account_count || 0);

      if (workspace.status === "active") acc.activeWorkspaces += 1;
      if (workspace.status === "locked") acc.lockedWorkspaces += 1;

      const maxCampaigns = Number(workspace.max_campaigns || 0);
      const maxNumbers = Number(workspace.max_numbers || 0);

      acc.campaignCapacity += maxCampaigns;
      acc.platformAccountCapacity += maxNumbers;

      const subscriptionStatus = String(
        workspace.subscription_status || "unknown"
      ).toLowerCase();
      acc.subscriptionBreakdown[subscriptionStatus] =
        (acc.subscriptionBreakdown[subscriptionStatus] || 0) + 1;

      return acc;
    },
    {
      totalWorkspaces: 0,
      activeWorkspaces: 0,
      lockedWorkspaces: 0,
      totalCampaigns: 0,
      campaignCapacity: 0,
      totalPlatformAccounts: 0,
      platformAccountCapacity: 0,
      subscriptionBreakdown: {} as Record<string, number>,
    }
  );

  return {
    summary,
    workspaces,
  };
}

export async function getWorkspaceAgentPresenceService(
  workspaceId: string,
  userId: string,
  projectId?: string | null
) {
  return listWorkspaceAgentPresenceService(workspaceId, userId, projectId);
}
