import {
  findCampaignContextByEntry,
  findDefaultCampaignContext,
} from "../models/campaignModel";
import { normalizePlatform } from "../utils/platform";

export interface ResolvedCampaignContext {
  userId: string | null;
  workspaceId: string | null;
  projectId: string | null;
  campaignId: string | null;
  campaignName: string | null;
  channelId: string | null;
  channelName: string | null;
  entryPointId: string | null;
  entryName: string | null;
  entryKey: string | null;
  flowId: string | null;
  platform: string;
  platformAccountId: string | null;
  listId: string | null;
  entryMetadata: Record<string, unknown>;
}

function normalizeContext(record: any, platform: string): ResolvedCampaignContext {
  return {
    userId: record?.user_id || null,
    workspaceId: record?.workspace_id || null,
    projectId: record?.project_id || null,
    campaignId: record?.campaign_id || null,
    campaignName: record?.campaign_name || null,
    channelId: record?.channel_id || null,
    channelName: record?.channel_name || null,
    entryPointId: record?.entry_point_id || null,
    entryName: record?.entry_name || null,
    entryKey: record?.entry_key || null,
    flowId: record?.flow_id || null,
    platform: record?.platform || platform,
    platformAccountId: record?.platform_account_id || null,
    listId: record?.list_id || null,
    entryMetadata:
      record?.entry_metadata && typeof record.entry_metadata === "object"
        ? record.entry_metadata
        : {},
  };
}

export async function resolveCampaignContext(
  botId: string,
  platform: string,
  entryKey?: string | null
) {
  const normalizedPlatform = normalizePlatform(platform);
  const byEntry = await findCampaignContextByEntry(
    botId,
    normalizedPlatform,
    entryKey
  );
  if (byEntry) {
    return normalizeContext(byEntry, normalizedPlatform);
  }

  const fallback = await findDefaultCampaignContext(botId, normalizedPlatform);
  if (fallback) {
    return normalizeContext(fallback, normalizedPlatform);
  }

  return normalizeContext(null, normalizedPlatform);
}
