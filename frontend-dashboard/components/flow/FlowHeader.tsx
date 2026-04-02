import { 
  PanelLeft, Download, Upload, Undo2, Redo2, 
  Trash2, Save, CheckCircle, LogOut, Clock, Copy, ClipboardPaste, Pencil, Globe2
} from "lucide-react";

interface FlowHeaderProps {
  isSidebarOpen: boolean;
  setIsSidebarOpen: (isOpen: boolean) => void;
  botName?: string;
  botId: string;
  builderContextLabel?: string;
  canEditWorkflow: boolean;
  isSystemFlow?: boolean;
  canDeleteFlowAction: boolean;
  flowSummaries: Array<{ id: string; flow_name?: string; is_default?: boolean }>;
  currentFlowId: string | null;
  currentFlowName: string;
  onSelectFlow: (flowId: string) => void;
  onCreateFlow: () => void;
  onEditFlowName: () => void;
  onDownloadSample: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onPasteJson: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onDeleteSelected: () => void;
  onCopySelected: () => void;
  onPasteSelected: () => void;
  onDeleteFlow: () => void;
  onSave: () => void;
  onOpenGlobalRulesInfo?: () => void;
  onCloseBuilder: () => void;
  isDirty: boolean;
  isSaving: boolean;
  draftSaveStatus?: string;
  canDeleteFlow: boolean;
  canPasteSelection: boolean;
}

export default function FlowHeader({
  isSidebarOpen,
  setIsSidebarOpen,
  botName,
  botId,
  builderContextLabel,
  canEditWorkflow,
  isSystemFlow = false,
  canDeleteFlowAction,
  flowSummaries,
  currentFlowId,
  currentFlowName,
  onSelectFlow,
  onCreateFlow,
  onEditFlowName,
  onDownloadSample,
  fileInputRef,
  onFileUpload,
  onPasteJson,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onDeleteSelected,
  onCopySelected,
  onPasteSelected,
  onDeleteFlow,
  onSave,
  onOpenGlobalRulesInfo,
  onCloseBuilder,
  isDirty,
  isSaving,
  canDeleteFlow,
  canPasteSelection,
  draftSaveStatus,
}: FlowHeaderProps) {
  const showMutationControls = canEditWorkflow && !isSystemFlow;
  const visibleFlowSummaries = isSystemFlow
    ? []
    : flowSummaries.filter((flow: any) =>
        !Boolean(flow?.is_system_flow || flow?.is_global_flow || flow?.system_flow_type || flow?.flow_json?.system_flow_type)
      );
  const contextLabel = builderContextLabel || `Workspace / ${botName || "Unnamed Bot"}`;

  return (
    <div className="h-16 bg-surface border-b border-border-main flex items-center justify-between gap-3 px-3 shrink-0 z-50 relative shadow-sm transition-colors duration-300 overflow-x-auto whitespace-nowrap">
      <div className="flex items-center gap-2 min-w-0 shrink-0">
        {showMutationControls ? (
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 bg-canvas border border-border-main rounded-lg text-text-muted transition-all hover:bg-primary/10 hover:text-primary hover:border-primary/40 hover:shadow-sm hover:scale-[1.02] active:scale-[0.98] cursor-pointer">
            <PanelLeft size={20} />
          </button>
        ) : null}
        <div className="flex flex-col">
          <span className="font-black text-text-main text-[10px] uppercase tracking-widest leading-none">{contextLabel}</span>
          <span className="font-mono text-text-muted text-[10px] tracking-tight">id: {botId}</span>
        </div>
        {isSystemFlow ? (
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-amber-700">
            System Flow (Text Editable Only)
          </div>
        ) : null}
        <div className="flex items-center gap-2 min-w-0 shrink-0">
          {!isSystemFlow ? (
            <select
              value={currentFlowId || ""}
              onChange={(event) => onSelectFlow(event.target.value)}
              className="min-w-[190px] max-w-[230px] rounded-xl border border-border-main bg-canvas px-2.5 py-2 text-[11px] font-semibold text-text-main outline-none"
            >
              <option value="">Select flow</option>
              {visibleFlowSummaries.map((flow) => (
                <option key={flow.id} value={flow.id}>
                  {flow.flow_name || "Untitled flow"}{flow.is_default ? " · Default" : ""}
                </option>
              ))}
            </select>
          ) : null}
          {showMutationControls ? (
            <button
              onClick={onCreateFlow}
              className="rounded-xl border border-border-main bg-canvas px-2.5 py-2 text-[10px] font-black uppercase tracking-wider text-text-main transition-all hover:bg-primary/10 hover:border-primary/40 hover:text-primary hover:shadow-sm hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            >
              Create New
            </button>
          ) : null}
          {currentFlowId ? (
            <div className="flex items-center gap-2 rounded-xl border border-border-main bg-canvas px-2.5 py-2 shrink-0">
              <span className="max-w-[160px] truncate text-[11px] font-semibold text-text-main">
                {currentFlowName || "Untitled flow"}
              </span>
              {showMutationControls ? (
                <button
                  type="button"
                  onClick={onEditFlowName}
                  className="rounded-lg p-1 text-text-muted transition-all hover:bg-primary/10 hover:text-primary hover:shadow-sm hover:scale-[1.05] active:scale-[0.98] cursor-pointer"
                  title="Edit flow name"
                >
                  <Pencil size={14} />
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      
      <div className="flex items-center justify-end gap-2 shrink-0">
        <div className="flex items-center gap-1 bg-canvas p-1 rounded-xl border border-border-main shrink-0">
          {!isSystemFlow ? (
            <button onClick={onDownloadSample} className="p-1.5 bg-surface rounded-lg transition-all text-primary hover:bg-primary/10 hover:text-primary hover:border-primary/30 hover:shadow-sm hover:scale-[1.04] active:scale-[0.98] cursor-pointer border border-transparent" title="Download Sample JSON">
              <Download size={16} />
            </button>
          ) : null}
          {showMutationControls ? (
            <>
              <div className="w-px h-4 bg-border-main mx-1"></div>
              <input type="file" accept=".json" ref={fileInputRef} onChange={onFileUpload} className="hidden" />
              <button onClick={() => fileInputRef.current?.click()} className="p-1.5 bg-surface rounded-lg transition-all text-primary hover:bg-primary/10 hover:text-primary hover:border-primary/30 hover:shadow-sm hover:scale-[1.04] active:scale-[0.98] cursor-pointer border border-transparent" title="Import JSON Flow">
                <Upload size={16} />
              </button>
              <button onClick={onPasteJson} className="p-1.5 bg-surface rounded-lg transition-all text-primary hover:bg-primary/10 hover:text-primary hover:border-primary/30 hover:shadow-sm hover:scale-[1.04] active:scale-[0.98] cursor-pointer border border-transparent" title="Paste JSON Flow">
                <ClipboardPaste size={16} />
              </button>
            </>
          ) : null}
        </div>
        {showMutationControls ? (
          <div className="flex items-center gap-1 bg-canvas p-1 rounded-xl border border-border-main shrink-0">
            <button onClick={onUndo} disabled={!canUndo} className="p-1.5 bg-surface rounded-lg transition-all text-text-muted hover:bg-primary/10 hover:text-primary hover:shadow-sm hover:scale-[1.04] active:scale-[0.98] cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed"><Undo2 size={15} /></button>
            <button onClick={onRedo} disabled={!canRedo} className="p-1.5 bg-surface rounded-lg transition-all text-text-muted hover:bg-primary/10 hover:text-primary hover:shadow-sm hover:scale-[1.04] active:scale-[0.98] cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed"><Redo2 size={15} /></button>
            <div className="w-px h-4 bg-border-main mx-1"></div>
            <button onClick={onCopySelected} className="p-1.5 bg-surface rounded-lg transition-all text-text-muted hover:bg-primary/10 hover:text-primary hover:shadow-sm hover:scale-[1.04] active:scale-[0.98] cursor-pointer border border-transparent" title="Copy selected nodes"><Copy size={15} /></button>
            <button onClick={onPasteSelected} disabled={!canPasteSelection} className="p-1.5 bg-surface rounded-lg transition-all text-text-muted hover:bg-primary/10 hover:text-primary hover:shadow-sm hover:scale-[1.04] active:scale-[0.98] cursor-pointer border border-transparent disabled:opacity-20 disabled:cursor-not-allowed" title="Paste copied nodes"><ClipboardPaste size={15} /></button>
          </div>
        ) : null}
        {showMutationControls || (canDeleteFlow && canDeleteFlowAction && !isSystemFlow) ? (
          <div className="flex items-center gap-1 bg-canvas p-1 rounded-xl border border-border-main shrink-0">
            {showMutationControls ? (
              <button
                onClick={onDeleteSelected}
                className="p-1.5 bg-surface text-text-main rounded-lg transition-all border border-border-main hover:bg-primary/10 hover:text-primary hover:border-primary/40 hover:shadow-sm hover:scale-[1.04] active:scale-[0.98] cursor-pointer"
                title="Delete selected nodes or edges"
              >
                <Trash2 size={15} />
              </button>
            ) : null}
            {canDeleteFlow && canDeleteFlowAction && !isSystemFlow ? (
              <button
                onClick={onDeleteFlow}
                className="px-2.5 py-1.5 bg-surface text-text-main rounded-lg transition-all border border-border-main text-[10px] font-black uppercase tracking-wider hover:bg-primary/10 hover:text-primary hover:border-primary/40 hover:shadow-sm hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                title="Delete current workflow"
              >
                Remove
              </button>
            ) : null}
          </div>
        ) : null}
        {canEditWorkflow ? (
            <button
              onClick={onOpenGlobalRulesInfo}
              disabled={!onOpenGlobalRulesInfo}
              className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-300 transition-all hover:border-emerald-400/50 hover:bg-emerald-500/20 hover:text-white hover:shadow-sm hover:scale-[1.02] active:scale-[0.98] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              title="View active global rules"
            >
            <Globe2 size={13} />
            Universal Keywords
          </button>
        ) : null}
        {canEditWorkflow ? (
          <div className="flex flex-col items-center gap-0.5 min-w-[150px] shrink-0">
            <button onClick={onSave} disabled={!isDirty || isSaving} className={`w-full px-3.5 py-2 text-[10px] font-black rounded-xl flex items-center justify-center gap-1.5 text-center transition-all duration-300 border uppercase tracking-[0.14em] ${isSaving ? "bg-primary border-primary text-white animate-pulse" : isDirty ? "bg-primary border-primary text-white hover:bg-primary/90 hover:shadow-sm hover:scale-[1.02] active:scale-[0.98] cursor-pointer" : "bg-canvas border-border-main text-text-muted cursor-default shadow-none"}`}>
              {isSaving ? <Clock size={13} className="animate-spin" /> : isDirty ? <Save size={13} /> : <CheckCircle size={13} />}
              {isSaving ? "Saving..." : isDirty ? "Save Flow" : "Saved"}
            </button>
            {draftSaveStatus ? (
              <span className="max-w-[220px] text-center text-[9px] font-semibold leading-3 text-text-muted">
                {draftSaveStatus}
              </span>
            ) : null}
          </div>
        ) : (
          <div className="px-4 py-2 text-[10px] font-black uppercase tracking-wider text-text-muted">
            Read Only
          </div>
        )}
        <button
          onClick={onCloseBuilder}
          className="p-2 bg-canvas text-text-main rounded-xl transition-all border border-border-main shrink-0 hover:bg-primary/10 hover:text-primary hover:border-primary/40 hover:shadow-sm hover:scale-[1.04] active:scale-[0.98] cursor-pointer"
          title="Save and close builder"
        >
          <LogOut size={16} />
        </button>
      </div>
    </div>
  );
}

