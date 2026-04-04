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
import { NodeOptimizationService } from "./NodeOptimizationService";
import { RegistryAnalyticsService } from "./registryAnalyticsService";
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
  projectId?: string | null,
  sinceHours?: number | null
) {
  await assertWorkspaceMembership(userId, workspaceId);
  if (projectId) {
    await assertProjectContextAccess(userId, projectId, workspaceId);
  }

  const visibleProjectIds = projectId
    ? null
    : await resolveVisibleProjectIdsForWorkspace(userId, workspaceId);

  return getWorkspaceAnalyticsOverview(userId, workspaceId, projectId, visibleProjectIds, sinceHours);
}

export async function getWorkspaceEventsService(
  workspaceId: string,
  userId: string,
  projectId?: string | null,
  sinceHours?: number | null
) {
  await assertWorkspaceMembership(userId, workspaceId);
  if (projectId) {
    await assertProjectContextAccess(userId, projectId, workspaceId);
  }

  const visibleProjectIds = projectId
    ? null
    : await resolveVisibleProjectIdsForWorkspace(userId, workspaceId);

  return getWorkspaceAnalyticsEvents(userId, workspaceId, projectId, visibleProjectIds, sinceHours);
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

export async function getWorkspaceRegistryDropoffReportService(
  workspaceId: string,
  userId: string,
  eventType?: string | null,
  limit?: number | null,
  sinceHours?: number | null,
  days?: number | null,
  startDate?: string | null
) {
  await assertWorkspaceMembership(userId, workspaceId);
  const normalizedEventType = String(eventType || "").trim().toUpperCase();
  const params: {
    workspaceId: string;
    eventType?: "TRIGGER_MATCH" | "LEGACY_FALLBACK_MATCH" | "ERROR_HANDLED" | "OVERRIDE_EXECUTED" | "ANY";
    limit?: number;
    sinceHours?: number;
    days?: number;
    startDate?: string;
  } = { workspaceId };

  if (normalizedEventType) {
    params.eventType = normalizedEventType as any;
  }

  if (typeof limit === "number" && Number.isFinite(limit)) {
    params.limit = limit;
  }

  if (typeof sinceHours === "number" && Number.isFinite(sinceHours)) {
    params.sinceHours = sinceHours;
  }

  if (typeof days === "number" && Number.isFinite(days)) {
    params.days = days;
  }

  if (typeof startDate === "string" && startDate.trim()) {
    params.startDate = startDate.trim();
  }

  return RegistryAnalyticsService.getDropoffReport(params);
}

export async function getWorkspaceRegistryKeywordPopularityService(
  workspaceId: string,
  userId: string,
  limit?: number | null,
  sinceHours?: number | null
) {
  await assertWorkspaceMembership(userId, workspaceId);

  const params: {
    workspaceId: string;
    limit?: number;
    sinceHours?: number;
  } = { workspaceId };

  if (typeof limit === "number" && Number.isFinite(limit)) {
    params.limit = limit;
  }

  if (typeof sinceHours === "number" && Number.isFinite(sinceHours)) {
    params.sinceHours = sinceHours;
  }

  return RegistryAnalyticsService.getKeywordPopularity(params);
}

export async function getWorkspaceRegistryLegacyFallbackInspectorService(
  workspaceId: string,
  userId: string,
  limit?: number | null,
  sinceHours?: number | null,
  days?: number | null,
  startDate?: string | null
) {
  await assertWorkspaceMembership(userId, workspaceId);

  const params: {
    workspaceId: string;
    limit?: number;
    sinceHours?: number;
    days?: number;
    startDate?: string;
  } = { workspaceId };

  if (typeof limit === "number" && Number.isFinite(limit)) {
    params.limit = limit;
  }

  if (typeof sinceHours === "number" && Number.isFinite(sinceHours)) {
    params.sinceHours = sinceHours;
  }

  if (typeof days === "number" && Number.isFinite(days)) {
    params.days = days;
  }

  if (typeof startDate === "string" && startDate.trim()) {
    params.startDate = startDate.trim();
  }

  return RegistryAnalyticsService.getLegacyFallbackKeywordReport(params);
}

export async function getWorkspaceRegistryUnpublishedFlowSummaryService(
  workspaceId: string,
  userId: string,
  limit?: number | null
) {
  await assertWorkspaceMembership(userId, workspaceId);

  const params: {
    workspaceId: string;
    limit?: number;
  } = { workspaceId };

  if (typeof limit === "number" && Number.isFinite(limit)) {
    params.limit = limit;
  }

  return RegistryAnalyticsService.getUnpublishedFlowSummary(params);
}

export async function getWorkspaceNodeOptimizationReportService(
  workspaceId: string,
  userId: string,
  limit?: number | null,
  sinceHours?: number | null,
  days?: number | null,
  startDate?: string | null
) {
  await assertWorkspaceMembership(userId, workspaceId);

  const params: {
    workspaceId: string;
    limit?: number;
    sinceHours?: number;
    days?: number;
    startDate?: string;
  } = { workspaceId };

  if (typeof limit === "number" && Number.isFinite(limit)) {
    params.limit = limit;
  }

  if (typeof sinceHours === "number" && Number.isFinite(sinceHours)) {
    params.sinceHours = sinceHours;
  }

  if (typeof days === "number" && Number.isFinite(days)) {
    params.days = days;
  }

  if (typeof startDate === "string" && startDate.trim()) {
    params.startDate = startDate.trim();
  }

  return NodeOptimizationService.getUnderperformingNodes(params);
}

export async function getWorkspaceOptimizationPerformanceService(
  workspaceId: string,
  userId: string,
  days?: number | null
) {
  await assertWorkspaceMembership(userId, workspaceId);

  return NodeOptimizationService.getPerformanceTimeSeries({
    workspaceId,
    ...(typeof days === "number" && Number.isFinite(days) ? { days } : {}),
  });
}
