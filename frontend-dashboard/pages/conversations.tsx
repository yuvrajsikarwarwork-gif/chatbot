import React, { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import { useRouter } from "next/router";
import { Download, SlidersHorizontal, Shield, Lock } from "lucide-react";
import { Variable } from "lucide-react";

import PageAccessNotice from "../components/access/PageAccessNotice";
import ControlTowerShell from "../components/admin/ControlTowerShell";
import ChatWindow from "../components/chat/ChatWindow";
import ConversationList from "../components/chat/ConversationList";
import VariablesSidebar from "../components/simulator/VariablesSidebar";
import { API_URL } from "../config/apiConfig";
import DashboardLayout from "../components/layout/DashboardLayout";
import GlobalBackStrip from "../components/navigation/GlobalBackStrip";
import { useVisibility } from "../hooks/useVisibility";
import { botService } from "../services/botService";
import {
  conversationService,
  type AssignmentCapacityCandidate,
  type ConversationAssignment,
  type ConversationNote,
} from "../services/conversationService";
import { campaignService, type CampaignDetail } from "../services/campaignService";
import {
  platformAccountService,
  type PlatformAccount,
} from "../services/platformAccountService";
import {
  conversationSettingsService,
  type ConversationSettings,
} from "../services/conversationSettingsService";
import {
  workspaceMembershipService,
  type WorkspaceMember,
} from "../services/workspaceMembershipService";
import { useAuthStore } from "../store/authStore";
import { useBotStore } from "../store/botStore";

function getSocketServerUrl() {
  return API_URL.replace(/\/api\/?$/, "");
}

function buildContextForm(value: Record<string, unknown> | null | undefined) {
  const context = value && typeof value === "object" ? value : {};

  return {
    platform: String(context.platform || ""),
    userId: String(context.userId || ""),
    campaignId: String(context.campaignId || ""),
    campaignName: String(context.campaignName || ""),
    channelId: String(context.channelId || ""),
    channelName: String(context.channelName || ""),
    entryPointId: String(context.entryPointId || ""),
    entryName: String(context.entryName || ""),
    entryKey: String(context.entryKey || ""),
    flowId: String(context.flowId || ""),
    listId: String(context.listId || ""),
  };
}

function normalizeAgentScope(value: unknown) {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    projectIds: Array.isArray(source.projectIds) ? source.projectIds.map(String) : [],
    campaignIds: Array.isArray(source.campaignIds) ? source.campaignIds.map(String) : [],
    platforms: Array.isArray(source.platforms)
      ? source.platforms.map((item) => String(item).toLowerCase())
      : [],
    channelIds: Array.isArray(source.channelIds) ? source.channelIds.map(String) : [],
  };
}

function getMemberAgentScope(member: WorkspaceMember) {
  return normalizeAgentScope(member.agent_scope);
}

function normalizeWhatsappThreadNumber(value: unknown) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) {
    return "";
  }
  if (digits.length === 10) {
    return `91${digits}`;
  }
  if (digits.length === 11 && digits.startsWith("0")) {
    return `91${digits.slice(1)}`;
  }
  return digits;
}

function getConversationPriorityScore(conversation: any) {
  const status = String(conversation?.status || conversation?.inbox_status || "").toLowerCase();
  const hasMessages = Boolean(conversation?.last_message_text);
  const lastActivity = new Date(
    conversation?.effective_last_message_at ||
      conversation?.last_message_at ||
      conversation?.updated_at ||
      conversation?.created_at ||
      0
  ).getTime();

  return (
    (status === "agent_pending" ? 4 : status === "active" || status === "bot" ? 3 : 1) * 1_000_000_000 +
    (hasMessages ? 100_000_000 : 0) +
    lastActivity
  );
}

function pickPreferredText(...values: unknown[]) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text && text.toLowerCase() !== "recipient") {
      return text;
    }
  }
  return String(values[0] || "").trim();
}

function mergeConversationThreadDisplay(primary: any, secondary: any) {
  const primaryUnread = Number(primary?.unread_count || 0);
  const secondaryUnread = Number(secondary?.unread_count || 0);

  return {
    ...primary,
    display_name: pickPreferredText(
      primary?.display_name,
      primary?.contact_name,
      secondary?.display_name,
      secondary?.contact_name,
      primary?.external_id,
      secondary?.external_id
    ),
    contact_phone_resolved: pickPreferredText(
      primary?.contact_phone_resolved,
      primary?.external_id,
      secondary?.contact_phone_resolved,
      secondary?.external_id
    ),
    last_message_text: pickPreferredText(
      primary?.last_message_text,
      secondary?.last_message_text,
      primary?.last_message_type ? `[${primary.last_message_type}]` : "",
      secondary?.last_message_type ? `[${secondary.last_message_type}]` : ""
    ),
    assigned_to_name: pickPreferredText(primary?.assigned_to_name, secondary?.assigned_to_name),
    unread_count: Math.max(primaryUnread, secondaryUnread),
    last_inbound_at:
      new Date(primary?.last_inbound_at || 0).getTime() >= new Date(secondary?.last_inbound_at || 0).getTime()
        ? primary?.last_inbound_at
        : secondary?.last_inbound_at,
    last_outbound_at:
      new Date(primary?.last_outbound_at || 0).getTime() >= new Date(secondary?.last_outbound_at || 0).getTime()
        ? primary?.last_outbound_at
        : secondary?.last_outbound_at,
    effective_last_message_at:
      new Date(primary?.effective_last_message_at || primary?.last_message_at || 0).getTime() >=
      new Date(secondary?.effective_last_message_at || secondary?.last_message_at || 0).getTime()
        ? primary?.effective_last_message_at || primary?.last_message_at
        : secondary?.effective_last_message_at || secondary?.last_message_at,
  };
}

function dedupeConversationThreads(rows: any[]) {
  const deduped = new Map<string, any>();

  for (const row of Array.isArray(rows) ? rows : []) {
    const channel = String(row?.platform || row?.channel || "").toLowerCase();
    if (channel !== "whatsapp") {
      deduped.set(`row:${row.id}`, row);
      continue;
    }

    const normalizedNumber = normalizeWhatsappThreadNumber(
      row?.contact_phone_resolved || row?.external_id || row?.platform_user_id
    );
    if (!normalizedNumber) {
      deduped.set(`row:${row.id}`, row);
      continue;
    }

    const key = [
      "whatsapp",
      String(row?.workspace_id || "").trim(),
      String(row?.project_id || "").trim(),
      String(row?.bot_id || "").trim(),
      String(row?.platform_account_id || "").trim(),
      String(row?.channel_id || "").trim(),
      normalizedNumber,
    ].join(":");
    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, row);
      continue;
    }

    const rowWins = getConversationPriorityScore(row) > getConversationPriorityScore(existing);
    deduped.set(
      key,
      rowWins
        ? mergeConversationThreadDisplay(row, existing)
        : mergeConversationThreadDisplay(existing, row)
    );
  }

  return Array.from(deduped.values());
}

function getCapacityTone(status: AssignmentCapacityCandidate["capacity_status"]) {
  if (status === "at_capacity") {
    return "border-red-200 bg-red-50 text-red-700";
  }
  if (status === "near_capacity") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function formatCapacityLabel(candidate: AssignmentCapacityCandidate) {
  return `${candidate.open_assignment_count}/${candidate.capacity_limit} open`;
}

function formatSkillLabel(skill: string) {
  return String(skill || "").replace(/_/g, " ");
}

function safeFilenamePart(value: unknown) {
  const slug = String(value || "conversation")
    .trim()
    .replace(/[^a-z0-9-_]+/gi, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "conversation";
}

function getCleanVariablesForExport(value: unknown) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
  const cleanVariables: Record<string, any> = {};

  for (const [key, entryValue] of Object.entries(source)) {
    if (!key || key.startsWith("_")) {
      continue;
    }
    cleanVariables[key] = entryValue;
  }

  return cleanVariables;
}

function getVariableProvenanceForExport(variables: Record<string, any>) {
  const provenance = variables && typeof variables === "object" ? variables._variable_provenance : null;
  if (!provenance || typeof provenance !== "object" || Array.isArray(provenance)) {
    return {};
  }
  return provenance as Record<
    string,
    {
      value?: any;
      updatedAt?: string;
      nodeId?: string | null;
      nodeType?: string | null;
      method?: string | null;
      sourceLabel?: string | null;
      confidence?: number | null;
      history?: Array<any>;
    }
  >;
}

function formatConversationAuditTrail(
  variables: Record<string, any>,
  provenance: Record<string, any>
) {
  return Object.entries(provenance)
    .filter(([key]) => Boolean(key) && !key.startsWith("_"))
    .map(([key, meta]) => ({
      variable: key,
      value: variables[key] ?? null,
      source: {
        nodeId: meta?.nodeId || null,
        nodeType: meta?.nodeType || null,
        method: meta?.method || null,
        confidence:
          meta?.confidence === null || meta?.confidence === undefined
            ? null
            : Number(meta.confidence),
        timestamp: meta?.updatedAt || null,
        sourceLabel: meta?.sourceLabel || null,
      },
      history: Array.isArray(meta?.history)
        ? meta.history.map((entry: any) => ({
            value: entry?.value ?? null,
            source: {
              nodeId: entry?.nodeId || null,
              nodeType: entry?.nodeType || null,
              method: entry?.method || null,
              confidence:
                entry?.confidence === null || entry?.confidence === undefined
                  ? null
                  : Number(entry.confidence),
              timestamp: entry?.updatedAt || null,
              sourceLabel: entry?.sourceLabel || null,
            },
          }))
        : [],
    }));
}

export default function ConversationsPage() {
  const router = useRouter();
  const selectedBotId = useBotStore((state) => state.selectedBotId);
  const syncSelectedBot = useBotStore((state) => state.syncSelectedBot);
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);
  const activeProject = useAuthStore((state) => state.activeProject);
  const user = useAuthStore((state) => state.user);
  const organizationImpersonation = useAuthStore((state) => state.organizationImpersonation);
  const hasWorkspaceRole = useAuthStore((state) => state.hasWorkspaceRole);
  const hasWorkspacePermission = useAuthStore((state) => state.hasWorkspacePermission);
  const { canViewPage } = useVisibility();

  const [validatedBotId, setValidatedBotId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<any[]>([]);
  const [activeConversation, setActiveConversation] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<ConversationAssignment[]>([]);
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMember[]>([]);
  const [campaigns, setCampaigns] = useState<Array<{ id: string; name: string }>>([]);
  const [platformAccounts, setPlatformAccounts] = useState<PlatformAccount[]>([]);
  const [campaignDetail, setCampaignDetail] = useState<CampaignDetail | null>(null);
  const [filterCampaignDetail, setFilterCampaignDetail] = useState<CampaignDetail | null>(null);
  const [conversationSettings, setConversationSettings] = useState<ConversationSettings | null>(null);
  const [assignmentCapacity, setAssignmentCapacity] = useState<{
    maxOpenChats: number;
    defaultAgentId?: string | null;
    conversationId?: string | null;
    requiredSkills?: string[];
    summary: {
      totalCandidates: number;
      eligibleCandidates: number;
      availableCandidates: number;
      nearCapacityCandidates: number;
      atCapacityCandidates: number;
      skillMatchedCandidates: number;
    };
    candidates: AssignmentCapacityCandidate[];
  } | null>(null);
  const [platformFilter, setPlatformFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [searchFilter, setSearchFilter] = useState("");
  const [agentFilter, setAgentFilter] = useState("");
  const [campaignFilter, setCampaignFilter] = useState("");
  const [platformAccountFilter, setPlatformAccountFilter] = useState("");
  const [listFilter, setListFilter] = useState("");
  const [dateFromFilter, setDateFromFilter] = useState("");
  const [dateToFilter, setDateToFilter] = useState("");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [detailError, setDetailError] = useState("");
  const [assignmentError, setAssignmentError] = useState("");
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isLoadingCapacity, setIsLoadingCapacity] = useState(false);
  const [isSavingAssignment, setIsSavingAssignment] = useState(false);
  const [noteInput, setNoteInput] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [contextInput, setContextInput] = useState("{}");
  const [contextForm, setContextForm] = useState(() => buildContextForm({}));
  const [showAdvancedContext, setShowAdvancedContext] = useState(false);
  const [selectedListId, setSelectedListId] = useState("");
  const [metaError, setMetaError] = useState("");
  const [isSavingMeta, setIsSavingMeta] = useState(false);
  const [showVariablesSidebar, setShowVariablesSidebar] = useState(true);

  const activeConvoRef = useRef<any>(null);

  const isWorkspaceManager = activeWorkspace?.workspace_id
    ? hasWorkspacePermission(activeWorkspace.workspace_id, "manage_users") ||
      hasWorkspacePermission(activeWorkspace.workspace_id, "manage_workspace")
    : false;
  const isWorkspaceAgent = activeWorkspace?.workspace_id
    ? hasWorkspaceRole(activeWorkspace.workspace_id, ["agent"])
    : false;
  const canManageAssignments = isWorkspaceManager ||
    (isWorkspaceAgent && (conversationSettings?.allow_agent_takeover ?? true));
  const canViewConversationsPage = canViewPage("conversations");
  const liveVariables = useMemo(() => {
    const context = activeConversation?.context_json && typeof activeConversation.context_json === "object"
      ? activeConversation.context_json
      : {};
    const variables = activeConversation?.variables && typeof activeConversation.variables === "object"
      ? activeConversation.variables
      : {};
    return { ...context, ...variables };
  }, [activeConversation?.context_json, activeConversation?.variables]);

  const handleJumpToNode = async (nodeId: string) => {
    const flowId = String(activeConversation?.flow_id || "").trim();
    const botId = String(activeConversation?.bot_id || validatedBotId || selectedBotId || "").trim();
    if (!flowId || !nodeId) {
      return;
    }

    await router.push({
      pathname: "/flows",
      query: {
        ...(botId ? { botId } : {}),
        flowId,
        nodeId,
      },
    });
  };

  const assignableMembers = useMemo(
    () =>
      workspaceMembers.filter(
        (member) =>
          member.status === "active" &&
          ["workspace_admin", "agent"].includes(member.role) &&
          (() => {
            const scope = getMemberAgentScope(member);
            if (activeConversation?.project_id && scope.projectIds.length > 0 && !scope.projectIds.includes(String(activeConversation.project_id))) {
              return false;
            }
            if (activeConversation?.campaign_id && scope.campaignIds.length > 0 && !scope.campaignIds.includes(String(activeConversation.campaign_id))) {
              return false;
            }
            const conversationPlatform = String(activeConversation?.platform || activeConversation?.channel || "").toLowerCase();
            if (conversationPlatform && scope.platforms.length > 0 && !scope.platforms.includes(conversationPlatform)) {
              return false;
            }
            if (activeConversation?.channel_id && scope.channelIds.length > 0 && !scope.channelIds.includes(String(activeConversation.channel_id))) {
              return false;
            }
            return true;
          })()
      ),
    [workspaceMembers, activeConversation?.project_id, activeConversation?.campaign_id, activeConversation?.platform, activeConversation?.channel, activeConversation?.channel_id]
  );

  const platformOptions = useMemo(
    () =>
      Array.from(new Set(platformAccounts.map((account) => String(account.platform_type || "").toLowerCase()).filter(Boolean))),
    [platformAccounts]
  );

  const capacityByAgentId = useMemo(
    () =>
      new Map(
        (assignmentCapacity?.candidates || []).map((candidate) => [candidate.user_id, candidate] as const)
      ),
    [assignmentCapacity]
  );

  const visibleCapacityCandidates = useMemo(() => {
    const activeAssignedTo = String(activeConversation?.assigned_to || "");
    return (assignmentCapacity?.candidates || [])
      .filter(
        (candidate) =>
          candidate.eligible_for_assignment ||
          candidate.user_id === activeAssignedTo
      )
      .sort((left, right) => {
        if (left.recommended !== right.recommended) {
          return left.recommended ? -1 : 1;
        }
        if (left.open_assignment_count !== right.open_assignment_count) {
          return left.open_assignment_count - right.open_assignment_count;
        }
        return (left.name || left.email || left.user_id).localeCompare(
          right.name || right.email || right.user_id
        );
      });
  }, [assignmentCapacity, activeConversation?.assigned_to]);

  const fetchMessages = async (conversationId: string) => {
    try {
      const [detailResult, threadResult, assignmentResult, timelineResult] = await Promise.allSettled([
        conversationService.getDetail(conversationId),
        conversationService.getMessages(conversationId),
        conversationService.getAssignments(conversationId),
        conversationService.getTimeline(conversationId),
      ]);

      const detail = detailResult.status === "fulfilled" ? detailResult.value : null;
      const thread = threadResult.status === "fulfilled" ? threadResult.value : [];
      const assignmentRows = assignmentResult.status === "fulfilled" ? assignmentResult.value : [];
      const timelineRes = timelineResult.status === "fulfilled" ? timelineResult.value : { timeline: [] };

      if (!detail) {
        throw new Error("Conversation detail could not be loaded");
      }

      setActiveConversation((prev: any) =>
        prev?.id === conversationId ? { ...prev, ...detail } : detail
      );
      setMessages(Array.isArray(thread) ? thread : []);
      setAssignments(Array.isArray(assignmentRows) ? assignmentRows : []);
      setTimeline(Array.isArray((timelineRes as any)?.timeline) ? (timelineRes as any).timeline : []);
      setSelectedAgentId(detail?.assigned_to || "");
      setSelectedListId(detail?.list_id || "");
      setContextInput(JSON.stringify(detail?.context_json || {}, null, 2));
      setContextForm(buildContextForm(detail?.context_json));
    } catch (err) {
      console.error("Chat history fetch failed:", err);
      setMessages([]);
      setAssignments([]);
      setTimeline([]);
    }
  };

  const fetchConversations = async (botId: string, preserveActive = true) => {
    try {
      setIsLoadingList(true);
      const data = await conversationService.list({
        botId: botId || undefined,
        workspaceId: activeWorkspace?.workspace_id || undefined,
        projectId: activeProject?.id || undefined,
        campaignId: campaignFilter || undefined,
        platform: platformFilter || undefined,
        platformAccountId: platformAccountFilter || undefined,
        listId: listFilter || undefined,
        status: statusFilter || undefined,
        search: searchFilter || undefined,
        agentId: agentFilter || undefined,
        dateFrom: dateFromFilter || undefined,
        dateTo: dateToFilter || undefined,
      });
      const nextList = dedupeConversationThreads(Array.isArray(data) ? data : []);

      startTransition(() => setConversations(nextList));

      const currentActiveId = preserveActive ? activeConvoRef.current?.id : null;
      const nextActive =
        nextList.find((item) => item.id === currentActiveId) || nextList[0] || null;

      startTransition(() => setActiveConversation(nextActive));
      activeConvoRef.current = nextActive;

      if (nextActive?.id) {
        await fetchMessages(nextActive.id);
      } else {
        startTransition(() => setMessages([]));
        setAssignments([]);
      }
    } catch (err) {
      console.error("Failed to load conversations:", err);
      startTransition(() => {
        setConversations([]);
        setActiveConversation(null);
        setMessages([]);
      });
      setAssignments([]);
      setTimeline([]);
      activeConvoRef.current = null;
    } finally {
      setIsLoadingList(false);
    }
  };

  const getConversationScopeBotId = () => {
    if (activeWorkspace?.workspace_id) {
      return undefined;
    }

    return validatedBotId || selectedBotId || undefined;
  };

  useEffect(() => {
    let cancelled = false;

    botService
      .getBots({
        workspaceId: activeWorkspace?.workspace_id || undefined,
        projectId: activeProject?.id || undefined,
      })
      .then((bots) => {
        if (cancelled) {
          return;
        }

        const nextBotId = syncSelectedBot(bots.map((bot: { id: string }) => bot.id));
        startTransition(() => setValidatedBotId(nextBotId));
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("Failed to validate bot selection", err);
          startTransition(() => setValidatedBotId(null));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedBotId, syncSelectedBot, activeWorkspace?.workspace_id, activeProject?.id]);

  useEffect(() => {
    if (!canViewConversationsPage) {
      setWorkspaceMembers([]);
      setConversationSettings(null);
      setCampaigns([]);
      setPlatformAccounts([]);
      return;
    }
    if (!activeWorkspace?.workspace_id) {
      setWorkspaceMembers([]);
      setConversationSettings(null);
      setCampaigns([]);
      setPlatformAccounts([]);
      return;
    }

    const membersPromise = isWorkspaceManager
      ? workspaceMembershipService.list(activeWorkspace.workspace_id)
      : Promise.resolve([]);

    Promise.all([
      membersPromise,
      conversationSettingsService.get(activeWorkspace.workspace_id),
      campaignService.list({
        workspaceId: activeWorkspace.workspace_id,
        projectId: activeProject?.id || undefined,
      }),
      platformAccountService.list({
        workspaceId: activeWorkspace.workspace_id,
        projectId: activeProject?.id || undefined,
      }),
    ])
      .then(([members, settings, campaignRows, accountRows]) => {
        setWorkspaceMembers(
          isWorkspaceManager
            ? members
            : user?.id
              ? [
                  {
                    id: user.id,
                    workspace_id: activeWorkspace.workspace_id,
                    user_id: user.id,
                    name: user.name || undefined,
                    email: user.email || undefined,
                    role: "agent",
                    status: "active",
                  },
                ]
              : []
        );
        setConversationSettings(settings);
        setCampaigns(
          campaignRows
            .filter(
              (campaign) =>
                (campaign.workspace_id || campaign.workspaceId || null) ===
                activeWorkspace.workspace_id &&
                (!activeProject?.id ||
                  (campaign.project_id || campaign.projectId || null) === activeProject.id)
            )
            .map((campaign) => ({
              id: campaign.id,
              name: campaign.name,
            }))
        );
        setPlatformAccounts(
          accountRows.filter(
            (account) =>
              account.workspace_id === activeWorkspace.workspace_id &&
              (!activeProject?.id || account.project_id === activeProject.id)
          )
        );
      })
      .catch((err) => {
        console.error("Failed to load workspace inbox settings", err);
        setWorkspaceMembers([]);
        setConversationSettings(null);
        setCampaigns([]);
        setPlatformAccounts([]);
      });
  }, [activeWorkspace?.workspace_id, activeProject?.id, isWorkspaceManager, user?.id, user?.name, user?.email, canViewConversationsPage]);

  useEffect(() => {
    if (!activeConversation?.campaign_id) {
      setCampaignDetail(null);
      return;
    }

    campaignService
      .get(activeConversation.campaign_id)
      .then((detail) => setCampaignDetail(detail))
      .catch((err) => {
        console.error("Failed to load campaign detail for conversation", err);
        setCampaignDetail(null);
      });
  }, [activeConversation?.campaign_id]);

  useEffect(() => {
    if (!campaignFilter) {
      setFilterCampaignDetail(null);
      if (listFilter) {
        setListFilter("");
      }
      return;
    }

    campaignService
      .get(campaignFilter)
      .then((detail) => setFilterCampaignDetail(detail))
      .catch((err) => {
        console.error("Failed to load campaign detail for filters", err);
        setFilterCampaignDetail(null);
      });
  }, [campaignFilter]);

  useEffect(() => {
    if (!canViewConversationsPage) {
      setAssignmentCapacity(null);
      return;
    }
    if (!activeWorkspace?.workspace_id) {
      setAssignmentCapacity(null);
      return;
    }

    let cancelled = false;
    setIsLoadingCapacity(true);

    conversationService
      .getAssignmentCapacity({
        workspaceId: activeWorkspace.workspace_id,
        projectId: activeProject?.id || undefined,
        conversationId: activeConversation?.id || undefined,
      })
      .then((data) => {
        if (!cancelled) {
          setAssignmentCapacity(data);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("Failed to load assignment capacity", err);
          setAssignmentCapacity(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingCapacity(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeWorkspace?.workspace_id, activeProject?.id, activeConversation?.id, conversations.length, canViewConversationsPage]);

  useEffect(() => {
    if (!canViewConversationsPage) {
      startTransition(() => {
        setConversations([]);
        setActiveConversation(null);
        setMessages([]);
      });
      setAssignments([]);
      setTimeline([]);
      activeConvoRef.current = null;
      return;
    }

    const scopedBotId = getConversationScopeBotId();
    if (!scopedBotId && !activeWorkspace?.workspace_id) {
      startTransition(() => {
        setConversations([]);
        setActiveConversation(null);
        setMessages([]);
      });
      setAssignments([]);
      activeConvoRef.current = null;
      return;
    }

    fetchConversations(scopedBotId || "", true);
  }, [
    validatedBotId,
    selectedBotId,
    activeWorkspace?.workspace_id,
    activeProject?.id,
    platformFilter,
    platformAccountFilter,
    statusFilter,
    searchFilter,
    agentFilter,
    campaignFilter,
    listFilter,
    dateFromFilter,
    dateToFilter,
    canViewConversationsPage,
  ]);

  useEffect(() => {
    if (!canViewConversationsPage) {
      return;
    }
    const socket = io(getSocketServerUrl());

    const handleRealtimeUpdate = async (msg: any) => {
      const scopedBotId = getConversationScopeBotId();
      if (!scopedBotId && !activeWorkspace?.workspace_id) {
        return;
      }

      const currentActive = activeConvoRef.current;
      await fetchConversations(scopedBotId || "", true);

      if (currentActive && msg?.conversationId === currentActive.id) {
        await fetchMessages(currentActive.id);
      }
    };

    socket.on("dashboard_update", handleRealtimeUpdate);

    return () => {
      socket.off("dashboard_update", handleRealtimeUpdate);
      socket.disconnect();
    };
  }, [validatedBotId, selectedBotId, activeWorkspace?.workspace_id, activeProject?.id, agentFilter, canViewConversationsPage]);

  const handleSelectConversation = async (convo: any) => {
    setActiveConversation(convo);
    activeConvoRef.current = convo;
    setMessages([]);
    setAssignmentError("");
    setMetaError("");
    await fetchMessages(convo.id);
  };

  const handleResumeBot = async () => {
    const scopedBotId = getConversationScopeBotId();
    if (scopedBotId || activeWorkspace?.workspace_id) {
      await fetchConversations(scopedBotId || "", true);
    }
  };

  const handleStatusUpdate = async (nextStatus: string) => {
    const scopedBotId = getConversationScopeBotId();
    if (!activeConversation?.id || (!scopedBotId && !activeWorkspace?.workspace_id)) {
      return;
    }

    try {
      setIsUpdatingStatus(true);
      setDetailError("");
      await conversationService.updateStatus(activeConversation.id, nextStatus);
      await fetchConversations(scopedBotId || "", true);
      await fetchMessages(activeConversation.id);
    } catch (err: any) {
      setDetailError(err?.response?.data?.error || "Failed to update conversation status");
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleReconnectConversation = async () => {
    await handleStatusUpdate("pending");
  };

  const handleMessageSent = async (payload: any) => {
    const scopedBotId = getConversationScopeBotId();
    if (!activeConversation?.id || (!scopedBotId && !activeWorkspace?.workspace_id)) {
      return;
    }

    try {
      setDetailError("");
      const result = await conversationService.reply(activeConversation.id, payload);
      const nextConversation = result?.conversation || activeConversation;

      setActiveConversation(nextConversation);
      activeConvoRef.current = nextConversation;
      setMessages(Array.isArray(result?.messages) ? result.messages : []);

      await fetchConversations(scopedBotId || "", true);
      await fetchMessages(activeConversation.id);
    } catch (err: any) {
      setDetailError(err?.response?.data?.error || "Failed to send reply");
      throw err;
    }
  };

  const handleAssign = async () => {
    const scopedBotId = getConversationScopeBotId();
    if (!activeConversation?.id || !selectedAgentId || (!scopedBotId && !activeWorkspace?.workspace_id)) {
      return;
    }

    try {
      setIsSavingAssignment(true);
      setAssignmentError("");
      if (activeConversation.assigned_to) {
        await conversationService.reassign(activeConversation.id, {
          agentId: selectedAgentId,
          assignmentType: "manual",
        });
      } else {
        await conversationService.assign(activeConversation.id, {
          agentId: selectedAgentId,
          assignmentType: "manual",
        });
      }
      await fetchConversations(scopedBotId || "", true);
      await fetchMessages(activeConversation.id);
    } catch (err: any) {
      setAssignmentError(err?.response?.data?.error || "Failed to save assignment");
    } finally {
      setIsSavingAssignment(false);
    }
  };

  const handleRelease = async () => {
    const scopedBotId = getConversationScopeBotId();
    if (!activeConversation?.id || (!scopedBotId && !activeWorkspace?.workspace_id)) {
      return;
    }

    try {
      setIsSavingAssignment(true);
      setAssignmentError("");
      await conversationService.release(activeConversation.id);
      setSelectedAgentId("");
      await fetchConversations(scopedBotId || "", true);
      await fetchMessages(activeConversation.id);
    } catch (err: any) {
      setAssignmentError(err?.response?.data?.error || "Failed to release assignment");
    } finally {
      setIsSavingAssignment(false);
    }
  };

  const handleAddNote = async () => {
    if (!activeConversation?.id || !noteInput.trim()) {
      return;
    }

    try {
      setIsSavingMeta(true);
      setMetaError("");
      await conversationService.addNote(activeConversation.id, noteInput.trim());
      setNoteInput("");
      await fetchMessages(activeConversation.id);
    } catch (err: any) {
      setMetaError(err?.response?.data?.error || "Failed to add note");
    } finally {
      setIsSavingMeta(false);
    }
  };

  const handleAddTag = async () => {
    if (!activeConversation?.id || !tagInput.trim()) {
      return;
    }

    try {
      setIsSavingMeta(true);
      setMetaError("");
      await conversationService.addTag(activeConversation.id, tagInput.trim());
      setTagInput("");
      await fetchMessages(activeConversation.id);
    } catch (err: any) {
      setMetaError(err?.response?.data?.error || "Failed to add tag");
    } finally {
      setIsSavingMeta(false);
    }
  };

  const handleRemoveTag = async (tag: string) => {
    if (!activeConversation?.id) {
      return;
    }

    try {
      setIsSavingMeta(true);
      setMetaError("");
      await conversationService.removeTag(activeConversation.id, tag);
      await fetchMessages(activeConversation.id);
    } catch (err: any) {
      setMetaError(err?.response?.data?.error || "Failed to remove tag");
    } finally {
      setIsSavingMeta(false);
    }
  };

  const handleMoveList = async () => {
    if (!activeConversation?.id) {
      return;
    }

    try {
      setIsSavingMeta(true);
      setMetaError("");
      await conversationService.updateList(activeConversation.id, selectedListId || null);
      await fetchMessages(activeConversation.id);
    } catch (err: any) {
      setMetaError(err?.response?.data?.error || "Failed to update list");
    } finally {
      setIsSavingMeta(false);
    }
  };

  const handleSaveContext = async () => {
    if (!activeConversation?.id) {
      return;
    }

    try {
      setIsSavingMeta(true);
      setMetaError("");
      const parsed = JSON.parse(contextInput || "{}");
      await conversationService.updateContext(activeConversation.id, parsed);
      await fetchMessages(activeConversation.id);
    } catch (err: any) {
      setMetaError(
        err instanceof SyntaxError
          ? "Context must be valid JSON"
          : err?.response?.data?.error || "Failed to update context"
      );
    } finally {
      setIsSavingMeta(false);
    }
  };

  const handleSaveStructuredContext = async () => {
    if (!activeConversation?.id) {
      return;
    }

    try {
      setIsSavingMeta(true);
      setMetaError("");
      await conversationService.updateContext(activeConversation.id, {
        platform: contextForm.platform || null,
        userId: contextForm.userId || null,
        campaignId: contextForm.campaignId || null,
        campaignName: contextForm.campaignName || null,
        channelId: contextForm.channelId || null,
        channelName: contextForm.channelName || null,
        entryPointId: contextForm.entryPointId || null,
        entryName: contextForm.entryName || null,
        entryKey: contextForm.entryKey || null,
        flowId: contextForm.flowId || null,
        listId: contextForm.listId || null,
      });
      await fetchMessages(activeConversation.id);
    } catch (err: any) {
      setMetaError(err?.response?.data?.error || "Failed to update context");
    } finally {
      setIsSavingMeta(false);
    }
  };

  const handleExportConversation = () => {
    if (!activeConversation?.id) {
      return;
    }

    const exportVariables = getCleanVariablesForExport(activeConversation.variables);
    const provenance = getVariableProvenanceForExport(activeConversation.variables || {});

    const contact = {
      lead: activeConversation.display_name || activeConversation.contact_name || "",
      phone: activeConversation.contact_phone_resolved || activeConversation.external_id || "",
      platform: activeConversation.platform || activeConversation.channel || "",
      account:
        activeConversation.platform_account_name ||
        activeConversation.platform_account_phone_number ||
        activeConversation.platform_account_external_id ||
        "",
      email: activeConversation.contact_email || activeConversation.email || "",
      assigned_to: activeConversation.assigned_to_name || activeConversation.assigned_to || "",
      status: activeConversation.inbox_status || activeConversation.status || "",
      campaign: activeConversation.campaign_name || "",
      flow: activeConversation.flow_name || "",
      list: activeConversation.list_name || "",
      entry: activeConversation.entry_point_name || "",
      context: activeConversation.context_json || {},
      tags: tags.map((tag: any) => tag?.tag || tag).filter(Boolean),
      notes: notes.map((note) => ({
        id: note.id,
        note: note.note,
        author: note.author_name || note.author_email || "Unknown",
        created_at: note.created_at,
      })),
      assignments: assignments.map((assignment) => ({
        id: assignment.id,
        agent: assignment.agent_name || assignment.agent_email || assignment.agent_id,
        assignment_type: assignment.assignment_type,
        status: assignment.status,
        assigned_at: assignment.assigned_at,
        released_at: assignment.released_at || null,
        notes: assignment.notes || null,
      })),
    };

    const payload = {
      exported_at: new Date().toISOString(),
      conversation: {
        id: activeConversation.id,
        thread_id: activeConversation.thread_id || null,
        external_id: activeConversation.external_id || null,
        display_name:
          activeConversation.display_name ||
          activeConversation.contact_name ||
          activeConversation.name ||
          null,
      },
      contact,
      summary: {
        created_at: activeConversation.created_at || null,
        last_message_at: activeConversation.last_message_at || null,
        last_inbound_at: activeConversation.last_inbound_at || null,
        last_outbound_at: activeConversation.last_outbound_at || null,
        effective_last_message_at: activeConversation.effective_last_message_at || null,
        assigned_to_name: activeConversation.assigned_to_name || null,
        inbox_status: activeConversation.inbox_status || activeConversation.status || null,
        platform_account_name: activeConversation.platform_account_name || null,
      },
      data: exportVariables,
      audit_trail: formatConversationAuditTrail(exportVariables, provenance),
      messages,
      timeline,
      legacy: {
        contact,
      },
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8;",
    });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `conversation-${safeFilenamePart(activeConversation.display_name || activeConversation.contact_phone_resolved || activeConversation.id)}-history.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.URL.revokeObjectURL(url);
  };

  const assignmentSummary = assignments[0] || null;
  const notes = Array.isArray(activeConversation?.notes)
    ? (activeConversation.notes as ConversationNote[])
    : [];
  const tags = Array.isArray(activeConversation?.tags) ? activeConversation.tags : [];
  const availableLists = Array.isArray(campaignDetail?.lists) ? campaignDetail.lists : [];
  const filterLists = Array.isArray(filterCampaignDetail?.lists) ? filterCampaignDetail.lists : [];
  const activeFilterCount = [
    searchFilter,
    campaignFilter,
    platformFilter,
    platformAccountFilter,
    statusFilter,
    listFilter,
    agentFilter,
    dateFromFilter,
    dateToFilter,
  ].filter(Boolean).length;

  const pageShellClassName =
    "overflow-hidden border border-border-main bg-bg-main shadow-sm";
  const sidebarClassName = "flex min-w-0 flex-col border-r border-border-main bg-bg-card";
  const controlClassName =
    "rounded-xl border border-border-main bg-bg-muted px-3 py-2 text-sm text-text-main outline-none shadow-sm placeholder:text-text-muted focus:border-primary focus:ring-1 focus:ring-primary";
  const controlButtonClassName =
    "inline-flex items-center gap-2 rounded-xl border border-border-main bg-bg-card px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-text-main transition hover:border-primary/30 hover:bg-primary-fade hover:text-primary";
  const secondaryButtonClassName =
    "rounded-xl border border-border-main bg-bg-card px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-text-main transition hover:border-primary/30 hover:bg-primary-fade hover:text-primary disabled:cursor-not-allowed disabled:opacity-50";
  const detailCardClassName =
    "rounded-xl border border-border-main bg-bg-card px-4 py-3 shadow-sm";
  const detailHeadingClassName =
    "text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted";
  const detailTextClassName = "break-words text-sm font-medium text-text-main";
  const smallValueClassName = "text-xs text-text-muted";

  const clearFilters = () => {
    setSearchFilter("");
    setCampaignFilter("");
    setPlatformFilter("");
    setPlatformAccountFilter("");
    setStatusFilter("");
    setListFilter("");
    setAgentFilter("");
    setDateFromFilter("");
    setDateToFilter("");
  };

  return (
    !canViewConversationsPage ? (
      <DashboardLayout>
        <PageAccessNotice
          title="Inbox is restricted for this role"
          description="Conversation handling is limited to workspace admins, project operators, and scoped agents."
          href="/"
          ctaLabel="Open dashboard"
        />
      </DashboardLayout>
    ) : (
      <ControlTowerShell
        orgCount={conversations.length}
        title="Inbox"
        breadcrumb="Support / Conversations"
        utilitySlot={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-xl border border-border-main bg-bg-card px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">
              <span>Open Threads</span>
              <span className="font-mono text-text-main">{conversations.length}</span>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-border-main bg-bg-card px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">
              <span>Active Context</span>
              <span className="truncate font-mono text-text-main">
                {activeWorkspace?.workspace_name || validatedBotId || selectedBotId || "Global view"}
              </span>
            </div>
          </div>
        }
        safetyBanner={
          organizationImpersonation?.active ? (
            <div
              className={`flex h-[var(--banner-h)] items-center justify-between gap-3 border-b border-warning px-4 text-[10px] font-black uppercase tracking-[0.24em] text-white ${
                organizationImpersonation.readOnly ? "bg-warning" : "bg-danger"
              }`}
            >
              <div className="flex items-center gap-2">
                <Shield size={14} />
                <span>
                  Security Context: {organizationImpersonation.readOnly ? "Read-Only" : "Elevated"} support session for{" "}
                  {organizationImpersonation.organizationName}
                </span>
              </div>
              <div className="flex items-center gap-2 rounded-xs bg-black px-3 py-1 text-white">
                <Lock size={12} />
                Exit session
              </div>
            </div>
          ) : null
        }
      >
      <div className="min-h-0 flex-1 px-4 pb-4 pt-2 md:px-6 md:pb-6 md:pt-2">
        <GlobalBackStrip className="mb-2" labelOverride="Inbox" />
        <div className={pageShellClassName}>
          <div className="grid h-full min-h-[72vh] min-w-0 grid-cols-[280px_minmax(0,1fr)_320px]">
          <div className={sidebarClassName}>
            <div className="px-5 pb-3 pt-4">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-text-main">
                  Active Threads
                </h2>
              </div>
            </div>
            <div className="grid gap-2 px-4 pb-3">
              <input
                value={searchFilter}
                onChange={(event) => setSearchFilter(event.target.value)}
                placeholder="Search name, phone, campaign"
                className={controlClassName}
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={campaignFilter}
                  onChange={(event) => {
                    setCampaignFilter(event.target.value);
                    setListFilter("");
                  }}
                  className={controlClassName}
                >
                  <option value="">Campaigns</option>
                  {campaigns.map((campaign) => (
                    <option key={campaign.id} value={campaign.id}>
                      {campaign.name}
                    </option>
                  ))}
                </select>
                <select
                  value={platformFilter}
                  onChange={(event) => setPlatformFilter(event.target.value)}
                  className={controlClassName}
                >
                  <option value="">Platforms</option>
                  {platformOptions.map((platform) => (
                    <option key={platform} value={platform}>
                      {platform.charAt(0).toUpperCase() + platform.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowAdvancedFilters((current) => !current)}
                  className={controlButtonClassName}
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  {showAdvancedFilters ? "Hide filters" : "More filters"}
                  {activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
                </button>
                {activeFilterCount > 0 ? (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className={secondaryButtonClassName}
                  >
                    Clear filters
                  </button>
                ) : null}
              </div>
              {showAdvancedFilters ? (
                <div className="grid gap-2 rounded-2xl border border-border-main bg-canvas p-3 shadow-sm">
                  <select
                    value={platformAccountFilter}
                    onChange={(event) => setPlatformAccountFilter(event.target.value)}
                    className={controlClassName}
                  >
                    <option value="">All platform accounts</option>
                    {platformAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={statusFilter}
                      onChange={(event) => setStatusFilter(event.target.value)}
                      className={controlClassName}
                    >
                      <option value="">All statuses</option>
                      <option value="bot">Bot</option>
                      <option value="pending">Pending</option>
                      <option value="closed">Closed</option>
                      <option value="resolved">Resolved</option>
                    </select>
                    <select
                      value={listFilter}
                      onChange={(event) => setListFilter(event.target.value)}
                      disabled={!campaignFilter}
                      className={`${controlClassName} disabled:opacity-60`}
                    >
                      <option value="">All lists</option>
                      {filterLists.map((list: any) => (
                        <option key={list.id} value={list.id}>
                          {list.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <select
                    value={agentFilter}
                    onChange={(event) => setAgentFilter(event.target.value)}
                    className={controlClassName}
                  >
                    <option value="">All assignees</option>
                    {isWorkspaceManager || (isWorkspaceAgent && (conversationSettings?.allow_agent_takeover ?? true)) ? (
                      <option value="unassigned">Unassigned</option>
                    ) : null}
                    {user?.id ? <option value={user.id}>Assigned to me</option> : null}
                    {assignableMembers.map((member) => (
                      <option key={member.user_id} value={member.user_id}>
                        {member.name || member.email}
                      </option>
                    ))}
                  </select>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      value={dateFromFilter}
                      onChange={(event) => setDateFromFilter(event.target.value)}
                      className={controlClassName}
                    />
                    <input
                      type="date"
                      value={dateToFilter}
                      onChange={(event) => setDateToFilter(event.target.value)}
                      className={controlClassName}
                    />
                  </div>
                </div>
              ) : null}
            </div>
            <div className="min-h-0 flex-1 px-3 pb-3">
              <ConversationList
                list={conversations}
                activeId={activeConversation?.id}
                onSelect={handleSelectConversation}
                loading={isLoadingList}
              />
            </div>
          </div>

            <div className="min-h-0 min-w-0 border-x border-border-main bg-bg-main">
              <div className="flex h-full min-h-0 flex-col p-3 md:p-4">
                <ChatWindow
                  messages={messages}
                  activeConversation={activeConversation}
                onResumeBot={handleResumeBot}
                onReconnectConversation={handleReconnectConversation}
                onMessageSent={handleMessageSent}
                canResumeBot={conversationSettings?.allow_bot_resume ?? true}
                canManualReply={conversationSettings?.allow_manual_reply ?? true}
                showCampaign={conversationSettings?.show_campaign ?? true}
                showFlow={conversationSettings?.show_flow ?? true}
                showList={conversationSettings?.show_list ?? true}
              />
            </div>
          </div>

          <aside className="hidden shrink-0 border-l border-border-main bg-bg-card xl:block">
            <div className="flex h-full flex-col gap-4 overflow-y-auto p-5 [scrollbar-gutter:stable]">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                    Variables
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowVariablesSidebar((current) => !current)}
                    className="inline-flex items-center gap-1 rounded-full border border-border-main bg-canvas px-2 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-text-muted"
                  >
                    <Variable size={10} />
                    {showVariablesSidebar ? "Hide" : "Show"}
                  </button>
                </div>
                {showVariablesSidebar ? (
                  <VariablesSidebar
                    variables={liveVariables}
                    currentNodeId={String(activeConversation?.current_node || "").trim() || null}
                    flowName={activeConversation?.flow_name || null}
                    onJumpToNode={handleJumpToNode}
                  />
                ) : null}
              </div>

              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                Conversation Details
              </div>
              {activeConversation ? (
                <div className="mt-4 space-y-3">
                  <div className={detailCardClassName}>
                    <div className="flex items-center justify-between gap-3">
                      <div className={detailHeadingClassName}>
                        Actions
                      </div>
                      <button
                        type="button"
                        onClick={handleExportConversation}
                        data-allow-export="true"
                        className="inline-flex items-center gap-2 rounded-full border border-primary bg-primary px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-white transition hover:opacity-90"
                      >
                        <Download size={13} />
                        Export History
                      </button>
                    </div>
                    <div className="mt-3 space-y-3">
                      <select
                        value={activeConversation.inbox_status || activeConversation.status || "bot"}
                        onChange={(event) => handleStatusUpdate(event.target.value)}
                        disabled={isUpdatingStatus}
                        className={`${controlClassName} w-full`}
                      >
                        <option value="bot">Bot</option>
                        <option value="pending">Pending</option>
                        <option value="resolved">Resolved</option>
                        <option value="closed">Closed</option>
                      </select>
                      <select
                        value={selectedAgentId}
                        disabled={!canManageAssignments || isSavingAssignment}
                        onChange={(event) => setSelectedAgentId(event.target.value)}
                        className={`${controlClassName} w-full`}
                      >
                        <option value="">Select assignee</option>
                        {assignableMembers.map((member) => (
                          <option key={member.user_id} value={member.user_id}>
                            {member.name || member.email} ({member.role})
                            {capacityByAgentId.has(member.user_id)
                              ? ` - ${formatCapacityLabel(capacityByAgentId.get(member.user_id)!)}`
                              : ""}
                          </option>
                        ))}
                      </select>
                      <div className="rounded-xl border border-border-main bg-canvas px-3 py-3 shadow-sm">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                            Agent Capacity
                          </div>
                          {assignmentCapacity ? (
                            <div className="text-xs text-text-muted">
                              {assignmentCapacity.summary.eligibleCandidates} eligible / {assignmentCapacity.summary.skillMatchedCandidates} skill-matched
                            </div>
                          ) : null}
                        </div>
                        {isLoadingCapacity ? (
                          <div className="mt-3 text-xs text-text-muted">Loading capacity...</div>
                        ) : visibleCapacityCandidates.length === 0 ? (
                          <div className="mt-3 text-xs text-text-muted">
                            No eligible agents available for this conversation yet.
                          </div>
                        ) : (
                          <div className="mt-3 space-y-2">
                            {visibleCapacityCandidates.slice(0, 5).map((candidate) => (
                              <button
                                key={candidate.user_id}
                                type="button"
                                onClick={() => setSelectedAgentId(candidate.user_id)}
                                disabled={!canManageAssignments}
                                className={`w-full rounded-lg border px-3 py-2 text-left transition ${
                                  selectedAgentId === candidate.user_id
                                    ? "border-primary bg-primary-fade"
                                    : "border-border-main bg-surface hover:bg-canvas"
                                }`}
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="truncate text-sm font-medium text-text-main">
                                      {candidate.name || candidate.email || candidate.user_id}
                                    </div>
                                    <div className="mt-1 text-xs text-text-muted">
                                      {candidate.role} - {candidate.capacity_remaining} slots free
                                    </div>
                                  </div>
                                  <div className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${getCapacityTone(candidate.capacity_status)}`}>
                                    {candidate.capacity_status.replace("_", " ")}
                                  </div>
                                </div>
                                <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-[0.12em]">
                                  <span className="rounded-full border border-border-main bg-canvas px-2 py-1 text-text-muted">
                                    {formatCapacityLabel(candidate)}
                                  </span>
                                  {candidate.pending_assignment_count > 0 ? (
                                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-amber-700">
                                      {candidate.pending_assignment_count} pending
                                    </span>
                                  ) : null}
                                  {candidate.matched_skill_count > 0 ? (
                                    <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2 py-1 text-cyan-700">
                                      {candidate.matched_skill_count} skill match
                                    </span>
                                  ) : null}
                                  {candidate.recommended ? (
                                    <span className="rounded-full border border-primary/20 bg-primary-fade px-2 py-1 text-primary">
                                      Recommended
                                    </span>
                                  ) : null}
                                  {!candidate.scope_matches ? (
                                    <span className="rounded-full border border-red-200 bg-red-50 px-2 py-1 text-red-700">
                                      Scope mismatch
                                    </span>
                                  ) : null}
                                  {!candidate.has_project_access ? (
                                    <span className="rounded-full border border-red-200 bg-red-50 px-2 py-1 text-red-700">
                                      No project access
                                    </span>
                                  ) : null}
                                </div>
                                {candidate.last_assigned_at ? (
                                  <div className="mt-2 text-xs text-text-muted">
                                    Last assigned {new Date(candidate.last_assigned_at).toLocaleString()}
                                  </div>
                                ) : null}
                                {(candidate.required_skills.length > 0 || candidate.agent_skills.length > 0) ? (
                                  <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-[0.12em]">
                                    {candidate.required_skills.slice(0, 4).map((skill) => (
                                      <span key={`required-${candidate.user_id}-${skill}`} className="rounded-full border border-border-main bg-canvas px-2 py-1 text-text-muted">
                                        Need {formatSkillLabel(skill)}
                                      </span>
                                    ))}
                                    {candidate.agent_skills.slice(0, 4).map((skill) => (
                                      <span key={`agent-${candidate.user_id}-${skill}`} className="rounded-full border border-cyan-200 bg-cyan-50 px-2 py-1 text-cyan-700">
                                        {formatSkillLabel(skill)}
                                      </span>
                                    ))}
                                  </div>
                                ) : null}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={handleAssign}
                        disabled={!canManageAssignments || !selectedAgentId || isSavingAssignment}
                        className="w-full rounded-xl border border-primary bg-primary px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {activeConversation.assigned_to ? "Reassign Conversation" : "Assign Conversation"}
                      </button>
                      <button
                        type="button"
                        onClick={handleRelease}
                        disabled={!canManageAssignments || !activeConversation.assigned_to || isSavingAssignment}
                        className={secondaryButtonClassName + " w-full"}
                      >
                        Release Assignment
                      </button>
                      {detailError ? (
                        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                          {detailError}
                        </div>
                      ) : null}
                      {assignmentError ? (
                        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                          {assignmentError}
                        </div>
                      ) : null}
                      {metaError ? (
                        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                          {metaError}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  {[
                    ["Lead", activeConversation.display_name || activeConversation.contact_phone_resolved || "Unknown"],
                    ["Phone", activeConversation.contact_phone_resolved || activeConversation.external_id || "n/a"],
                    ["Platform", activeConversation.platform || activeConversation.channel || "n/a"],
                    ["Account", activeConversation.platform_account_name || activeConversation.platform_account_phone_number || activeConversation.platform_account_external_id || "n/a"],
                    ...(conversationSettings?.show_campaign === false
                      ? []
                      : [["Campaign", activeConversation.campaign_name || "n/a"]]),
                    ...(conversationSettings?.show_flow === false
                      ? []
                      : [["Flow", activeConversation.flow_name || "n/a"]]),
                    ...(conversationSettings?.show_list === false
                      ? []
                      : [["List", activeConversation.list_name || "n/a"]]),
                    ["Entry", activeConversation.entry_point_name || "n/a"],
                    ["Agent", activeConversation.assigned_to_name || "Unassigned"],
                    ["Status", activeConversation.inbox_status || activeConversation.status || "n/a"],
                  ].map(([label, value]) => (
                  <div key={label} className={detailCardClassName}>
                      <div className={detailHeadingClassName}>
                        {label}
                      </div>
                      <div className={`mt-1 ${detailTextClassName}`}>
                        {value}
                      </div>
                    </div>
                  ))}

                  <div className={detailCardClassName}>
                    <div className={detailHeadingClassName}>
                      Assignment History
                    </div>
                    <div className="mt-3 space-y-3">
                      {assignments.length === 0 ? (
                        <div className="text-sm text-text-muted">No assignment history yet.</div>
                      ) : (
                        assignments.map((assignment) => (
                          <div key={assignment.id} className="rounded-lg border border-border-main bg-surface px-3 py-3 shadow-sm">
                            <div className="text-sm font-medium text-text-main">
                              {assignment.agent_name || assignment.agent_email || assignment.agent_id}
                            </div>
                            <div className="mt-1 text-xs text-text-muted">
                              {assignment.status} via {assignment.assignment_type}
                            </div>
                            <div className="mt-1 text-xs text-text-muted">
                              Assigned by {assignment.assigned_by_name || "system"} on{" "}
                              {new Date(assignment.assigned_at).toLocaleString()}
                            </div>
                            {assignment.released_at ? (
                              <div className="mt-1 text-xs text-text-muted">
                                Closed by {assignment.released_by_name || "system"} on{" "}
                                {new Date(assignment.released_at).toLocaleString()}
                              </div>
                            ) : null}
                            {assignment.notes ? (
                              <div className="mt-1 text-xs text-text-main">{assignment.notes}</div>
                            ) : null}
                          </div>
                        ))
                      )}
                    </div>
                    {assignmentSummary ? (
                      <div className="mt-3 text-xs text-text-muted">
                        Current assignment source: {assignmentSummary.assignment_type}
                      </div>
                    ) : null}
                  </div>

                  <div className={detailCardClassName}>
                    <div className={detailHeadingClassName}>
                      Tags
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {tags.length === 0 ? (
                        <div className="text-sm text-text-muted">No tags yet.</div>
                      ) : (
                        tags.map((tag: any) => (
                          <button
                            key={tag.tag}
                            type="button"
                            onClick={() => handleRemoveTag(tag.tag)}
                            className="rounded-full border border-border-main bg-surface px-3 py-1 text-xs font-medium text-text-main transition hover:border-primary/30 hover:bg-primary-fade hover:text-primary"
                          >
                            {tag.tag} x
                          </button>
                        ))
                      )}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <input
                        value={tagInput}
                        onChange={(event) => setTagInput(event.target.value)}
                        placeholder="Add tag"
                        className={`${controlClassName} flex-1`}
                      />
                      <button
                        type="button"
                        onClick={handleAddTag}
                        disabled={isSavingMeta || !tagInput.trim()}
                        className={secondaryButtonClassName}
                      >
                        Add
                      </button>
                    </div>
                  </div>

                  <div className={detailCardClassName}>
                    <div className={detailHeadingClassName}>
                      Notes
                    </div>
                    <div className="mt-3 space-y-3">
                      {notes.length === 0 ? (
                        <div className="text-sm text-text-muted">No notes yet.</div>
                      ) : (
                        notes.map((note) => (
                          <div key={note.id} className="rounded-lg border border-border-main bg-surface px-3 py-3 shadow-sm">
                            <div className="text-sm text-text-main">{note.note}</div>
                            <div className="mt-1 text-xs text-text-muted">
                              {note.author_name || note.author_email || "Unknown"} on{" "}
                              {new Date(note.created_at).toLocaleString()}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                    <div className="mt-3 space-y-2">
                      <textarea
                        value={noteInput}
                        onChange={(event) => setNoteInput(event.target.value)}
                        placeholder="Add internal note"
                        className="min-h-[90px] w-full rounded-xl border border-border-main bg-canvas px-3 py-2 text-sm text-text-main outline-none shadow-sm placeholder:text-text-muted focus:border-primary focus:ring-1 focus:ring-primary"
                      />
                      <button
                        type="button"
                        onClick={handleAddNote}
                        disabled={isSavingMeta || !noteInput.trim()}
                        className="w-full rounded-xl border border-primary bg-primary px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Save Note
                      </button>
                    </div>
                  </div>

                  <div className={detailCardClassName}>
                    <div className={detailHeadingClassName}>
                      Unified Timeline
                    </div>
                    <div className="mt-3 space-y-2">
                      {timeline.length === 0 ? (
                        <div className="text-sm text-text-muted">
                          No merged timeline events yet.
                        </div>
                      ) : (
                        timeline.slice(0, 12).map((item) => (
                          <div key={`${item.event_type}-${item.event_id}`} className="rounded-lg border border-border-main bg-surface px-3 py-3 shadow-sm">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="text-sm font-medium text-text-main">
                                  {String(item.title || item.event_type || "event")}
                                </div>
                                <div className="mt-1 text-xs uppercase tracking-[0.14em] text-text-muted">
                                  {String(item.event_type || "event")} · {String(item.source_type || "source")}
                                </div>
                              </div>
                              <div className="rounded-full border border-border-main bg-canvas px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
                                {String(item.status || "n/a")}
                              </div>
                            </div>
                            <div className="mt-2 text-xs text-text-muted">
                              {new Date(item.happened_at || item.updated_at || item.created_at || Date.now()).toLocaleString()}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className={detailCardClassName}>
                    <div className={detailHeadingClassName}>
                      Move List
                    </div>
                    <div className="mt-3 flex gap-2">
                      <select
                        value={selectedListId}
                        onChange={(event) => setSelectedListId(event.target.value)}
                        className={`${controlClassName} flex-1`}
                      >
                        <option value="">No list</option>
                        {availableLists.map((list: any) => (
                          <option key={list.id} value={list.id}>
                            {list.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={handleMoveList}
                        disabled={isSavingMeta}
                        className={secondaryButtonClassName}
                      >
                        Save
                      </button>
                    </div>
                  </div>

                  <div className={detailCardClassName}>
                    <div className={detailHeadingClassName}>
                      Context
                    </div>
                    <div className="mt-3 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          ["Platform", "platform"],
                          ["User Id", "userId"],
                          ["Campaign Id", "campaignId"],
                          ["Campaign Name", "campaignName"],
                          ["Channel Id", "channelId"],
                          ["Channel Name", "channelName"],
                          ["Entry Point Id", "entryPointId"],
                          ["Entry Name", "entryName"],
                          ["Entry Key", "entryKey"],
                          ["Flow Id", "flowId"],
                          ["List Id", "listId"],
                        ].map(([label, key]) => (
                          <label key={key} className="block">
                            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                              {label}
                            </span>
                            <input
                              value={contextForm[key as keyof typeof contextForm]}
                              onChange={(event) =>
                                setContextForm((current) => ({
                                  ...current,
                                  [key]: event.target.value,
                                }))
                              }
                              className={`${controlClassName} w-full`}
                            />
                          </label>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={handleSaveStructuredContext}
                        disabled={isSavingMeta}
                        className="w-full rounded-xl border border-primary bg-primary px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Save Context Fields
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowAdvancedContext((value) => !value)}
                        className={secondaryButtonClassName + " w-full"}
                      >
                        {showAdvancedContext ? "Hide Advanced JSON" : "Show Advanced JSON"}
                      </button>
                      {showAdvancedContext ? (
                        <>
                          <textarea
                            value={contextInput}
                            onChange={(event) => setContextInput(event.target.value)}
                            className="min-h-[180px] w-full rounded-xl border border-border-main bg-canvas px-3 py-2 font-mono text-xs text-text-main outline-none shadow-sm placeholder:text-text-muted focus:border-primary focus:ring-1 focus:ring-primary"
                          />
                          <button
                            type="button"
                            onClick={handleSaveContext}
                            disabled={isSavingMeta}
                            className="w-full rounded-xl border border-primary bg-primary px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Save Raw JSON
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-xl border border-dashed border-border-main bg-canvas px-4 py-6 text-sm text-text-muted">
                  Select a conversation to view campaign, platform, routing, and assignment context.
                </div>
              )}
            </div>
          </aside>
          </div>
        </div>
      </div>
      </ControlTowerShell>
    )
  );
}

