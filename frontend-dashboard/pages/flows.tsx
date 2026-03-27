import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/router";
import ReactFlow, { 
  useNodesState, useEdgesState, addEdge, Connection, Node, Edge, 
  Background, Controls, SelectionMode, Panel, ReactFlowProvider, useReactFlow
} from "reactflow";
import "reactflow/dist/style.css";
import { X } from "lucide-react";

import NodeEditor from "../components/flow/NodeEditor";
import NodeComponent from "../components/flow/NodeComponent";
import FlowPortal from "../components/flow/FlowPortal";
import FlowHeader from "../components/flow/FlowHeader";
import FlowSidebar from "../components/flow/FlowSidebar";
import PageAccessNotice from "../components/access/PageAccessNotice";
import DashboardLayout from "../components/layout/DashboardLayout";
import { useVisibility } from "../hooks/useVisibility";
import { flowService } from "../services/flowService";
import { botService } from "../services/botService";
import apiClient from "../services/apiClient";
import { useAuthStore } from "../store/authStore";
import { useBotStore } from "../store/botStore";
import { confirmAction, notify } from "../store/uiStore";
import { NODE_CATEGORIES, AUTO_SAVE_DELAY, formatDefaultLabel } from "../config/flowConstants";
import { useFlowHistory } from "../hooks/useFlowHistory";

function FlowBuilderCanvas() {
  const router = useRouter();
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace);
  const activeProject = useAuthStore((state) => state.activeProject);
  const hasWorkspacePermission = useAuthStore((state) => state.hasWorkspacePermission);
  const getProjectRole = useAuthStore((state) => state.getProjectRole);
  const { canViewPage } = useVisibility();
  
  const botId = router.query.botId as string;
  const { unlockedBotIds } = useBotStore();
  const isUnlocked = unlockedBotIds.includes(botId);
  const canEditWorkflow = hasWorkspacePermission(activeWorkspace?.workspace_id, "edit_workflow");
  const canDeleteFlowAction = hasWorkspacePermission(activeWorkspace?.workspace_id, "delete_flow");
  const canViewFlowsPage = canViewPage("flows");
  const projectRole = getProjectRole(activeProject?.id);
  const canEditProjectWorkflow =
    canEditWorkflow || projectRole === "project_admin" || projectRole === "editor";
  const canDeleteProjectFlow =
    canDeleteFlowAction || projectRole === "project_admin";

  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { project, setViewport } = useReactFlow(); 
  
  const [nodes, setNodes, onNodesChangeState] = useNodesState([]);
  const [edges, setEdges, onEdgesChangeState] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [botMetadata, setBotMetadata] = useState<{ name: string } | null>(null);
  const [availableBots, setAvailableBots] = useState<any[]>([]); 
  const [currentFlowId, setCurrentFlowId] = useState<string | null>(null);
  const [flowSummaries, setFlowSummaries] = useState<any[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);

  const { takeSnapshot, undo, redo, past, future } = useFlowHistory(nodes, edges, setNodes, setEdges, setIsDirty);

  const normalizeFlowForCanvas = useCallback((flowJson: any) => {
    const nodes = Array.isArray(flowJson?.nodes)
      ? flowJson.nodes.map((node: any) => ({
          ...node,
          type: String(node?.type || "").trim().toLowerCase() === "message" ? "msg_text" : node?.type,
        }))
      : [];

    return {
      ...(flowJson && typeof flowJson === "object" ? flowJson : {}),
      nodes,
      edges: Array.isArray(flowJson?.edges) ? flowJson.edges : [],
    };
  }, []);

  const applyLoadedFlow = useCallback((payload: any) => {
    const flowJson = payload?.flow_json && typeof payload.flow_json === "object"
      ? payload.flow_json
      : payload;

    setCurrentFlowId(typeof payload?.id === "string" ? payload.id : null);
    const normalizedFlow = normalizeFlowForCanvas(flowJson);
    setNodes(normalizedFlow.nodes);
    setEdges(normalizedFlow.edges);
  }, [normalizeFlowForCanvas, setNodes, setEdges]);

  const nodeTypes = useMemo(() => {
    const types: any = { default: NodeComponent };
    NODE_CATEGORIES.forEach(cat => cat.items.forEach(node => types[node.type] = NodeComponent));
    types.message = NodeComponent;
    return types;
  }, []);

  useEffect(() => {
    if (selectedNode && !nodes.some(n => n.id === selectedNode.id)) {
      setSelectedNode(null);
    }
  }, [nodes, selectedNode]);

  const onNodesChange = useCallback((changes: any) => {
    if (!canEditProjectWorkflow) return;
    onNodesChangeState(changes);
    setIsDirty(true);
  }, [canEditProjectWorkflow, onNodesChangeState]);

  const onEdgesChange = useCallback((changes: any) => {
    if (!canEditProjectWorkflow) return;
    onEdgesChangeState(changes);
    setIsDirty(true);
  }, [canEditProjectWorkflow, onEdgesChangeState]);

  const onConnect = useCallback((params: Connection | Edge) => {
    if (!canEditProjectWorkflow) return;
    takeSnapshot();
    setEdges((eds) => addEdge(params, eds));
    setIsDirty(true);
  }, [canEditProjectWorkflow, takeSnapshot, setEdges]);

  useEffect(() => {
    if (!router.isReady) return;
    if (!canViewFlowsPage) {
      setAvailableBots([]);
      setCurrentFlowId(null);
      setIsLoading(false);
      return;
    }
    
    const loadPortalData = async () => {
      try {
        setIsLoading(true);
        const botRows = await botService.getBots({
          workspaceId: activeWorkspace?.workspace_id || undefined,
          projectId: activeProject?.id || undefined,
        });
        const unlockedList = botRows.filter((b: any) => unlockedBotIds.includes(b.id));
        setAvailableBots(unlockedList);

        if (botId && isUnlocked) {
          const botInfo = await apiClient.get(`/bots/${botId}`);
          setBotMetadata(botInfo.data);
          const summaries = await flowService.getFlowSummaries(botId);
          setFlowSummaries(Array.isArray(summaries) ? summaries : []);
          const initialFlowId =
            (typeof router.query.flowId === "string" && router.query.flowId) ||
            summaries?.[0]?.id ||
            undefined;
          const data = await flowService.getFlow(botId, initialFlowId);
          applyLoadedFlow(data);
        } else {
          setCurrentFlowId(null);
          setFlowSummaries([]);
        }
      } catch (err: any) {
        console.error("Session initialization failed:", err);
      } finally {
        setIsLoading(false);
      }
    };

    loadPortalData();
  }, [
    botId,
    isUnlocked,
    unlockedBotIds,
    router.isReady,
    applyLoadedFlow,
    activeWorkspace?.workspace_id,
    activeProject?.id,
    canViewFlowsPage,
  ]);

  const handleSelectFlow = useCallback(async (flowId: string) => {
    if (!botId || !flowId) {
      return;
    }

    try {
      setIsLoading(true);
      const data = await flowService.getFlow(botId, flowId);
      applyLoadedFlow(data);
      setSelectedNode(null);
      setIsDirty(false);
    } catch (err) {
      console.error("Failed to load selected flow", err);
      notify("Failed to load flow.", "error");
    } finally {
      setIsLoading(false);
    }
  }, [applyLoadedFlow, botId]);

  const handleCreateFlow = useCallback(async () => {
    if (!botId || !canEditProjectWorkflow) {
      return;
    }

    const nextIndex = (flowSummaries?.length || 0) + 1;
    const created = await flowService.createFlow(
      botId,
      {
        nodes: [
          {
            id: `node-start-${Date.now()}`,
            type: "start",
            position: { x: 250, y: 150 },
            data: { label: "Start", text: "" },
          },
        ],
        edges: [],
      },
      `Flow ${nextIndex}`,
      flowSummaries.length === 0
    );

    const summaries = await flowService.getFlowSummaries(botId);
    setFlowSummaries(Array.isArray(summaries) ? summaries : []);
    applyLoadedFlow(created);
    setSelectedNode(null);
    setIsDirty(false);
  }, [applyLoadedFlow, botId, canEditProjectWorkflow, flowSummaries.length]);

  const handleSave = useCallback(async () => {
    if (!botId || !isDirty || !isUnlocked || !canEditProjectWorkflow) return;
    setIsSaving(true);
    try {
      const saved = await flowService.saveFlow(botId, { nodes, edges }, currentFlowId || undefined);
      setCurrentFlowId(saved?.id || currentFlowId);
      setIsDirty(false);
    } catch (err) { 
      console.error("Save error", err); 
      notify("Failed to save workflow.", "error");
    } finally {
      setTimeout(() => setIsSaving(false), 800);
    }
  }, [botId, nodes, edges, isDirty, isUnlocked, currentFlowId, canEditProjectWorkflow]);

  useEffect(() => {
    if (isDirty) {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(handleSave, AUTO_SAVE_DELAY);
    }
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [isDirty, handleSave]);

  const deleteSelected = useCallback(() => {
    takeSnapshot();
    setNodes((nds) => nds.filter((node) => !node.selected));
    setEdges((eds) => eds.filter((edge) => !edge.selected));
    setSelectedNode(null); 
    setIsDirty(true);
  }, [takeSnapshot, setNodes, setEdges]);

  const selectAll = useCallback(() => {
    setNodes((nds) => nds.map((n) => ({ ...n, selected: true })));
    setEdges((eds) => eds.map((e) => ({ ...e, selected: true })));
  }, [setNodes, setEdges]);

  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
      if (!canEditProjectWorkflow) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') { e.preventDefault(); selectAll(); }
      if (e.key === 'Delete' || e.key === 'Backspace') deleteSelected();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, deleteSelected, selectAll, canEditProjectWorkflow]);

  const onAddNode = (type: string) => {
    if (!canEditProjectWorkflow) return;
    takeSnapshot();
    const offset = (nodes.length % 15) * 30; 
    const newNode: Node = { id: `node-${Date.now()}`, type, position: { x: 300 + offset, y: 150 + offset }, data: { label: formatDefaultLabel(type), text: "" } };
    setNodes((nds) => nds.concat(newNode));
    setIsDirty(true);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!canEditProjectWorkflow) return;
    const type = e.dataTransfer.getData('application/reactflow');
    if (!type || !reactFlowWrapper.current) return;
    const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
    const position = project({ x: e.clientX - reactFlowBounds.left, y: e.clientY - reactFlowBounds.top });
    takeSnapshot();
    const newNode: Node = { id: `node-${Date.now()}`, type, position, data: { label: formatDefaultLabel(type), text: "" } };
    setNodes((nds) => nds.concat(newNode));
    setIsDirty(true);
  }, [setNodes, takeSnapshot, project, canEditProjectWorkflow]);

  const onUpdateNodeData = (newData: any) => {
    if (!canEditProjectWorkflow) return;
    takeSnapshot();
    setNodes((nds) => nds.map((node) => (node.id === selectedNode?.id ? { ...node, data: newData } : node)));
    setSelectedNode((prev) => (prev ? { ...prev, data: newData } : null));
    setIsDirty(true);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canEditProjectWorkflow) {
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (json.nodes && Array.isArray(json.nodes)) {
          takeSnapshot(); setNodes(json.nodes); setEdges(json.edges || []); setIsDirty(true);
          setViewport({ x: 0, y: 0, zoom: 1 });
        }
      } catch (err) { notify("Error parsing JSON.", "error"); }
      if (fileInputRef.current) fileInputRef.current.value = ""; 
    };
    reader.readAsText(file);
  };

  const handleDownloadSample = () => {
    const sampleData = { nodes: [{ id: "node-start", type: "start", position: { x: 250, y: 150 }, data: { label: "Start", text: "" } }], edges: [] };
    const blob = new Blob([JSON.stringify(sampleData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = "sample-flow.json"; document.body.appendChild(link);
    link.click(); document.body.removeChild(link);
  };

  const onInit = useCallback((reactFlowInstance: any) => {
    reactFlowInstance.setViewport({ x: 0, y: 0, zoom: 1 });
  }, []);

  const handleDeleteFlow = useCallback(async () => {
    if (!currentFlowId || !botId || isSaving) {
      return;
    }
    if (!canDeleteProjectFlow) {
      notify("You do not have permission to remove workflows.", "error");
      return;
    }

    const confirmed = await confirmAction(
      "Remove workflow?",
      "This will permanently delete the current workflow for this bot. This action cannot be undone.",
      "Remove Flow",
      "Keep Flow"
    );

    if (!confirmed) {
      return;
    }

    setIsSaving(true);
    try {
      await flowService.deleteFlow(currentFlowId);
      notify("Workflow removed.", "success");

      const nextFlow = await flowService.getFlow(botId);
      applyLoadedFlow(nextFlow);
      setSelectedNode(null);
      setIsDirty(false);
    } catch (err) {
      console.error("Delete flow error", err);
      notify("Failed to remove workflow.", "error");
    } finally {
      setIsSaving(false);
    }
  }, [applyLoadedFlow, botId, currentFlowId, isSaving, canDeleteProjectFlow]);

  if (!canViewFlowsPage) {
    return (
      <DashboardLayout>
        <PageAccessNotice
          title="Flow builder is restricted for this role"
          description="Only workspace admins and project operators with workflow access can open the flow builder."
          href="/"
          ctaLabel="Open dashboard"
        />
      </DashboardLayout>
    );
  }

  if (isLoading) return <div className="h-screen w-screen flex items-center justify-center bg-slate-900 text-white font-black animate-pulse tracking-tighter uppercase">Loading Workflow...</div>;

  if (!botId || !isUnlocked) {
    return (
      <DashboardLayout>
        <FlowPortal availableBots={availableBots} embedded />
      </DashboardLayout>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-[#F8FAFC] overflow-hidden font-sans">
        <FlowHeader
          isSidebarOpen={isSidebarOpen}
          setIsSidebarOpen={setIsSidebarOpen}
          botName={botMetadata?.name}
          botId={botId}
          canEditWorkflow={canEditProjectWorkflow}
          canDeleteFlowAction={canDeleteProjectFlow}
          flowSummaries={flowSummaries}
          currentFlowId={currentFlowId}
          onSelectFlow={handleSelectFlow}
          onCreateFlow={handleCreateFlow}
          onDownloadSample={handleDownloadSample}
        fileInputRef={fileInputRef}
        onFileUpload={handleFileUpload}
        onUndo={undo}
        onRedo={redo}
        canUndo={past.length > 0}
        canRedo={future.length > 0}
        onDeleteSelected={deleteSelected}
        onDeleteFlow={handleDeleteFlow}
        onSave={handleSave}
        isDirty={isDirty}
        isSaving={isSaving}
        canDeleteFlow={Boolean(currentFlowId)}
      />

      <div className="flex-1 flex overflow-hidden relative">
        <FlowSidebar isOpen={isSidebarOpen} onAddNode={onAddNode} canEditWorkflow={canEditProjectWorkflow} />

        <div className="flex-1 relative w-full h-full" ref={reactFlowWrapper} onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
          {!canEditProjectWorkflow ? (
            <div className="absolute left-1/2 top-5 z-50 -translate-x-1/2 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-amber-700 shadow-sm">
              Read-only workflow mode
            </div>
          ) : null}
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, n) => setSelectedNode(n)}
            onPaneClick={() => setSelectedNode(null)}
            nodeTypes={nodeTypes}
            panOnDrag={true}
            selectionOnDrag={false}
            selectionMode={SelectionMode.Partial}
            multiSelectionKeyCode="Shift"
            selectionKeyCode="Shift"
            panOnScroll={true}
            deleteKeyCode={null}
            onInit={onInit} 
            className="bg-[#f1f5f9]"
          >
            <Background color="#ccc" gap={20} size={1} />
            <Controls className="mb-4 ml-4 shadow-xl border-none" />
            
            {selectedNode && (
              <Panel
                position="top-right"
                className="bg-white/95 backdrop-blur-md border border-slate-200 shadow-2xl rounded-2xl w-[350px] h-[85%] overflow-hidden flex flex-col mr-6 mt-6 animate-in slide-in-from-right-8 z-50"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="h-14 bg-slate-900 flex items-center justify-between px-5 shrink-0">
                  <span className="text-xs font-black text-white uppercase tracking-widest">Edit Node Data</span>
                  <button onClick={() => setSelectedNode(null)} className="text-slate-400 hover:text-white"><X size={18} /></button>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar relative">
                  <NodeEditor node={selectedNode} onUpdate={onUpdateNodeData} onClose={() => setSelectedNode(null)} />
                  {!canEditProjectWorkflow ? (
                    <div className="absolute inset-0 bg-white/55 backdrop-blur-[1px]" />
                  ) : null}
                </div>
              </Panel>
            )}
          </ReactFlow>
        </div>
      </div>
    </div>
  );
}

export default function FlowBuilderPageWrapper() {
  return (
    <ReactFlowProvider>
      <FlowBuilderCanvas />
    </ReactFlowProvider>
  );
}
