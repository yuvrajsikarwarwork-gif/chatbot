import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import ReactFlow, {
  Background,
  Controls,
  Edge,
  MiniMap,
  Node,
  applyNodeChanges,
  type NodeChange,
} from "reactflow";
import "reactflow/dist/style.css";

import PageAccessNotice from "../../../components/access/PageAccessNotice";
import CampaignHeader from "../../../components/campaign/CampaignHeader";
import DashboardLayout from "../../../components/layout/DashboardLayout";
import BackButtonStrip from "../../../components/navigation/BackButtonStrip";
import { useVisibility } from "../../../hooks/useVisibility";
import { botService } from "../../../services/botService";
import { campaignService } from "../../../services/campaignService";
import { flowService } from "../../../services/flowService";
import { useAuthStore } from "../../../store/authStore";

type AutomationRule = {
  id: string;
  name: string;
  enabled: boolean;
  type: "date" | "webhook" | "cron";
  flowId: string;
  dateFieldKey: string;
  branchFieldKey: string;
  cronEveryMinutes: string;
  webhookSecret: string;
  webhookSecretHeader: string;
  webhookPath: string;
  matchValue: string;
  notes: string;
  branches: AutomationBranch[];
  branchGroups: AutomationBranchGroup[];
  actions: AutomationAction[];
};

type AutomationBranch = {
  id: string;
  label: string;
  matchValue: string;
  flowId: string;
  enabled: boolean;
};

type AutomationBranchGroup = {
  id: string;
  label: string;
  matchFieldKey: string;
  enabled: boolean;
  branches: AutomationBranch[];
  subflows: AutomationSubflow[];
};

type AutomationSubflow = {
  id: string;
  label: string;
  flowId: string;
  enabled: boolean;
};

type AutomationAction = {
  id: string;
  type: "start_flow" | "update_lead_status" | "add_note" | "tag_lead";
  flowId: string;
  leadStatus: string;
  note: string;
  tag: string;
  enabled: boolean;
};

const makeBranch = (seed = ""): AutomationBranch => ({
  id: seed || `branch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  label: "Branch",
  matchValue: "",
  flowId: "",
  enabled: true,
});

const makeAction = (seed = ""): AutomationAction => ({
  id: seed || `action-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  type: "start_flow",
  flowId: "",
  leadStatus: "qualified",
  note: "",
  tag: "",
  enabled: true,
});

const makeSubflow = (seed = ""): AutomationSubflow => ({
  id: seed || `subflow-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  label: "Subflow",
  flowId: "",
  enabled: true,
});

const makeBranchGroup = (seed = ""): AutomationBranchGroup => ({
  id: seed || `group-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  label: "Nested group",
  matchFieldKey: "status",
  enabled: true,
  branches: [makeBranch()],
  subflows: [makeSubflow()],
});

const makeRule = (seed = ""): AutomationRule => ({
  id: seed || `rule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  name: "Lifecycle rule",
  enabled: true,
  type: "date",
  flowId: "",
  dateFieldKey: "next_service_date",
  branchFieldKey: "status",
  cronEveryMinutes: "60",
  webhookSecret: "",
  webhookSecretHeader: "x-automation-secret",
  webhookPath: "",
  matchValue: "",
  notes: "",
  branches: [makeBranch()],
  branchGroups: [],
  actions: [makeAction()],
});

type BranchTemplateKey = "status_ladder" | "urgency_split" | "service_followup";

const BRANCH_TEMPLATES: Array<{
  key: BranchTemplateKey;
  label: string;
  branchFieldKey: string;
  branches: Array<{ label: string; matchValue: string }>;
}> = [
  {
    key: "status_ladder",
    label: "Status ladder",
    branchFieldKey: "status",
    branches: [
      { label: "New lead", matchValue: "new" },
      { label: "Qualified", matchValue: "qualified" },
      { label: "Engaged", matchValue: "engaged" },
    ],
  },
  {
    key: "urgency_split",
    label: "Urgency split",
    branchFieldKey: "priority",
    branches: [
      { label: "High priority", matchValue: "high" },
      { label: "Standard", matchValue: "normal" },
      { label: "Low priority", matchValue: "low" },
    ],
  },
  {
    key: "service_followup",
    label: "Service follow-up",
    branchFieldKey: "next_service_date",
    branches: [
      { label: "Due today", matchValue: "today" },
      { label: "Due soon", matchValue: "soon" },
      { label: "Later", matchValue: "later" },
    ],
  },
];

function mergeNodePositions(nextNodes: Node[], currentNodes: Node[]) {
  const currentById = new Map(currentNodes.map((node) => [node.id, node]));
  return nextNodes.map((node) => {
    const current = currentById.get(node.id);
    if (!current?.position) {
      return node;
    }
    return {
      ...node,
      position: current.position,
      selected: current.selected,
    };
  });
}

function buildAutomationCanvas(rules: AutomationRule[], flowOptions: any[]) {
  const nodes: Node[] = [];
  const edges: { id: string; source: string; target: string; type?: string; animated?: boolean }[] = [];
  const activeFlows = new Map(flowOptions.map((flow) => [String(flow.id), flow]));

  rules.forEach((rule, ruleIndex) => {
    const enabledBranches = (rule.branches || []).filter((branch) => branch.enabled !== false);
    const enabledBranchGroups = (rule.branchGroups || []).filter((group) => group.enabled !== false);
    const enabledActions = (rule.actions || []).filter((action) => action.enabled !== false);
    const baseY = 120 + ruleIndex * 360;
    const triggerId = `${rule.id}:trigger`;
    const decisionId = `${rule.id}:decision`;
    const hubId = `${rule.id}:actions`;

    nodes.push(
      {
        id: triggerId,
        position: { x: 0, y: baseY },
        data: { label: `${rule.type.toUpperCase()} TRIGGER\n${rule.name}` },
        type: "default",
        style: {
          width: 190,
          borderRadius: 18,
          border: "1px solid var(--border-main)",
          background: "var(--surface)",
          color: "var(--text-main)",
          fontWeight: 700,
          padding: 14,
          boxShadow: "0 12px 24px rgba(15, 23, 42, 0.08)",
          whiteSpace: "pre-line",
        },
      },
      {
        id: decisionId,
        position: { x: 280, y: baseY },
        data: { label: `BRANCH LOGIC\n${rule.branchFieldKey || "status"}` },
        type: "default",
        style: {
          width: 190,
          borderRadius: 18,
          border: "1px solid var(--primary)",
          background: "var(--primary-fade)",
          color: "var(--text-main)",
          fontWeight: 700,
          padding: 14,
          boxShadow: "0 12px 24px rgba(16, 185, 129, 0.12)",
          whiteSpace: "pre-line",
        },
      },
      {
        id: hubId,
        position: { x: 1080, y: baseY },
        data: { label: `ACTION HUB\n${enabledActions.length} active actions` },
        type: "default",
        style: {
          width: 190,
          borderRadius: 18,
          border: "1px solid var(--border-main)",
          background: "var(--canvas)",
          color: "var(--text-main)",
          fontWeight: 700,
          padding: 14,
          boxShadow: "0 12px 24px rgba(15, 23, 42, 0.06)",
          whiteSpace: "pre-line",
        },
      }
    );

    edges.push({
      id: `${triggerId}->${decisionId}`,
      source: triggerId,
      target: decisionId,
      animated: true,
      type: "smoothstep",
    });

    const nestedBranchGroups = enabledBranchGroups.map((group, groupIndex) => {
      const groupId = `${rule.id}:group:${group.id}`;
      const groupY = baseY + groupIndex * 180 - ((enabledBranchGroups.length - 1) * 90);
      nodes.push({
        id: groupId,
        position: { x: 560, y: groupY },
        data: { label: `GROUP\n${group.label || "Nested group"}\n${group.matchFieldKey || "status"}` },
        type: "default",
        style: {
          width: 210,
          borderRadius: 18,
          border: "1px solid var(--primary)",
          background: "var(--primary-fade)",
          color: "var(--text-main)",
          fontWeight: 700,
          padding: 14,
          whiteSpace: "pre-line",
        },
      });
      edges.push({
        id: `${decisionId}->${groupId}`,
        source: decisionId,
        target: groupId,
        type: "smoothstep",
      });

      const groupBranches = (group.branches || []).filter((branch) => branch.enabled !== false);
      const groupSubflows = (group.subflows || []).filter((subflow) => subflow.enabled !== false);

      groupBranches.forEach((branch, branchIndex) => {
        const branchId = `${groupId}:branch:${branch.id}`;
        const branchFlowId = `${groupId}:flow:${branch.id}`;
        const yOffset = groupY + branchIndex * 110 - ((groupBranches.length - 1) * 55);
        const flow = activeFlows.get(String(branch.flowId || rule.flowId || "")) || null;
        const flowLabel = flow?.label || flow?.name || "Rule flow";

        nodes.push(
          {
            id: branchId,
            position: { x: 820, y: yOffset },
            data: {
              label: `BRANCH\n${branch.label || "Branch"}\n${branch.matchValue || "Any value"}`,
            },
            type: "default",
            style: {
              width: 210,
              borderRadius: 18,
              border: "1px solid var(--border-main)",
              background: "var(--surface)",
              color: "var(--text-main)",
              fontWeight: 700,
              padding: 14,
              whiteSpace: "pre-line",
            },
          },
          {
            id: branchFlowId,
            position: { x: 1080, y: yOffset },
            data: { label: `FLOW\n${flowLabel}` },
            type: "default",
            style: {
              width: 200,
              borderRadius: 18,
              border: "1px solid var(--primary)",
              background: "var(--primary-fade)",
              color: "var(--text-main)",
              fontWeight: 700,
              padding: 14,
              whiteSpace: "pre-line",
            },
          }
        );

        edges.push(
          {
            id: `${groupId}->${branchId}`,
            source: groupId,
            target: branchId,
            type: "smoothstep",
          },
          {
            id: `${branchId}->${branchFlowId}`,
            source: branchId,
            target: branchFlowId,
            animated: true,
            type: "smoothstep",
          }
        );

        if (groupSubflows.length > 0) {
          groupSubflows.forEach((subflow, subflowIndex) => {
            const subflowId = `${groupId}:subflow:${subflow.id}`;
            const subflowY = yOffset + subflowIndex * 70;
            const flowLabel = activeFlows.get(String(subflow.flowId || ""))?.label || "Reusable flow";
            nodes.push({
              id: subflowId,
              position: { x: 1320, y: subflowY },
              data: { label: `SUBFLOW\n${subflow.label || "Subflow"}\n${flowLabel}` },
              type: "default",
              style: {
                width: 200,
                borderRadius: 18,
                border: "1px solid var(--border-main)",
                background: "var(--canvas)",
                color: "var(--text-main)",
                fontWeight: 700,
                padding: 14,
                whiteSpace: "pre-line",
              },
            });
            edges.push({
              id: `${branchFlowId}->${subflowId}`,
              source: branchFlowId,
              target: subflowId,
              animated: true,
              type: "smoothstep",
            });
            edges.push({
              id: `${subflowId}->${hubId}`,
              source: subflowId,
              target: hubId,
              type: "smoothstep",
            });
          });
        } else {
          edges.push({
            id: `${branchFlowId}->${hubId}`,
            source: branchFlowId,
            target: hubId,
            type: "smoothstep",
          });
        }
      });

      if (groupBranches.length === 0) {
        edges.push({
          id: `${groupId}->${hubId}`,
          source: groupId,
          target: hubId,
          type: "smoothstep",
        });
      }

      return groupId;
    });

    const branchFlowNodes = enabledBranches.map((branch, branchIndex) => {
      const branchId = `${rule.id}:branch:${branch.id}`;
      const flowId = `${rule.id}:branchflow:${branch.id}`;
      const yOffset = baseY + branchIndex * 110 - ((enabledBranches.length - 1) * 55);
      const flow = activeFlows.get(String(branch.flowId || rule.flowId || "")) || null;
      const flowLabel = flow?.label || flow?.name || "Rule flow";

      nodes.push(
        {
          id: branchId,
          position: { x: 560, y: yOffset },
          data: {
            label: `BRANCH\n${branch.label || "Branch"}\n${branch.matchValue || "Any value"}`,
          },
          type: "default",
          style: {
            width: 210,
            borderRadius: 18,
            border: "1px solid var(--border-main)",
            background: "var(--surface)",
            color: "var(--text-main)",
            fontWeight: 700,
            padding: 14,
            whiteSpace: "pre-line",
          },
        },
        {
          id: flowId,
          position: { x: 820, y: yOffset },
          data: { label: `FLOW\n${flowLabel}` },
          type: "default",
          style: {
            width: 200,
            borderRadius: 18,
            border: "1px solid var(--primary)",
            background: "var(--primary-fade)",
            color: "var(--text-main)",
            fontWeight: 700,
            padding: 14,
            whiteSpace: "pre-line",
          },
        }
      );

      edges.push(
        {
          id: `${decisionId}->${branchId}`,
          source: decisionId,
          target: branchId,
          type: "smoothstep",
        },
        {
          id: `${branchId}->${flowId}`,
          source: branchId,
          target: flowId,
          animated: true,
          type: "smoothstep",
        },
        {
          id: `${flowId}->${hubId}`,
          source: flowId,
          target: hubId,
          type: "smoothstep",
        }
      );

      return { branchId, flowId };
    });

    if (nestedBranchGroups.length === 0 && branchFlowNodes.length === 0) {
      edges.push({
        id: `${decisionId}->${hubId}`,
        source: decisionId,
        target: hubId,
        animated: true,
        type: "smoothstep",
      });
    }

    enabledActions.forEach((action, actionIndex) => {
      const actionId = `${rule.id}:action:${action.id}`;
      const actionY = baseY + actionIndex * 92 - ((enabledActions.length - 1) * 46);
      nodes.push({
        id: actionId,
        position: { x: 1340, y: actionY },
        data: {
          label: `${action.type.replace(/_/g, " ").toUpperCase()}\n${action.flowId || action.leadStatus || action.tag || action.note || "Configured action"}`,
        },
        type: "default",
        style: {
          width: 220,
          borderRadius: 18,
          border: "1px solid var(--border-main)",
          background: "var(--surface)",
          color: "var(--text-main)",
          fontWeight: 700,
          padding: 14,
          whiteSpace: "pre-line",
        },
      });
      edges.push({
        id: `${hubId}->${actionId}`,
        source: hubId,
        target: actionId,
        type: "smoothstep",
      });
    });
  });

  return { nodes, edges };
}

export default function CampaignAutomationPage() {
  const router = useRouter();
  const { campaignId } = router.query;
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);
  const activeProject = useAuthStore((state) => state.activeProject);
  const setActiveProject = useAuthStore((state) => state.setActiveProject);
  const hasWorkspacePermission = useAuthStore((state) => state.hasWorkspacePermission);
  const getProjectRole = useAuthStore((state) => state.getProjectRole);
  const { canViewPage, isReadOnly } = useVisibility();

  const [campaign, setCampaign] = useState<any>(null);
  const [bots, setBots] = useState<any[]>([]);
  const [flowOptions, setFlowOptions] = useState<any[]>([]);
  const [rules, setRules] = useState<AutomationRule[]>([makeRule()]);
  const [canvasNodes, setCanvasNodes] = useState<Node[]>([]);
  const [canvasEdges, setCanvasEdges] = useState<Edge[]>([]);
  const [runtime, setRuntime] = useState<any>(null);
  const [runtimeLoading, setRuntimeLoading] = useState(false);
  const [runtimeError, setRuntimeError] = useState("");
  const [runtimeActionLoading, setRuntimeActionLoading] = useState<string>("");
  const [versionLabel, setVersionLabel] = useState("");
  const [versionNotes, setVersionNotes] = useState("");
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const canViewCampaignPage = canViewPage("campaigns");
  const selectedWorkspaceId =
    campaign?.workspace_id || campaign?.workspaceId || activeWorkspace?.workspace_id || "";
  const selectedProjectId =
    campaign?.project_id || campaign?.projectId || activeProject?.id || "";
  const canEditCampaign = hasWorkspacePermission(selectedWorkspaceId, "edit_campaign");
  const projectRole = getProjectRole(selectedProjectId);
  const canEditProjectCampaign =
    !isReadOnly && (canEditCampaign || projectRole === "project_admin" || projectRole === "editor");
  const automationVersions = Array.isArray(runtime?.versions) ? runtime.versions : [];
  const pendingVersionCount = automationVersions.filter(
    (version: any) => String(version.status || "").toLowerCase() === "pending"
  ).length;
  const approvedVersionCount = automationVersions.filter(
    (version: any) => String(version.status || "").toLowerCase() === "approved"
  ).length;
  const rejectedVersionCount = automationVersions.filter(
    (version: any) => String(version.status || "").toLowerCase() === "rejected"
  ).length;

  const tabs = useMemo(
    () => [
      { label: "Overview", href: `/campaigns/${campaignId}` },
      { label: "Channels", href: `/campaigns/${campaignId}/channels` },
      { label: "Entries", href: `/campaigns/${campaignId}/entries` },
      { label: "Audience", href: `/campaigns/${campaignId}/audience` },
      { label: "Automation", href: `/campaigns/${campaignId}/automation` },
      { label: "Launch", href: `/campaigns/${campaignId}/launch` },
      { label: "Activity", href: `/campaigns/${campaignId}/activity` },
    ],
    [campaignId]
  );

  useEffect(() => {
    if (!campaignId || !canViewCampaignPage) {
      setCampaign(null);
      setBots([]);
      setFlowOptions([]);
      return;
    }

    setLoading(true);
    setError("");
    campaignService
      .get(String(campaignId))
      .then(async (detail) => {
        const campaignDetail = detail as any;
        setCampaign(campaignDetail);

        const workspaceId =
          campaignDetail?.workspace_id || campaignDetail?.workspaceId || activeWorkspace?.workspace_id;
        const projectId =
          campaignDetail?.project_id || campaignDetail?.projectId || activeProject?.id;
        if (projectId && workspaceId && activeProject?.id !== projectId) {
          setActiveProject({
            id: projectId,
            workspace_id: workspaceId,
            name: campaignDetail?.project_name || activeProject?.name || "Project",
            status: campaignDetail?.project_status || activeProject?.status || "active",
          });
        }

        const metadata = campaignDetail?.metadata && typeof campaignDetail.metadata === "object" ? campaignDetail.metadata : {};
        const nextRules = Array.isArray(metadata.automation_rules) && metadata.automation_rules.length > 0
          ? metadata.automation_rules.map((rule: any, index: number) => ({
              id: String(rule?.id || `rule-${index + 1}`),
              name: String(rule?.name || `Rule ${index + 1}`),
              enabled: rule?.enabled !== false,
              type: (String(rule?.type || "date") as AutomationRule["type"]),
              flowId: String(rule?.flowId || rule?.flow_id || ""),
              dateFieldKey: String(rule?.dateFieldKey || rule?.date_field_key || "next_service_date"),
              branchFieldKey: String(rule?.branchFieldKey || rule?.branch_field_key || "status"),
              cronEveryMinutes: String(rule?.cronEveryMinutes || rule?.cron_every_minutes || "60"),
              webhookSecret: String(rule?.webhookSecret || rule?.secret || ""),
              webhookSecretHeader: String(rule?.webhookSecretHeader || "x-automation-secret"),
              webhookPath: String(rule?.webhookPath || ""),
              matchValue: String(rule?.matchValue || rule?.match_value || ""),
              notes: String(rule?.notes || ""),
              branches: Array.isArray(rule?.branches) && rule.branches.length > 0
                ? rule.branches.map((branch: any, branchIndex: number) => ({
                    id: String(branch?.id || `branch-${index + 1}-${branchIndex + 1}`),
                    label: String(branch?.label || `Branch ${branchIndex + 1}`),
                    matchValue: String(branch?.matchValue || branch?.match_value || ""),
                    flowId: String(branch?.flowId || branch?.flow_id || ""),
                    enabled: branch?.enabled !== false,
                  }))
                : [makeBranch()],
              actions: Array.isArray(rule?.actions) && rule.actions.length > 0
                ? rule.actions.map((action: any, actionIndex: number) => ({
                    id: String(action?.id || `action-${index + 1}-${actionIndex + 1}`),
                    type: (String(action?.type || "start_flow") as AutomationAction["type"]),
                    flowId: String(action?.flowId || action?.flow_id || ""),
                    leadStatus: String(action?.leadStatus || action?.lead_status || "qualified"),
                    note: String(action?.note || ""),
                    tag: String(action?.tag || ""),
                    enabled: action?.enabled !== false,
                  }))
                : [makeAction()],
              branchGroups: Array.isArray(rule?.branchGroups) && rule.branchGroups.length > 0
                ? rule.branchGroups.map((group: any, groupIndex: number) => ({
                    id: String(group?.id || `group-${index + 1}-${groupIndex + 1}`),
                    label: String(group?.label || `Nested group ${groupIndex + 1}`),
                    matchFieldKey: String(group?.matchFieldKey || group?.match_field_key || "status"),
                    enabled: group?.enabled !== false,
                    branches: Array.isArray(group?.branches) && group.branches.length > 0
                      ? group.branches.map((branch: any, branchIndex: number) => ({
                          id: String(branch?.id || `group-${index + 1}-${groupIndex + 1}-branch-${branchIndex + 1}`),
                          label: String(branch?.label || `Branch ${branchIndex + 1}`),
                          matchValue: String(branch?.matchValue || branch?.match_value || ""),
                          flowId: String(branch?.flowId || branch?.flow_id || ""),
                          enabled: branch?.enabled !== false,
                        }))
                      : [makeBranch()],
                    subflows: Array.isArray(group?.subflows) && group.subflows.length > 0
                      ? group.subflows.map((subflow: any, subflowIndex: number) => ({
                          id: String(subflow?.id || `group-${index + 1}-${groupIndex + 1}-subflow-${subflowIndex + 1}`),
                          label: String(subflow?.label || `Subflow ${subflowIndex + 1}`),
                          flowId: String(subflow?.flowId || subflow?.flow_id || ""),
                          enabled: subflow?.enabled !== false,
                        }))
                      : [makeSubflow()],
                  }))
                : [],
            }))
          : [makeRule()];
        setRules(nextRules);

        const savedCanvas = metadata.workflow_canvas && typeof metadata.workflow_canvas === "object"
          ? (metadata.workflow_canvas as Record<string, unknown>)
          : null;
        if (savedCanvas) {
          const savedNodes = Array.isArray(savedCanvas.nodes) ? savedCanvas.nodes : [];
          const savedEdges = Array.isArray(savedCanvas.edges) ? savedCanvas.edges : [];
          setCanvasNodes(savedNodes.map((node: any) => ({
            id: String(node.id || ""),
            position: node.position || { x: 0, y: 0 },
            type: node.type || "default",
            data: node.data || { label: String(node.label || node.data?.label || "") },
          })));
          setCanvasEdges(savedEdges.map((edge: any) => ({
            id: String(edge.id || `${edge.source}->${edge.target}`),
            source: String(edge.source || ""),
            target: String(edge.target || ""),
            type: edge.type || "smoothstep",
          })));
        }

        const botRows = await botService.getBots({ workspaceId, projectId }).catch(() => []);
        setBots(botRows);

        const allFlows = await Promise.all(
          botRows.map((bot: any) =>
            flowService
              .getFlowSummaries(bot.id)
              .then((flows) =>
                flows.map((flow: any) => ({
                  ...flow,
                  __botName: bot.name,
                }))
              )
              .catch(() => [])
          )
        );
        setFlowOptions(
          allFlows.flat().map((flow: any) => ({
            id: flow.id,
            label: flow.flow_name || flow.name || "Untitled flow",
            botName: flow.__botName || "",
          }))
        );
      })
      .catch((err: any) => {
        console.error("Failed to load campaign automation", err);
        setError(err?.response?.data?.error || "Failed to load campaign automation");
      })
      .finally(() => setLoading(false));
  }, [campaignId, canViewCampaignPage, activeWorkspace?.workspace_id, activeProject?.id, activeProject?.name, activeProject?.status, setActiveProject]);

  const activeAutomationUrl = (rule: AutomationRule) => {
    if (typeof window === "undefined" || !campaignId || !rule.id) {
      return "";
    }
    return `${window.location.origin}/api/webhook/automation/${campaignId}/${rule.id}`;
  };

  const refreshAutomationRuntime = useCallback(async () => {
    if (!campaignId || !canViewCampaignPage) {
      return;
    }

    setRuntimeLoading(true);
    setRuntimeError("");
    try {
      const data = await campaignService.getAutomationRuntime(String(campaignId));
      setRuntime(data);
      setVersionLabel((current) =>
        current || `${data.versions?.length ? "Snapshot" : "Draft"} ${new Date().toLocaleDateString()}`
      );
    } catch (err: any) {
      console.error("Failed to load automation runtime", err);
      setRuntimeError(err?.response?.data?.error || "Failed to load automation runtime");
    } finally {
      setRuntimeLoading(false);
    }
  }, [campaignId, canViewCampaignPage]);

  useEffect(() => {
    const graph = buildAutomationCanvas(rules, flowOptions);
    setCanvasNodes((current) => mergeNodePositions(graph.nodes, current));
    setCanvasEdges(graph.edges);
  }, [rules, flowOptions]);

  useEffect(() => {
    const firstVersionId = runtime?.versions?.[0]?.id || "";
    if (!selectedVersionId && firstVersionId) {
      setSelectedVersionId(firstVersionId);
    }
  }, [runtime, selectedVersionId]);

  useEffect(() => {
    void refreshAutomationRuntime();
  }, [refreshAutomationRuntime, campaignId, canViewCampaignPage]);

  const handleCanvasNodeChanges = useCallback((changes: NodeChange[]) => {
    setCanvasNodes((current) => applyNodeChanges(changes, current));
  }, []);

  const updateRule = (ruleId: string, patch: Partial<AutomationRule>) => {
    setRules((current) => current.map((rule) => (rule.id === ruleId ? { ...rule, ...patch } : rule)));
  };

  const updateBranch = (ruleId: string, branchId: string, patch: Partial<AutomationBranch>) => {
    setRules((current) =>
      current.map((rule) =>
        rule.id === ruleId
          ? {
              ...rule,
              branches: (rule.branches || []).map((branch) => (branch.id === branchId ? { ...branch, ...patch } : branch)),
            }
          : rule
      )
    );
  };

  const updateAction = (ruleId: string, actionId: string, patch: Partial<AutomationAction>) => {
    setRules((current) =>
      current.map((rule) =>
        rule.id === ruleId
          ? {
              ...rule,
              actions: (rule.actions || []).map((action) => (action.id === actionId ? { ...action, ...patch } : action)),
            }
          : rule
      )
    );
  };

  const updateBranchGroup = (ruleId: string, groupId: string, patch: Partial<AutomationBranchGroup>) => {
    setRules((current) =>
      current.map((rule) =>
        rule.id === ruleId
          ? {
              ...rule,
              branchGroups: (rule.branchGroups || []).map((group) => (group.id === groupId ? { ...group, ...patch } : group)),
            }
          : rule
      )
    );
  };

  const updateBranchGroupBranch = (
    ruleId: string,
    groupId: string,
    branchId: string,
    patch: Partial<AutomationBranch>
  ) => {
    setRules((current) =>
      current.map((rule) =>
        rule.id === ruleId
          ? {
              ...rule,
              branchGroups: (rule.branchGroups || []).map((group) =>
                group.id === groupId
                  ? {
                      ...group,
                      branches: (group.branches || []).map((branch) => (branch.id === branchId ? { ...branch, ...patch } : branch)),
                    }
                  : group
              ),
            }
          : rule
      )
    );
  };

  const updateBranchGroupSubflow = (
    ruleId: string,
    groupId: string,
    subflowId: string,
    patch: Partial<AutomationSubflow>
  ) => {
    setRules((current) =>
      current.map((rule) =>
        rule.id === ruleId
          ? {
              ...rule,
              branchGroups: (rule.branchGroups || []).map((group) =>
                group.id === groupId
                  ? {
                      ...group,
                      subflows: (group.subflows || []).map((subflow) =>
                        subflow.id === subflowId ? { ...subflow, ...patch } : subflow
                      ),
                    }
                  : group
              ),
            }
          : rule
      )
    );
  };

  const addBranchGroup = (ruleId: string) => {
    setRules((current) =>
      current.map((rule) =>
        rule.id === ruleId
          ? { ...rule, branchGroups: [...(rule.branchGroups || []), makeBranchGroup()] }
          : rule
      )
    );
  };

  const removeBranchGroup = (ruleId: string, groupId: string) => {
    setRules((current) =>
      current.map((rule) =>
        rule.id === ruleId
          ? { ...rule, branchGroups: (rule.branchGroups || []).filter((group) => group.id !== groupId) }
          : rule
      )
    );
  };

  const addBranchGroupBranch = (ruleId: string, groupId: string) => {
    setRules((current) =>
      current.map((rule) =>
        rule.id === ruleId
          ? {
              ...rule,
              branchGroups: (rule.branchGroups || []).map((group) =>
                group.id === groupId ? { ...group, branches: [...(group.branches || []), makeBranch()] } : group
              ),
            }
          : rule
      )
    );
  };

  const addBranchGroupSubflow = (ruleId: string, groupId: string) => {
    setRules((current) =>
      current.map((rule) =>
        rule.id === ruleId
          ? {
              ...rule,
              branchGroups: (rule.branchGroups || []).map((group) =>
                group.id === groupId ? { ...group, subflows: [...(group.subflows || []), makeSubflow()] } : group
              ),
            }
          : rule
      )
    );
  };

  const duplicateBranch = (ruleId: string, branchId: string) => {
    setRules((current) =>
      current.map((rule) => {
        if (rule.id !== ruleId) return rule;
        const branches = rule.branches || [];
        const index = branches.findIndex((branch) => branch.id === branchId);
        if (index < 0) return rule;
        const source = branches[index];
        const nextBranch: AutomationBranch = {
          ...source,
          id: `branch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          label: `${source.label || "Branch"} copy`,
          enabled: true,
        };
        const nextBranches = [...branches];
        nextBranches.splice(index + 1, 0, nextBranch);
        return { ...rule, branches: nextBranches };
      })
    );
  };

  const duplicateAction = (ruleId: string, actionId: string) => {
    setRules((current) =>
      current.map((rule) => {
        if (rule.id !== ruleId) return rule;
        const actions = rule.actions || [];
        const index = actions.findIndex((action) => action.id === actionId);
        if (index < 0) return rule;
        const source = actions[index];
        const nextAction: AutomationAction = {
          ...source,
          id: `action-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          enabled: true,
        };
        const nextActions = [...actions];
        nextActions.splice(index + 1, 0, nextAction);
        return { ...rule, actions: nextActions };
      })
    );
  };

  const applyBranchTemplate = (ruleId: string, templateKey: BranchTemplateKey) => {
    const template = BRANCH_TEMPLATES.find((item) => item.key === templateKey);
    if (!template) return;

    setRules((current) =>
      current.map((rule) =>
        rule.id === ruleId
          ? {
              ...rule,
              branchFieldKey: template.branchFieldKey,
              branches: template.branches.map((branch, index) => ({
                id: `branch-${ruleId}-${template.key}-${index + 1}`,
                label: branch.label,
                matchValue: branch.matchValue,
                flowId: rule.flowId || "",
                enabled: true,
              })),
              notes: rule.notes || `Applied ${template.label} branch template.`,
            }
          : rule
      )
    );
  };

  const handleSave = async () => {
    if (!campaignId) return;
    try {
      setSaving(true);
      setError("");
      setSuccess("");
      const nextMetadata = {
        ...(campaign?.metadata && typeof campaign.metadata === "object" ? campaign.metadata : {}),
        automation_rules: rules.map((rule) => ({
          ...rule,
          webhookPath: rule.webhookPath || `/api/webhook/automation/${campaignId}/${rule.id}`,
        })),
        workflow_canvas: {
          nodes: canvasNodes.map((node) => ({
            id: node.id,
            position: node.position,
            type: node.type || "default",
            data: node.data,
          })),
          edges: canvasEdges.map((edge: any) => ({
            id: edge.id,
            source: edge.source,
            target: edge.target,
            type: edge.type || "smoothstep",
          })),
        },
      };
      const saved = await campaignService.update(String(campaignId), { metadata: nextMetadata });
      setCampaign((current: any) => ({ ...current, ...saved, metadata: nextMetadata }));
      setSuccess("Automation rules saved.");
      void refreshAutomationRuntime();
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to save automation rules");
    } finally {
      setSaving(false);
    }
  };

  const handleRuntimeAction = async (actionKey: string, action: () => Promise<any>) => {
    if (!campaignId) return;
    setRuntimeActionLoading(actionKey);
    setRuntimeError("");
    try {
      await action();
      await refreshAutomationRuntime();
    } catch (err: any) {
      setRuntimeError(err?.response?.data?.error || "Automation action failed");
    } finally {
      setRuntimeActionLoading("");
    }
  };

  const handleSaveVersion = async () => {
    if (!campaignId) return;
    const label = String(versionLabel || "").trim() || `Version ${((runtime?.versions?.length || 0) + 1)}`;
    await handleRuntimeAction("save-version", async () => {
      await campaignService.saveAutomationVersion(String(campaignId), {
        label,
        notes: versionNotes,
        status: "pending",
      });
      setVersionLabel("");
      setVersionNotes("");
      setSuccess("Automation version saved.");
    });
  };

  return (
    <DashboardLayout>
      {!canViewCampaignPage ? (
        <PageAccessNotice
          title="Campaign automation is restricted for this role"
          description="Campaign pages are only available to users with campaign or assigned project access."
          href="/campaigns"
          ctaLabel="Open campaigns"
        />
      ) : (
        <div className="mx-auto max-w-7xl space-y-6">
          <BackButtonStrip href={`/campaigns/${campaignId}/launch`} label="Back to launch" />
          <CampaignHeader
            campaignName={campaign?.name}
            pageTitle="Campaign Automation"
            description="Set up rules, bot flows, and automated responses."
            tabs={tabs}
            currentPath={router.asPath.split("?")[0] || ""}
          />

          {error ? <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</section> : null}
          {success ? <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{success}</section> : null}

          <section className="flex flex-col flex-1 min-h-[800px] h-auto bg-surface border border-border-main rounded-[2rem] p-8 pb-16 shadow-sm mb-12">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                  Workflow Canvas
                </div>
                <div className="mt-1 text-sm text-text-muted">
                  Drag the trigger, branch, flow, and action nodes to shape the campaign runtime.
                </div>
              </div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                {canvasNodes.length} nodes · {canvasEdges.length} edges
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-4">
              {[
                { label: "Trigger", tone: "bg-surface", accent: "border-border-main" },
                { label: "Branch", tone: "bg-primary-fade", accent: "border-primary" },
                { label: "Flow", tone: "bg-surface", accent: "border-primary/40" },
                { label: "Action", tone: "bg-canvas", accent: "border-border-main" },
              ].map((item) => (
                <div key={item.label} className={`rounded-2xl border ${item.accent} ${item.tone} px-4 py-3`}>
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">{item.label}</div>
                  <div className="mt-1 text-sm text-text-main">
                    {item.label === "Branch"
                      ? "Route leads using nested branch paths."
                      : item.label === "Action"
                        ? "Update lead state or trigger downstream steps."
                        : item.label === "Flow"
                          ? "Reusable flow targets for each branch."
                          : "Date, cron, or webhook trigger points."}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-5 min-h-[540px] overflow-hidden rounded-2xl border border-border-main bg-canvas">
              <ReactFlow
                nodes={canvasNodes}
                edges={canvasEdges}
                onNodesChange={handleCanvasNodeChanges}
                fitView
                minZoom={0.3}
                maxZoom={1.4}
                proOptions={{ hideAttribution: true }}
              >
                <Background color="var(--border-main)" gap={22} size={1} />
                <Controls className="mb-4 ml-4 shadow-xl border-none" />
                <MiniMap
                  nodeStrokeColor="var(--border-main)"
                  nodeColor="var(--primary)"
                  pannable
                  zoomable
                />
              </ReactFlow>
            </div>
          </section>

          <section className="flex flex-col flex-1 min-h-[800px] h-auto bg-surface border border-border-main rounded-[2rem] p-8 pb-16 shadow-sm mb-12">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                  Automation Ops
                </div>
                <div className="mt-1 text-sm text-text-muted">
                  Run history, pause/resume, replay, dead-letter visibility, and workflow versions live here.
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={versionLabel}
                  onChange={(event) => setVersionLabel(event.target.value)}
                  placeholder="Version label"
                  className="rounded-2xl border border-border-main bg-canvas px-4 py-2 text-sm text-text-main outline-none"
                />
                <input
                  value={versionNotes}
                  onChange={(event) => setVersionNotes(event.target.value)}
                  placeholder="Snapshot notes"
                  className="rounded-2xl border border-border-main bg-canvas px-4 py-2 text-sm text-text-main outline-none"
                />
                <button
                  type="button"
                  onClick={handleSaveVersion}
                  disabled={!canEditProjectCampaign || runtimeActionLoading === "save-version"}
                  className="rounded-2xl border border-primary bg-primary px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {runtimeActionLoading === "save-version" ? "Saving..." : "Save version"}
                </button>
              </div>
            </div>

            {runtimeError ? (
              <div className="mt-4 rounded-2xl border border-rose-300/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-700">
                {runtimeError}
              </div>
            ) : null}

            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-border-main bg-canvas px-4 py-3">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">Rules</div>
                <div className="mt-1 text-lg font-semibold text-text-main">{runtime?.rules?.length || rules.length}</div>
              </div>
              <div className="rounded-2xl border border-border-main bg-canvas px-4 py-3">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">History</div>
                <div className="mt-1 text-lg font-semibold text-text-main">{runtimeLoading ? "..." : runtime?.history?.length || 0}</div>
              </div>
              <div className="rounded-2xl border border-border-main bg-canvas px-4 py-3">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">Versions</div>
                <div className="mt-1 text-lg font-semibold text-text-main">{runtime?.versions?.length || 0}</div>
              </div>
              <div className="rounded-2xl border border-border-main bg-canvas px-4 py-3">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">Segments</div>
                <div className="mt-1 text-lg font-semibold text-text-main">{runtime?.segmentLibrary?.length || 0}</div>
              </div>
            </div>

            <div className="mt-5 grid gap-4 xl:grid-cols-[1.6fr_1fr]">
              <div className="space-y-3">
                {(runtime?.rules || rules).map((rule: any) => {
                  const ruleHistory = Array.isArray(rule.history) ? rule.history : [];
                  const lastRun = ruleHistory[0] || null;
                  const isPaused = Boolean(rule.paused || rule.enabled === false);
                  return (
                    <div key={rule.id} className="bg-canvas border border-border-main rounded-2xl p-6 mb-6 flex flex-col gap-6">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-xs font-black uppercase tracking-[0.18em] text-text-muted">{rule.type}</div>
                          <div className="mt-1 text-sm font-semibold text-text-main">{rule.name}</div>
                          <div className="mt-1 text-xs text-text-muted">
                            {rule.failedRuns || 0} failed runs · {rule.deadLetters || 0} dead letters
                            {lastRun ? ` · last ${String(lastRun.status || "completed")}` : ""}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/campaigns/${campaignId}/automation/runs/${rule.id}`}
                            className="rounded-2xl border border-border-main bg-surface py-2 px-4 text-[10px] font-bold uppercase tracking-widest text-text-main transition-colors hover:border-primary hover:text-primary"
                          >
                            Run history
                          </Link>
                          <button
                            type="button"
                            onClick={() =>
                              handleRuntimeAction(`pause-${rule.id}`, () => campaignService.pauseAutomationRule(String(campaignId), String(rule.id)))
                            }
                            disabled={!canEditProjectCampaign || isPaused || runtimeActionLoading === `pause-${rule.id}`}
                            className="rounded-2xl border border-border-main bg-surface py-2 px-4 text-[10px] font-bold uppercase tracking-widest text-text-main transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Pause
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleRuntimeAction(`resume-${rule.id}`, () => campaignService.resumeAutomationRule(String(campaignId), String(rule.id)))
                            }
                            disabled={!canEditProjectCampaign || !isPaused || runtimeActionLoading === `resume-${rule.id}`}
                            className="rounded-2xl border border-primary bg-primary py-2 px-4 text-[10px] font-black uppercase tracking-[0.15em] text-white shadow-sm transition-all hover:-translate-y-0.5 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Resume
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleRuntimeAction(`clone-${rule.id}`, () => campaignService.cloneAutomationRule(String(campaignId), String(rule.id)))
                            }
                            disabled={!canEditProjectCampaign || runtimeActionLoading === `clone-${rule.id}`}
                            className="rounded-2xl border border-border-main bg-surface py-2 px-4 text-[10px] font-bold uppercase tracking-widest text-text-main transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Clone
                          </button>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-3">
                        <div className="rounded-xl border border-border-main bg-surface px-4 py-3">
                          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">Flow</div>
                          <div className="mt-1 text-sm font-semibold text-text-main">{rule.flowId || "Use branch flow"}</div>
                        </div>
                        <div className="rounded-xl border border-border-main bg-surface px-4 py-3">
                          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">Schedule</div>
                          <div className="mt-1 text-sm font-semibold text-text-main">{rule.cronEveryMinutes ? `${rule.cronEveryMinutes} min` : rule.dateFieldKey || "webhook"}</div>
                        </div>
                        <div className="rounded-xl border border-border-main bg-surface px-4 py-3">
                          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">Webhook</div>
                          <div className="mt-1 text-sm font-semibold text-text-main">{rule.webhookPath || "Generated on save"}</div>
                        </div>
                      </div>

                      <div className="rounded-xl border border-border-main bg-surface p-4">
                        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">Recent runs</div>
                        <div className="mt-3 space-y-2">
                          {ruleHistory.slice(0, 3).map((entry: any) => (
                            <div key={entry.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-main bg-canvas px-4 py-3 text-xs">
                              <div>
                                <span className="font-semibold text-text-main">{entry.leadName || entry.summary || entry.id}</span>
                                <span className="ml-2 text-text-muted">{String(entry.status || "completed")}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                {entry.leadId ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleRuntimeAction(`replay-${rule.id}-${entry.leadId}`, () =>
                                        campaignService.replayAutomationRule(String(campaignId), String(rule.id), String(entry.leadId))
                                      )
                                    }
                                    disabled={!canEditProjectCampaign || runtimeActionLoading === `replay-${rule.id}-${entry.leadId}`}
                                    className="rounded-2xl border border-primary bg-primary py-2 px-4 text-[10px] font-black uppercase tracking-[0.15em] text-white shadow-sm transition-all hover:-translate-y-0.5 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    Replay
                                  </button>
                                ) : null}
                                <span className="text-text-muted">{String(entry.createdAt || "").slice(0, 19).replace("T", " ")}</span>
                              </div>
                            </div>
                          ))}
                          {ruleHistory.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-border-main bg-canvas px-3 py-3 text-xs text-text-muted">
                              No run history yet. Save a version or wait for the next automation tick.
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-3">
                <div className="rounded-2xl border border-border-main bg-canvas p-4">
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">Version library</div>
                  <div className="mt-3 grid gap-3 md:grid-cols-4">
                    {[
                      { label: "Total versions", value: automationVersions.length },
                      { label: "Pending review", value: pendingVersionCount },
                      { label: "Approved", value: approvedVersionCount },
                      { label: "Rejected", value: rejectedVersionCount },
                    ].map((stat) => (
                      <div key={stat.label} className="rounded-xl border border-border-main bg-surface px-3 py-3">
                        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">{stat.label}</div>
                        <div className="mt-1 text-lg font-semibold text-text-main">{stat.value}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 rounded-2xl border border-border-main bg-surface p-3">
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">Approval timeline</div>
                    <div className="mt-3 space-y-2">
                      {automationVersions.slice(0, 4).map((version: any) => (
                        <button
                          key={`timeline-${version.id}`}
                          type="button"
                          onClick={() => setSelectedVersionId(version.id)}
                          className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                            selectedVersionId === version.id
                              ? "border-primary bg-primary-fade"
                              : "border-border-main bg-canvas hover:border-primary/30"
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-sm font-semibold text-text-main">{version.label}</div>
                            <div className="text-[10px] uppercase tracking-[0.18em] text-text-muted">{version.status}</div>
                          </div>
                          <div className="mt-1 text-xs text-text-muted">
                            {version.sourceRuleName || "Rule snapshot"} · {String(version.createdAt || "").slice(0, 19).replace("T", " ")}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-[0.18em]">
                            <span className="rounded-full border border-border-main bg-canvas px-2 py-1 text-text-muted">
                              {version.sourceRuleId ? "Cloned" : "Original"}
                            </span>
                            <span className="rounded-full border border-border-main bg-canvas px-2 py-1 text-text-muted">
                              {version.updatedAt ? `Updated ${String(version.updatedAt).slice(0, 10)}` : "Fresh"}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="mt-3 space-y-3">
                    {automationVersions.map((version: any) => (
                      <button
                        key={version.id}
                        type="button"
                        onClick={() => setSelectedVersionId(version.id)}
                        className={`w-full rounded-xl border p-3 text-left transition ${
                          selectedVersionId === version.id
                            ? "border-primary bg-primary-fade"
                            : "border-border-main bg-surface hover:border-primary/30"
                        }`}
                      >
                          <div className="flex items-center justify-between gap-2">
                          <div>
                            <div className="text-sm font-semibold text-text-main">{version.label}</div>
                            <div className="text-[10px] uppercase tracking-[0.18em] text-text-muted">{version.status}</div>
                          </div>
                        </div>
                        <div className="mt-2 text-xs leading-5 text-text-muted">{version.notes || "No notes provided."}</div>
                        <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-[0.18em]">
                          <span className="rounded-full border border-border-main bg-canvas px-2 py-1 text-text-muted">
                            +{version.diffSummary?.rulesAdded || 0} rules
                          </span>
                          <span className="rounded-full border border-border-main bg-canvas px-2 py-1 text-text-muted">
                            -{version.diffSummary?.rulesRemoved || 0} rules
                          </span>
                          <span className="rounded-full border border-border-main bg-canvas px-2 py-1 text-text-muted">
                            {version.diffSummary?.rulesChanged || 0} changed
                          </span>
                        </div>
                      </button>
                    ))}
                    {(runtime?.versions || []).length === 0 ? (
                      <div className="rounded-xl border border-dashed border-border-main bg-surface px-3 py-3 text-xs text-text-muted">
                        No saved workflow versions yet.
                      </div>
                    ) : null}
                  </div>
                </div>

                {(() => {
                  const selectedIndex = automationVersions.findIndex((version: any) => version.id === selectedVersionId);
                  const selectedVersion = automationVersions.find((version: any) => version.id === selectedVersionId) || null;
                  if (!selectedVersion) {
                    return null;
                  }
                  const previousVersion = selectedIndex >= 0 ? automationVersions[selectedIndex + 1] || null : null;

                  return (
                    <div className="rounded-2xl border border-border-main bg-canvas p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">Review diff</div>
                          <div className="mt-1 text-sm font-semibold text-text-main">{selectedVersion.label}</div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {(["draft", "pending", "approved", "rejected"] as const).map((status) => (
                            <button
                              key={status}
                              type="button"
                              onClick={() =>
                                handleRuntimeAction(`version-${selectedVersion.id}-${status}`, () =>
                                  campaignService.setAutomationVersionStatus(String(campaignId), String(selectedVersion.id), status)
                                )
                              }
                              disabled={!canEditProjectCampaign || runtimeActionLoading === `version-${selectedVersion.id}-${status}`}
                              className={`rounded-full border px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] disabled:cursor-not-allowed disabled:opacity-50 ${
                                selectedVersion.status === status
                                  ? "border-primary bg-primary-fade text-primary"
                                  : "border-border-main bg-surface text-text-muted"
                              }`}
                            >
                              {status}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <div className="rounded-xl border border-border-main bg-surface px-3 py-3 text-sm text-text-muted">
                          {selectedVersion.diffSummary?.note || "No diff summary available."}
                        </div>
                        <div className="rounded-xl border border-border-main bg-surface px-3 py-3 text-sm text-text-muted">
                          Rules: +{selectedVersion.diffSummary?.rulesAdded || 0} / -{selectedVersion.diffSummary?.rulesRemoved || 0} / changed {selectedVersion.diffSummary?.rulesChanged || 0}
                        </div>
                      </div>
                      <div className="mt-3 rounded-xl border border-border-main bg-surface px-3 py-3 text-xs leading-5 text-text-muted">
                        Branch changes: {selectedVersion.diffSummary?.branchesChanged || 0} · Action changes: {selectedVersion.diffSummary?.actionsChanged || 0}
                      </div>
                      <div className="mt-3 rounded-xl border border-border-main bg-surface px-3 py-3 text-xs leading-5 text-text-muted">
                        Compared against: {previousVersion?.label || "Initial snapshot"} · Approval target: {selectedVersion.status || "draft"}
                      </div>
                    </div>
                  );
                })()}

                <div className="rounded-2xl border border-border-main bg-canvas p-4">
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">Reusable segments</div>
                  <div className="mt-3 space-y-2">
                    {(runtime?.segmentLibrary || []).map((segment: any) => (
                      <div key={segment.id} className="rounded-xl border border-border-main bg-surface px-3 py-2 text-sm text-text-main">
                        {segment.name}
                      </div>
                    ))}
                    {(runtime?.segmentLibrary || []).length === 0 ? (
                      <div className="rounded-xl border border-dashed border-border-main bg-surface px-3 py-3 text-xs text-text-muted">
                        No reusable segments detected yet.
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="flex flex-col flex-1 min-h-[800px] h-auto bg-surface border border-border-main rounded-[2rem] p-8 pb-16 shadow-sm mb-12">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">Automation Rules</div>
                <div className="mt-1 text-sm text-text-muted">
                  {loading ? "Loading..." : `${rules.length} rule${rules.length === 1 ? "" : "s"} configured`}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setRules((current) => [...current, makeRule()])}
                  className="rounded-2xl border border-border-main bg-surface py-2 px-4 text-[10px] font-bold uppercase tracking-widest text-text-main transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!canEditProjectCampaign}
                >
                  Add rule
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  className="w-full md:w-auto rounded-2xl border border-primary bg-primary py-3 px-8 text-[10px] font-black uppercase tracking-[0.15em] text-white shadow-sm transition-all hover:-translate-y-0.5 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!canEditProjectCampaign || saving}
                >
                  {saving ? "Saving..." : "Save automation"}
                </button>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              {rules.map((rule, index) => {
                const generatedUrl = activeAutomationUrl(rule);
                const branchCount = (rule.branches || []).filter((branch) => branch.enabled !== false).length;
                const actionCount = (rule.actions || []).filter((action) => action.enabled !== false).length;
                return (
                  <div key={rule.id} className="rounded-[1.3rem] border border-border-main bg-canvas p-4 shadow-sm">
                    <div className="grid gap-3 lg:grid-cols-4">
                      <div className="rounded-2xl border border-border-main bg-surface px-4 py-3">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">Trigger</div>
                        <div className="mt-1 text-sm font-semibold text-text-main">
                          {rule.type === "date" ? "Date rule" : rule.type === "webhook" ? "Webhook rule" : "Cron rule"}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-border-main bg-surface px-4 py-3">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">Branches</div>
                        <div className="mt-1 text-sm font-semibold text-text-main">{branchCount} active</div>
                      </div>
                      <div className="rounded-2xl border border-border-main bg-surface px-4 py-3">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">Actions</div>
                        <div className="mt-1 text-sm font-semibold text-text-main">{actionCount} active</div>
                      </div>
                      <div className="rounded-2xl border border-border-main bg-surface px-4 py-3">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">Flow</div>
                        <div className="mt-1 text-sm font-semibold text-text-main">
                          {rule.flowId ? "Linked" : "Default campaign flow"}
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                          Rule name
                        </label>
                        <input
                          className="w-full rounded-xl border border-border-main bg-surface px-4 py-3 text-sm text-text-main outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary"
                          value={rule.name}
                          disabled={!canEditProjectCampaign}
                          onChange={(event) => updateRule(rule.id, { name: event.target.value })}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                          Trigger type
                        </label>
                        <select
                          className="w-full rounded-2xl border border-border-main bg-surface px-4 py-3 text-sm text-text-main outline-none"
                          value={rule.type}
                          disabled={!canEditProjectCampaign}
                          onChange={(event) =>
                            updateRule(rule.id, { type: event.target.value as AutomationRule["type"] })
                          }
                        >
                          <option value="date">Date trigger</option>
                          <option value="webhook">Webhook trigger</option>
                          <option value="cron">Cron trigger</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                          Flow
                        </label>
                        <select
                          className="w-full rounded-2xl border border-border-main bg-surface px-4 py-3 text-sm text-text-main outline-none"
                          value={rule.flowId}
                          disabled={!canEditProjectCampaign}
                          onChange={(event) => updateRule(rule.id, { flowId: event.target.value })}
                        >
                          <option value="">Use default campaign flow</option>
                          {flowOptions.map((flow) => (
                            <option key={flow.id} value={flow.id}>
                              {flow.label}{flow.botName ? ` - ${flow.botName}` : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                          Enabled
                        </label>
                        <button
                          type="button"
                          onClick={() => updateRule(rule.id, { enabled: !rule.enabled })}
                          className={`w-full rounded-2xl border px-4 py-3 text-sm font-semibold ${
                            rule.enabled
                              ? "border-primary bg-primary-fade text-primary"
                              : "border-border-main bg-surface text-text-muted"
                          }`}
                          disabled={!canEditProjectCampaign}
                        >
                          {rule.enabled ? "Enabled" : "Disabled"}
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-4 lg:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                          Date field key
                        </label>
                        <input
                          className="w-full rounded-xl border border-border-main bg-surface px-4 py-3 text-sm text-text-main outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary"
                          value={rule.dateFieldKey}
                          disabled={!canEditProjectCampaign}
                          onChange={(event) => updateRule(rule.id, { dateFieldKey: event.target.value })}
                          placeholder="next_service_date"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                          Match value
                        </label>
                        <input
                          className="w-full rounded-2xl border border-border-main bg-surface px-4 py-3 text-sm text-text-main outline-none"
                          value={rule.matchValue}
                          disabled={!canEditProjectCampaign}
                          onChange={(event) => updateRule(rule.id, { matchValue: event.target.value })}
                          placeholder="Optional exact match"
                        />
                      </div>
                    </div>

                    <div className="mt-4 grid gap-4 lg:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                          Branch field key
                        </label>
                        <input
                          className="w-full rounded-2xl border border-border-main bg-surface px-4 py-3 text-sm text-text-main outline-none"
                          value={rule.branchFieldKey}
                          disabled={!canEditProjectCampaign}
                          onChange={(event) => updateRule(rule.id, { branchFieldKey: event.target.value })}
                          placeholder="status"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                          Cron interval (minutes)
                        </label>
                        <input
                          type="number"
                          min="10"
                          step="10"
                          className="w-full rounded-xl border border-border-main bg-surface px-4 py-3 text-sm text-text-main outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary"
                          value={rule.cronEveryMinutes}
                          disabled={!canEditProjectCampaign || rule.type !== "cron"}
                          onChange={(event) => updateRule(rule.id, { cronEveryMinutes: event.target.value })}
                          placeholder="60"
                        />
                      </div>
                    </div>

                    <div className="mt-4 rounded-2xl border border-border-main bg-surface p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                            Branches
                          </div>
                          <div className="mt-1 text-sm text-text-muted">
                            Route a lead to a flow based on the branch field value.
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            className="rounded-xl border border-border-main bg-surface px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-text-main outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary"
                            value=""
                            onChange={(event) => {
                              const templateKey = event.target.value as BranchTemplateKey;
                              if (templateKey) {
                                applyBranchTemplate(rule.id, templateKey);
                              }
                              event.target.value = "";
                            }}
                            disabled={!canEditProjectCampaign}
                          >
                            <option value="">Branch templates</option>
                            {BRANCH_TEMPLATES.map((template) => (
                              <option key={template.key} value={template.key}>
                                {template.label}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => updateRule(rule.id, { branches: [...(rule.branches || []), makeBranch()] })}
                            disabled={!canEditProjectCampaign}
                            className="rounded-2xl border border-border-main bg-surface py-2 px-4 text-[10px] font-bold uppercase tracking-widest text-text-main transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Add branch
                          </button>
                        </div>
                      </div>
                      <div className="mt-4 space-y-3">
                        {(rule.branches || []).map((branch) => (
                          <div key={branch.id} className="grid gap-3 rounded-2xl border border-border-main bg-canvas p-3 lg:grid-cols-4">
                            <input
                              className="rounded-xl border border-border-main bg-surface px-3 py-2 text-sm text-text-main outline-none"
                              value={branch.label}
                              disabled={!canEditProjectCampaign}
                              onChange={(event) => updateBranch(rule.id, branch.id, { label: event.target.value })}
                              placeholder="Branch label"
                            />
                            <input
                              className="rounded-xl border border-border-main bg-surface px-3 py-2 text-sm text-text-main outline-none"
                              value={branch.matchValue}
                              disabled={!canEditProjectCampaign}
                              onChange={(event) => updateBranch(rule.id, branch.id, { matchValue: event.target.value })}
                              placeholder="Match value"
                            />
                            <select
                              className="rounded-xl border border-border-main bg-surface px-3 py-2 text-sm text-text-main outline-none"
                              value={branch.flowId}
                              disabled={!canEditProjectCampaign}
                              onChange={(event) => updateBranch(rule.id, branch.id, { flowId: event.target.value })}
                            >
                              <option value="">Use rule flow</option>
                              {flowOptions.map((flow) => (
                                <option key={flow.id} value={flow.id}>
                                  {flow.label}{flow.botName ? ` - ${flow.botName}` : ""}
                                </option>
                              ))}
                            </select>
                            <div className="flex items-center justify-between gap-2">
                              <button
                                type="button"
                                onClick={() => updateBranch(rule.id, branch.id, { enabled: !branch.enabled })}
                                disabled={!canEditProjectCampaign}
                                className={`rounded-full border px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] ${
                                  branch.enabled
                                    ? "border-primary bg-primary-fade text-primary"
                                    : "border-border-main bg-surface text-text-muted"
                                }`}
                              >
                                {branch.enabled ? "Enabled" : "Disabled"}
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  updateRule(rule.id, {
                                    branches: (rule.branches || []).filter((item) => item.id !== branch.id),
                                  })
                                }
                                disabled={!canEditProjectCampaign || (rule.branches || []).length === 1}
                                className="rounded-full border border-rose-300/30 bg-rose-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Remove
                              </button>
                              <button
                                type="button"
                                onClick={() => duplicateBranch(rule.id, branch.id)}
                                disabled={!canEditProjectCampaign}
                                className="rounded-full border border-border-main bg-surface px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-text-muted disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Duplicate
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-4 rounded-2xl border border-border-main bg-surface p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                            Nested branch groups
                          </div>
                          <div className="mt-1 text-sm text-text-muted">
                            Build reusable branch blocks with their own branches and subflow handoffs.
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => addBranchGroup(rule.id)}
                          disabled={!canEditProjectCampaign}
                          className="rounded-full border border-border-main bg-canvas px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-text-main transition hover:border-primary/30 hover:bg-primary-fade hover:text-primary"
                        >
                          Add group
                        </button>
                      </div>
                      <div className="mt-4 space-y-4">
                        {(rule.branchGroups || []).map((group) => (
                          <div key={group.id} className="rounded-2xl border border-border-main bg-canvas p-6">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div className="grid gap-3 md:grid-cols-3 flex-1">
                                <input
                                  className="rounded-xl border border-border-main bg-surface px-4 py-3 text-sm text-text-main outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary"
                                  value={group.label}
                                  disabled={!canEditProjectCampaign}
                                  onChange={(event) => updateBranchGroup(rule.id, group.id, { label: event.target.value })}
                                  placeholder="Group label"
                                />
                                <input
                                  className="rounded-xl border border-border-main bg-surface px-4 py-3 text-sm text-text-main outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary"
                                  value={group.matchFieldKey}
                                  disabled={!canEditProjectCampaign}
                                  onChange={(event) => updateBranchGroup(rule.id, group.id, { matchFieldKey: event.target.value })}
                                  placeholder="Match field key"
                                />
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => updateBranchGroup(rule.id, group.id, { enabled: !group.enabled })}
                                    disabled={!canEditProjectCampaign}
                                    className={`rounded-2xl border px-3 py-2 text-[10px] font-bold uppercase tracking-widest ${
                                      group.enabled
                                        ? "border-primary bg-primary-fade text-primary"
                                        : "border-border-main bg-surface text-text-muted"
                                    }`}
                                  >
                                    {group.enabled ? "Enabled" : "Disabled"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => removeBranchGroup(rule.id, group.id)}
                                    disabled={!canEditProjectCampaign || (rule.branchGroups || []).length === 1}
                                    className="text-[10px] font-bold uppercase tracking-widest text-red-500 transition-colors hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    Remove
                                  </button>
                                </div>
                              </div>
                            </div>
                            <div className="mt-4 grid gap-4 xl:grid-cols-2">
                              <div className="rounded-2xl border border-border-main bg-surface p-3">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">
                                    Nested branches
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => addBranchGroupBranch(rule.id, group.id)}
                                    disabled={!canEditProjectCampaign}
                                    className="rounded-2xl border border-border-main bg-surface py-2 px-4 text-[10px] font-bold uppercase tracking-widest text-text-main transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    Add branch
                                  </button>
                                </div>
                                <div className="mt-3 space-y-2">
                                  {(group.branches || []).map((branch) => (
                                    <div key={branch.id} className="grid gap-3 rounded-xl border border-border-main bg-canvas p-4 lg:grid-cols-3">
                                      <input
                                        className="rounded-xl border border-border-main bg-surface px-4 py-3 text-sm text-text-main outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary"
                                        value={branch.label}
                                        disabled={!canEditProjectCampaign}
                                        onChange={(event) => updateBranchGroupBranch(rule.id, group.id, branch.id, { label: event.target.value })}
                                        placeholder="Branch label"
                                      />
                                      <input
                                        className="rounded-xl border border-border-main bg-surface px-4 py-3 text-sm text-text-main outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary"
                                        value={branch.matchValue}
                                        disabled={!canEditProjectCampaign}
                                        onChange={(event) => updateBranchGroupBranch(rule.id, group.id, branch.id, { matchValue: event.target.value })}
                                        placeholder="Match value"
                                      />
                                      <div className="flex items-center justify-between gap-2">
                                        <button
                                          type="button"
                                          onClick={() => updateBranchGroupBranch(rule.id, group.id, branch.id, { enabled: !branch.enabled })}
                                          disabled={!canEditProjectCampaign}
                                          className={`rounded-2xl border px-3 py-2 text-[10px] font-bold uppercase tracking-widest ${
                                            branch.enabled
                                              ? "border-primary bg-primary-fade text-primary"
                                              : "border-border-main bg-surface text-text-muted"
                                          }`}
                                        >
                                          {branch.enabled ? "Enabled" : "Disabled"}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            updateBranchGroup(rule.id, group.id, {
                                              branches: (group.branches || []).filter((item) => item.id !== branch.id),
                                            })
                                          }
                                          disabled={!canEditProjectCampaign || (group.branches || []).length === 1}
                                          className="text-[10px] font-bold uppercase tracking-widest text-red-500 transition-colors hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                          Remove
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <div className="rounded-2xl border border-border-main bg-surface p-3">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">
                                    Subflow blocks
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => addBranchGroupSubflow(rule.id, group.id)}
                                    disabled={!canEditProjectCampaign}
                                    className="rounded-2xl border border-border-main bg-surface py-2 px-4 text-[10px] font-bold uppercase tracking-widest text-text-main transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    Add subflow
                                  </button>
                                </div>
                                <div className="mt-3 space-y-2">
                                  {(group.subflows || []).map((subflow) => (
                                    <div key={subflow.id} className="grid gap-3 rounded-xl border border-border-main bg-canvas p-4 lg:grid-cols-3">
                                      <input
                                        className="rounded-xl border border-border-main bg-surface px-4 py-3 text-sm text-text-main outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary"
                                        value={subflow.label}
                                        disabled={!canEditProjectCampaign}
                                        onChange={(event) => updateBranchGroupSubflow(rule.id, group.id, subflow.id, { label: event.target.value })}
                                        placeholder="Subflow label"
                                      />
                                      <select
                                        className="rounded-xl border border-border-main bg-surface px-4 py-3 text-sm text-text-main outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary"
                                        value={subflow.flowId}
                                        disabled={!canEditProjectCampaign}
                                        onChange={(event) => updateBranchGroupSubflow(rule.id, group.id, subflow.id, { flowId: event.target.value })}
                                      >
                                        <option value="">Reusable flow</option>
                                        {flowOptions.map((flow) => (
                                          <option key={flow.id} value={flow.id}>
                                            {flow.label}{flow.botName ? ` - ${flow.botName}` : ""}
                                          </option>
                                        ))}
                                      </select>
                                      <div className="flex items-center justify-between gap-2">
                                        <button
                                          type="button"
                                          onClick={() => updateBranchGroupSubflow(rule.id, group.id, subflow.id, { enabled: !subflow.enabled })}
                                          disabled={!canEditProjectCampaign}
                                          className={`rounded-2xl border px-3 py-2 text-[10px] font-bold uppercase tracking-widest ${
                                            subflow.enabled
                                              ? "border-primary bg-primary-fade text-primary"
                                              : "border-border-main bg-surface text-text-muted"
                                          }`}
                                        >
                                          {subflow.enabled ? "Enabled" : "Disabled"}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            updateBranchGroup(rule.id, group.id, {
                                              subflows: (group.subflows || []).filter((item) => item.id !== subflow.id),
                                            })
                                          }
                                          disabled={!canEditProjectCampaign || (group.subflows || []).length === 1}
                                          className="text-[10px] font-bold uppercase tracking-widest text-red-500 transition-colors hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                          Remove
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                        {(rule.branchGroups || []).length === 0 ? (
                          <div className="rounded-xl border border-dashed border-border-main bg-surface px-4 py-4 text-sm text-text-muted">
                            No nested groups yet. Add one to build reusable branch compositions or subflow handoffs.
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-4 rounded-2xl border border-border-main bg-surface p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                            Actions
                          </div>
                          <div className="mt-1 text-sm text-text-muted">
                            Trigger flows, update lead state, add notes, or tag the record after the rule fires.
                          </div>
                        </div>
                  <button
                    type="button"
                    onClick={() => updateRule(rule.id, { actions: [...(rule.actions || []), makeAction()] })}
                    disabled={!canEditProjectCampaign}
                    className="rounded-2xl border border-border-main bg-surface py-2 px-4 text-[10px] font-bold uppercase tracking-widest text-text-main transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                  >
                          Add action
                        </button>
                      </div>
                      <div className="mt-4 space-y-3">
                        {(rule.actions || []).map((action) => (
                        <div key={action.id} className="grid gap-3 rounded-2xl border border-border-main bg-canvas p-4 lg:grid-cols-5">
                            <select
                              className="rounded-xl border border-border-main bg-surface px-4 py-3 text-sm text-text-main outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary"
                              value={action.type}
                              disabled={!canEditProjectCampaign}
                              onChange={(event) =>
                                updateAction(rule.id, action.id, { type: event.target.value as AutomationAction["type"] })
                              }
                            >
                              <option value="start_flow">Start flow</option>
                              <option value="update_lead_status">Update lead status</option>
                              <option value="add_note">Add note</option>
                              <option value="tag_lead">Tag lead</option>
                            </select>
                            <input
                              className="rounded-xl border border-border-main bg-surface px-4 py-3 text-sm text-text-main outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary"
                              value={action.flowId}
                              disabled={!canEditProjectCampaign || action.type !== "start_flow"}
                              onChange={(event) => updateAction(rule.id, action.id, { flowId: event.target.value })}
                              placeholder="Flow id"
                            />
                            <input
                              className="rounded-xl border border-border-main bg-surface px-4 py-3 text-sm text-text-main outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary"
                              value={action.leadStatus}
                              disabled={!canEditProjectCampaign || action.type !== "update_lead_status"}
                              onChange={(event) => updateAction(rule.id, action.id, { leadStatus: event.target.value })}
                              placeholder="Lead status"
                            />
                            <input
                              className="rounded-xl border border-border-main bg-surface px-4 py-3 text-sm text-text-main outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary"
                              value={action.note}
                              disabled={!canEditProjectCampaign || action.type !== "add_note"}
                              onChange={(event) => updateAction(rule.id, action.id, { note: event.target.value })}
                              placeholder="Note"
                            />
                            <div className="flex items-center justify-between gap-2">
                              <input
                                className="w-full rounded-xl border border-border-main bg-surface px-4 py-3 text-sm text-text-main outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary"
                                value={action.tag}
                                disabled={!canEditProjectCampaign || action.type !== "tag_lead"}
                                onChange={(event) => updateAction(rule.id, action.id, { tag: event.target.value })}
                                placeholder="Tag"
                              />
                              <button
                                type="button"
                                onClick={() => updateAction(rule.id, action.id, { enabled: !action.enabled })}
                                disabled={!canEditProjectCampaign}
                                className={`rounded-2xl border px-3 py-2 text-[10px] font-bold uppercase tracking-widest ${
                                  action.enabled
                                    ? "border-primary bg-primary-fade text-primary"
                                    : "border-border-main bg-surface text-text-muted"
                                }`}
                              >
                                {action.enabled ? "Enabled" : "Disabled"}
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  updateRule(rule.id, {
                                    actions: (rule.actions || []).filter((item) => item.id !== action.id),
                                  })
                                }
                                disabled={!canEditProjectCampaign || (rule.actions || []).length === 1}
                                className="text-[10px] font-bold uppercase tracking-widest text-red-500 transition-colors hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Remove
                              </button>
                              <button
                                type="button"
                                onClick={() => duplicateAction(rule.id, action.id)}
                                disabled={!canEditProjectCampaign}
                                className="rounded-2xl border border-border-main bg-surface py-2 px-4 text-[10px] font-bold uppercase tracking-widest text-text-main transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Duplicate
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-4 grid gap-4 lg:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                          Webhook secret
                        </label>
                        <input
                          className="w-full rounded-2xl border border-border-main bg-surface px-4 py-3 text-sm text-text-main outline-none"
                          value={rule.webhookSecret}
                          disabled={!canEditProjectCampaign}
                          onChange={(event) => updateRule(rule.id, { webhookSecret: event.target.value })}
                          placeholder="Shared secret for external systems"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                          Webhook header
                        </label>
                        <input
                          className="w-full rounded-2xl border border-border-main bg-surface px-4 py-3 text-sm text-text-main outline-none"
                          value={rule.webhookSecretHeader}
                          disabled={!canEditProjectCampaign}
                          onChange={(event) => updateRule(rule.id, { webhookSecretHeader: event.target.value })}
                          placeholder="x-automation-secret"
                        />
                      </div>
                    </div>

                    <div className="mt-4">
                      <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                        Notes
                      </label>
                      <textarea
                        className="min-h-[88px] w-full rounded-2xl border border-border-main bg-surface px-4 py-3 text-sm text-text-main outline-none"
                        value={rule.notes}
                        disabled={!canEditProjectCampaign}
                        onChange={(event) => updateRule(rule.id, { notes: event.target.value })}
                        placeholder="Describe what the automation should do."
                      />
                    </div>

                    <div className="mt-4 rounded-2xl border border-border-main bg-surface px-4 py-3 text-sm text-text-muted">
                      <div className="font-semibold text-text-main">Execution details</div>
                      <div className="mt-1">
                        {rule.type === "webhook" ? (
                          <>
                            External URL: <span className="font-mono text-text-main">{generatedUrl || "save the rule to generate a webhook URL"}</span>
                          </>
                        ) : (
                          <>
                            Due-date rules scan leads by <span className="font-semibold text-text-main">{rule.dateFieldKey || "next_service_date"}</span> and start the selected flow when a lead matches today.
                          </>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-3">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                        Rule {index + 1}
                      </div>
                      <button
                        type="button"
                        onClick={() => setRules((current) => current.filter((item) => item.id !== rule.id))}
                        disabled={!canEditProjectCampaign || rules.length === 1}
                        className="rounded-xl border border-rose-300/30 bg-rose-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-rose-600 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </DashboardLayout>
  );
}
