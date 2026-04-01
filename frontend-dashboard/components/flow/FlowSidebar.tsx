import { useState } from "react";
import { HelpCircle } from "lucide-react";
import { NODE_CATEGORIES } from "../../config/flowConstants";

interface FlowSidebarProps {
  isOpen: boolean;
  onAddNode: (type: string) => void;
  canEditWorkflow: boolean;
  allowedNodeTypes?: string[];
  disabledReasons?: Record<string, string>;
}

export default function FlowSidebar({
  isOpen,
  onAddNode,
  canEditWorkflow,
  allowedNodeTypes = [],
  disabledReasons = {},
}: FlowSidebarProps) {
  const [tooltip, setTooltip] = useState<{ visible: boolean, x: number, y: number, item: any | null }>({ visible: false, x: 0, y: 0, item: null });

  const handleTooltip = (e: React.MouseEvent, item: any) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const isBottom = rect.top > window.innerHeight - 250; 
    setTooltip({ visible: true, x: rect.right + 15, y: isBottom ? rect.bottom - 200 : rect.top, item });
  };

  const handleDragStart = (e: React.DragEvent, type: string) => {
    e.dataTransfer.setData('application/reactflow', type);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <>
      <div className={`${isOpen ? "w-80 border-r opacity-100" : "w-0 opacity-0 overflow-hidden"} bg-surface border-border-main flex flex-col shrink-0 transition-all duration-300 z-40 relative shadow-lg overflow-y-auto`}>
        <div className="p-6 space-y-8">
          {NODE_CATEGORIES.map((cat) => (
            <div key={cat.title}>
              <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-text-muted mb-5 px-1 flex items-center gap-2">
                  <div className={`w-1 h-1 rounded-full bg-${cat.color}-500`} /> {cat.title}
              </h3>
              <div className="flex flex-col gap-3">
                {cat.items.map((node) => {
                  const Icon = node.icon;
                  const nodeAllowed = allowedNodeTypes.length === 0 || allowedNodeTypes.includes(node.type);
                  const isDisabled = !canEditWorkflow || !nodeAllowed;
                  const disabledReason = disabledReasons[node.type] || "";
                  return (
                    <div key={node.type} className="flex items-center">
                      <button 
                        onDragStart={(e) => handleDragStart(e, node.type)} 
                        draggable={!isDisabled}
                        disabled={isDisabled}
                        onClick={() => onAddNode(node.type)} 
                        title={disabledReason}
                        className="flex-1 overflow-hidden flex items-center gap-4 px-4 py-3 bg-canvas hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50 text-text-main rounded-xl text-xs font-bold border border-border-main hover:border-primary/30 hover:shadow-md transition-all active:scale-95 group"
                      >
                        <div className={`shrink-0 p-2 rounded-lg bg-surface text-${cat.color}-600 shadow-sm group-hover:bg-primary group-hover:text-white transition-all`}><Icon size={16} /></div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-left">{node.label}</div>
                          {!canEditWorkflow ? null : !nodeAllowed && disabledReason ? (
                            <div className="mt-1 line-clamp-2 break-words text-left text-[10px] font-semibold leading-4 tracking-[0.04em] text-rose-500">
                              {disabledReason}
                            </div>
                          ) : null}
                        </div>
                      </button>
                      <button onMouseEnter={(e) => handleTooltip(e, { ...node, color: cat.color })} onMouseLeave={() => setTooltip({ ...tooltip, visible: false })} className="p-3 ml-2 text-text-muted hover:text-primary cursor-help"><HelpCircle size={16} /></button>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {tooltip.visible && tooltip.item && (
        <div style={{ left: tooltip.x, top: tooltip.y }} className="fixed w-72 bg-surface border border-border-main rounded-3xl shadow-lg z-[9999] overflow-hidden animate-in fade-in zoom-in-95 duration-100 pointer-events-none">
          <div className={`h-28 bg-primary-fade flex flex-col items-center justify-center p-4 border-b border-border-main`}>
              <div className={`w-40 bg-surface border-2 border-${tooltip.item.color}-400 rounded-lg p-3 shadow-md flex flex-col relative`}>
                <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-2 h-2 bg-canvas rounded-full" />
                <div className="flex items-center gap-2 opacity-70 mb-2">
                  <tooltip.item.icon size={12} className={`text-${tooltip.item.color}-600`} />
                  <span className={`text-[8px] font-bold uppercase text-${tooltip.item.color}-600`}>{tooltip.item.type}</span>
                </div>
                <div className="text-[10px] font-bold text-text-main">Preview Node...</div>
                <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-2 h-2 bg-canvas rounded-full" />
              </div>
          </div>
          <div className="p-5">
            <h4 className="text-xs font-black text-text-main mb-2 uppercase tracking-tight">{tooltip.item.label}</h4>
            <p className="text-[11px] leading-relaxed text-text-muted font-medium italic">"{tooltip.item.info}"</p>
          </div>
        </div>
      )}
    </>
  );
}

