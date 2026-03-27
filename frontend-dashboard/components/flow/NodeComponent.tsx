import { Handle, Position, useReactFlow } from "reactflow";
import { X, Hash, Headset, Bot, RotateCcw, Link } from "lucide-react";

export default function NodeComponent({ id, data, type, selected }: any) {
  const { setNodes, setEdges } = useReactFlow();

  // Type categorizations
  const isButtonNode = type === "menu_button";  const isListNode = type === "menu_list";
  const isConditionNode = type === "condition";
  const isEndNode = type === "end" || type === "timeout"; 
  const isGotoNode = type === "goto";
  const isAgentNode = type === "assign_agent";
  const isResumeNode = type === "resume_bot";
  const isInputNode = type === "input";
  const isWaitingNode = isInputNode || isButtonNode || isListNode;
  const isErrorHandler = type === "error_handler";
  const isStartNode = type === "start" || type === "trigger"; 
  const isGlobalOverride = type === "trigger" && Boolean(data?.isGlobalOverride);

  const maxItems = isButtonNode ? 4 : isListNode ? 10 : 0;

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setNodes((nds) => nds.filter((node) => node.id !== id));
    setEdges((eds) => eds.filter((edge) => edge.source !== id && edge.target !== id));
  };

  return (
    <div 
      className={`bg-white border-2 rounded-xl min-w-[220px] overflow-hidden relative group transition-all hover:border-blue-400 hover:shadow-md ${
        selected 
          ? "border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.4)] ring-2 ring-blue-100 scale-[1.02]" 
          : "border-slate-200 shadow-sm"
      } ${isErrorHandler ? "border-dashed" : "border-solid"}`}
    >
      
      <button 
        onClick={handleDelete}
        className="absolute top-2 right-2 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity z-10 bg-white rounded-full p-0.5"
      >
        <X size={14} strokeWidth={3} />
      </button>

      {/* Target Handle - Hidden on Start, Trigger, and Global Error Handler */}
      {!isStartNode && !isErrorHandler && (
        <Handle type="target" position={Position.Left} className="w-3 h-3 bg-slate-400 border-2 border-white" />
      )}

      {/* Node Header */}
      <div className={`p-2.5 border-b flex items-center justify-between pr-8 ${isErrorHandler ? "bg-amber-50 border-amber-100" : "bg-slate-50 border-slate-100"}`}>
        <div className="flex min-w-0 items-center gap-2">
          <span className={`text-[10px] font-black uppercase tracking-widest truncate ${isErrorHandler ? "text-amber-600" : "text-slate-600"}`}>
            {data.label || type.replace('_', ' ')}
          </span>
          {isGlobalOverride ? (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.18em] text-red-700">
              Global
            </span>
          ) : null}
        </div>
        
        <div className="flex items-center gap-1 bg-slate-200 px-1.5 py-0.5 rounded text-[8px] font-mono text-slate-500 border border-slate-300">
          <Hash size={8} />
          {id.slice(-4)} 
        </div>
      </div>

      {/* Node Body Preview */}
      <div className="p-3 text-xs text-slate-600 font-medium">
        {isInputNode ? (
          <div className="space-y-2">
            <p className="truncate max-w-[180px]">{data.text || "Configure question..."}</p>
            <div className="flex items-center gap-1 text-[9px] text-slate-400 italic font-bold">
              <RotateCcw size={10} className="text-slate-300" /> Type 'reset' to rewrite
            </div>
          </div>
        ) : isGotoNode ? (
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-[9px] text-blue-500 font-black uppercase tracking-tight">
              <Link size={10} /> {data.gotoType === 'bot' ? 'External Bot' : 'Internal Node'}
            </div>
            <p className={`truncate font-bold bg-slate-50 p-1 rounded border ${!data.targetNode && !data.targetBotId ? "text-red-400 border-red-100 animate-pulse" : "text-slate-900 border-slate-100"}`}>
              {data.targetNode || data.targetBotId || "Unconfigured"}
            </p>
          </div>
        ) : isAgentNode ? (
          <div className="flex items-center gap-2 text-amber-600">
            <Headset size={14} />
            <span className="text-[10px] font-bold uppercase">Handoff to Human</span>
          </div>
        ) : isResumeNode ? (
          <div className="flex items-center gap-2 text-emerald-600">
            <Bot size={14} />
            <span className="text-[10px] font-bold uppercase">Resume automation</span>
          </div>
        ) : isErrorHandler ? (
          <p className="italic text-amber-500 text-[10px]">Active globally for all errors</p>
        ) : data.text ? (
          <div className="space-y-1">
            <p className="truncate max-w-[180px]">{data.text}</p>
            {Number(data.delayMs || 0) > 0 ? (
              <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">
                Delay {Number(data.delayMs)} ms
              </p>
            ) : null}
          </div>
        ) : (
          <p className="italic text-slate-400">Configure node...</p>
        )}
      </div>

      {/* Menus / Lists */}
      {maxItems > 0 && (
        <div className="border-t border-slate-100 bg-slate-50 flex flex-col">
          {Array.from({ length: maxItems }, (_, i) => i + 1).map((num) => {
            const itemText = data[`item${num}`];
            if (!itemText && num > 1) return null;
            return (
              <div key={num} className="relative p-2 text-[10px] font-bold text-center border-b border-slate-200 last:border-0 text-slate-600">
                <span className="truncate block px-2">{itemText || `Item ${num}`}</span>
                <Handle type="source" position={Position.Right} id={`item${num}`} className="w-3 h-3 bg-purple-500 border-2 border-white absolute right-[-7px] top-1/2 -translate-y-1/2" />
              </div>
            );
          })}
        </div>
      )}

      {/* Resume Bot Handles */}
      {isResumeNode && (
        <div className="border-t border-slate-100 bg-slate-50 flex flex-col">
          <div className="relative p-2 text-[10px] font-bold text-center border-b border-slate-200 text-emerald-600">
            <span>Continue Last Interaction</span>
            <Handle type="source" position={Position.Right} id="continue" className="w-3 h-3 bg-emerald-500 border-2 border-white absolute right-[-7px] top-1/2 -translate-y-1/2" />
          </div>
          <div className="relative p-2 text-[10px] font-bold text-center text-blue-600">
            <span>Restart Flow</span>
            <Handle type="source" position={Position.Right} id="restart" className="w-3 h-3 bg-blue-500 border-2 border-white absolute right-[-7px] top-1/2 -translate-y-1/2" />
          </div>
        </div>
      )}

      {/* Condition Nodes */}
      {isConditionNode && (
        <div className="border-t border-slate-100 bg-slate-50 flex flex-col">
          <div className="relative p-2 text-[10px] font-bold text-center border-b border-slate-200 text-emerald-600">
            <span>True</span>
            <Handle type="source" position={Position.Right} id="true" className="w-3 h-3 bg-emerald-500 border-2 border-white absolute right-[-7px] top-1/2 -translate-y-1/2" />
          </div>
          <div className="relative p-2 text-[10px] font-bold text-center text-red-600">
            <span>False</span>
            <Handle type="source" position={Position.Right} id="false" className="w-3 h-3 bg-red-500 border-2 border-white absolute right-[-7px] top-1/2 -translate-y-1/2" />
          </div>
        </div>
      )}

      {/* Input Node Handles */}
      {isWaitingNode && (
        <div className="border-t border-slate-100 bg-slate-50 flex flex-col">
          {isInputNode && (
            <div className="relative p-2 text-[10px] font-bold text-center border-b border-slate-200 text-blue-600">
              <span>On Response</span>
              <Handle type="source" position={Position.Right} id="response" className="w-3 h-3 bg-blue-500 border-2 border-white absolute right-[-7px] top-1/2 -translate-y-1/2" />
            </div>
          )}
          <div className="relative p-2 text-[10px] font-bold text-center text-amber-600">
            <span>On Timeout (Amber Handle)</span>
            <Handle type="source" position={Position.Right} id="timeout" className="w-3 h-3 bg-amber-500 border-2 border-white absolute right-[-7px] top-1/2 -translate-y-1/2" />
          </div>
        </div>
      )}

      {/* Default Handle */}
      {!isEndNode && !isGotoNode && !isInputNode && !isConditionNode && !isResumeNode && !isErrorHandler && maxItems === 0 && (
        <Handle type="source" position={Position.Right} className="w-3 h-3 bg-blue-500 border-2 border-white" />
      )}
    </div>
  );
}
