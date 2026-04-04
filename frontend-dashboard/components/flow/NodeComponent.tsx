import { Handle, Position, useReactFlow } from "reactflow";
import { X, Hash, Headset, Bot, BrainCircuit, AlertTriangle, MessageSquare, Clock, Split, List, Play, LogOut, ArrowRight } from "lucide-react";

import { useFlowValidationContext } from "./FlowValidationContext";

export default function NodeComponent({
  id,
  data,
  type,
  selected,
  isInvalid = false,
  validationMessage = "",
}: any) {
  const { setNodes, setEdges } = useReactFlow();
  const flowValidation = useFlowValidationContext();
  const isLockedTopology = Boolean(flowValidation?.isLockedTopology);
  const handleSize = 18;
  const handleOffset = -9;
  const handleClassName = "border-2 border-border-main rounded-full";
  const sideHandleClassName = `${handleClassName} absolute top-1/2 -translate-y-1/2`;
  const baseHandleStyle = {
    width: handleSize,
    height: handleSize,
    borderWidth: 2,
    borderRadius: 9999,
  } as const;
  const sideHandleStyle = {
    ...baseHandleStyle,
    right: handleOffset,
    top: "50%",
    transform: "translateY(-50%)",
  } as const;

  const normalizedType = String(type || "").trim().toLowerCase();
  const isStartNode = type === "start";
  const isEndNode = type === "end";
  const isTriggerNode = type === "trigger";
  const isMessageNode = normalizedType === "message";
  const isMenuNode = normalizedType === "menu";
  const isConditionNode = type === "condition";
  const isGotoNode = type === "goto";
  const isAgentNode = type === "assign_agent";
  const isInputNode = normalizedType === "input";
  const isAiNode = type === "ai_generate";
  const isAiIntentNode = normalizedType === "ai_intent";
  const isAiExtractNode = normalizedType === "ai_extract";
  const isBusinessHoursNode = type === "business_hours";
  const isSplitTrafficNode = type === "split_traffic";
  const isApiNode = type === "api";
  const isWaitingNode = isInputNode || isMenuNode;
  const aiIntents = Array.isArray(data?.intents) ? data.intents.filter(Boolean) : [];
  const fallbackHandle = String(data?.fallback || "fallback").trim() || "fallback";

  const contextValidationMessage = flowValidation.invalidNodeReasons[String(id || "")] || "";
  const resolvedValidationMessage = validationMessage || contextValidationMessage;
  const resolvedInvalid = Boolean(isInvalid || resolvedValidationMessage);

  const maxItems = isMenuNode ? 10 : 0;

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isStartNode) return;
    setNodes((nds) => nds.filter((node) => node.id !== id));
    setEdges((eds) => eds.filter((edge) => edge.source !== id && edge.target !== id));
  };

  return (
    <div
      className={`bg-canvas rounded-xl min-w-[220px] overflow-hidden relative group transition-all border ${
        resolvedInvalid
          ? "border-rose-500 shadow-[0_0_0_1px_rgba(244,63,94,0.25)]"
          : selected
            ? "border-primary shadow-[0_0_15px_var(--primary-fade)] scale-[1.02]"
            : "border-border-main shadow-sm hover:border-primary/50"
      } border-solid`}
    >
      {!isLockedTopology && !isStartNode ? (
        <button
          onClick={handleDelete}
          className="absolute top-2 right-2 text-text-muted hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity z-10 bg-surface rounded-full p-0.5"
        >
          <X size={14} strokeWidth={3} />
        </button>
      ) : null}

      {!isStartNode && !isTriggerNode && (
        <Handle
          type="target"
          position={Position.Left}
          className={handleClassName}
          style={{ ...baseHandleStyle, background: "var(--text-muted)", left: handleOffset }}
        />
      )}

      <div className="p-2.5 border-b flex items-center justify-between pr-8 bg-surface border-border-main">
        <div className="flex min-w-0 items-center gap-2">
          {isStartNode ? <Play size={10} className="text-emerald-500" /> : null}
          {isEndNode ? <LogOut size={10} className="text-rose-500" /> : null}
          {isMessageNode ? <MessageSquare size={10} className="text-primary" /> : null}
          {isMenuNode ? <List size={10} className="text-primary" /> : null}
          {isBusinessHoursNode ? <Clock size={10} className="text-primary" /> : null}
          {isSplitTrafficNode ? <Split size={10} className="text-primary" /> : null}
          {isAgentNode ? <Headset size={10} className="text-primary" /> : null}
          {isAiIntentNode ? <BrainCircuit size={10} className="text-primary" /> : null}
          {isAiExtractNode ? <BrainCircuit size={10} className="text-primary" /> : null}
          {isAiNode ? <Bot size={10} className="text-primary" /> : null}
          <span className="text-[10px] font-black uppercase tracking-widest truncate text-text-muted">
            {data.label || normalizedType.replace("_", " ")}
          </span>
          {isAiIntentNode ? (
            <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.16em] text-violet-700">
              {aiIntents.length} intents
            </span>
          ) : null}
          {isAiExtractNode ? (
            <span className="inline-flex items-center rounded-full border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.16em] text-cyan-700">
              {(Array.isArray(data?.requiredFields) ? data.requiredFields.length : 0) + (Array.isArray(data?.optionalFields) ? data.optionalFields.length : 0)} fields
            </span>
          ) : null}
          {resolvedInvalid ? (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.16em] text-rose-700"
              title={resolvedValidationMessage || "This node needs a connection"}
            >
              <AlertTriangle size={8} />
              Needs link
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-1 bg-surface px-1.5 py-0.5 rounded text-[8px] font-mono text-text-muted border border-border-main">
          <Hash size={8} />
          {String(id || "").slice(-4)}
        </div>
      </div>

      <div className="p-3 text-xs text-text-muted font-medium">
        {isInputNode ? (
          <div className="space-y-2">
            <p className="truncate max-w-[180px]">{data.text || "Configure question..."}</p>
            <div className="flex flex-wrap items-center gap-1 text-[9px] font-bold">
              <span className="rounded-full bg-primary-fade px-2 py-0.5 text-primary">
                {String(data.validation || "text").toUpperCase()}
              </span>
              {Number(data.timeout || 0) > 0 ? (
                <span className="rounded-full bg-surface px-2 py-0.5 text-text-muted border border-border-main">
                  Timeout {Number(data.timeout)}s
                </span>
              ) : null}
              {String(data.linkedFormId || data.leadFormId || data.formId || data.lead_form_id || "").trim() ? (
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700 border border-emerald-200">
                  Lead form linked
                </span>
              ) : null}
            </div>
            {String(data.linkedFieldKey || data.leadField || data.field || "").trim() ? (
              <p className="text-[9px] text-text-muted">
                Field: <span className="font-mono text-text-main">{String(data.linkedFieldKey || data.leadField || data.field)}</span>
              </p>
            ) : null}
          </div>
        ) : isMessageNode ? (
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-[9px] text-primary font-black uppercase tracking-tight">
              <MessageSquare size={10} /> Message
            </div>
            <p className="truncate font-bold bg-surface p-1 rounded border text-text-main border-border-main">
              {(data.media_url || data.url) ? String(data.messageType || data.mediaType || "media").toUpperCase() : "Text"}
            </p>
            <p className="truncate max-w-[180px] text-text-main">{data.text || data.caption || "Configure message..."}</p>
          </div>
        ) : isMenuNode ? (
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-[9px] text-primary font-black uppercase tracking-tight">
              <List size={10} /> Interactive Menu
            </div>
            <p className="truncate font-bold bg-surface p-1 rounded border text-text-main border-border-main">
              {Number(Array.from({ length: 10 }, (_, index) => index + 1).filter((num) => Boolean(data[`item${num}`])).length) > 3 ? "List Style" : "Button Style"}
            </p>
            <p className="truncate max-w-[180px] text-text-main">{data.text || "Choose an option..."}</p>
          </div>
        ) : isGotoNode ? (
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-[9px] text-primary font-black uppercase tracking-tight">
              <ArrowRight size={10} />
              {data.gotoType === "bot" ? "Other Bot" : data.gotoType === "flow" ? "Bot Flow" : "Internal Node"}
            </div>
            <p className={`truncate font-bold bg-surface p-1 rounded border ${
              !data.targetNode && !data.targetBotId
                ? "text-primary border-primary/30 animate-pulse"
                : "text-text-main border-border-main"
            }`}>
              {data.gotoType === "flow" ? data.targetFlowId || "Unconfigured" : data.targetNode || data.targetBotId || "Unconfigured"}
            </p>
          </div>
        ) : isAgentNode ? (
          <div className="flex items-center gap-2 text-primary">
            <Headset size={14} />
            <span className="text-[10px] font-bold uppercase">Handoff to Human</span>
          </div>
        ) : isApiNode ? (
          <div className="space-y-1">
            <div className="text-[9px] font-black uppercase tracking-wide text-primary">
              {String(data.method || "GET").toUpperCase()}
            </div>
            <p className="truncate font-mono text-[10px] text-text-main">
              {data.url || "https://api.example.com"}
            </p>
            <p className="text-[9px] text-text-muted">Save to: {data.saveTo || "api_response"}</p>
          </div>
        ) : isAiIntentNode ? (
          <div className="space-y-2">
            <div className="flex items-center gap-1 text-[9px] text-violet-700 font-black uppercase tracking-tight">
              <BrainCircuit size={10} /> Intent Router
            </div>
            <p className="truncate max-w-[180px] text-text-main">{data.prompt || data.text || "Classify user intent..."}</p>
            <div className="flex flex-wrap items-center gap-1 text-[9px] font-bold">
              <span className="rounded-full bg-violet-50 px-2 py-0.5 text-violet-700 border border-violet-200">
                Save to: {data.saveTo || "detected_intent"}
              </span>
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700 border border-amber-200">
                Fallback: {fallbackHandle}
              </span>
            </div>
            <div className="space-y-2 pt-1">
              {aiIntents.map((intent: any, index: number) => {
                const intentHandle = String(intent?.handle || `intent_${index + 1}`).trim() || `intent_${index + 1}`;
                const intentLabel = String(intent?.label || intentHandle).trim() || intentHandle;
                return (
                  <div
                    key={intentHandle}
                    className="relative flex items-center justify-end gap-2 rounded-lg border border-emerald-100 bg-emerald-50/70 px-2.5 py-1.5 pr-5"
                  >
                    <div className="min-w-0 text-right">
                      <p className="truncate text-[10px] font-black uppercase tracking-widest text-emerald-800">
                        {intentLabel}
                      </p>
                      <p className="truncate text-[9px] text-emerald-700/80 font-mono">{intentHandle}</p>
                    </div>
                    <Handle
                      type="source"
                      position={Position.Right}
                      id={intentHandle}
                      className={`${handleClassName} !bg-emerald-500 !border-white`}
                      style={{ ...baseHandleStyle, right: handleOffset, background: "#10B981" }}
                    />
                  </div>
                );
              })}

              <div className="relative flex items-center justify-end gap-2 rounded-lg border border-amber-100 bg-amber-50/80 px-2.5 py-1.5 pr-5">
                <div className="min-w-0 text-right">
                  <p className="truncate text-[10px] font-black uppercase tracking-widest text-amber-800">
                    Fallback
                  </p>
                  <p className="truncate text-[9px] text-amber-700/80 font-mono">{fallbackHandle}</p>
                </div>
                <Handle
                  type="source"
                  position={Position.Right}
                  id={fallbackHandle}
                  className={`${handleClassName} !bg-amber-500 !border-white`}
                  style={{ ...baseHandleStyle, right: handleOffset, background: "#F59E0B" }}
                />
              </div>
            </div>
          </div>
        ) : isAiExtractNode ? (
          <div className="space-y-2">
            <div className="flex items-center gap-1 text-[9px] text-cyan-700 font-black uppercase tracking-tight">
              <BrainCircuit size={10} /> Data Extractor
            </div>
            <p className="truncate max-w-[180px] text-text-main">{data.prompt || data.text || "Extract variables..."}</p>
            <div className="flex flex-wrap items-center gap-1 text-[9px] font-bold">
              <span className="rounded-full bg-cyan-50 px-2 py-0.5 text-cyan-700 border border-cyan-200">
                Req: {Array.isArray(data.requiredFields) ? data.requiredFields.length : 0}
              </span>
              <span className="rounded-full bg-sky-50 px-2 py-0.5 text-sky-700 border border-sky-200">
                Opt: {Array.isArray(data.optionalFields) ? data.optionalFields.length : 0}
              </span>
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700 border border-amber-200">
                Incomplete: {String(data.onIncomplete || "incomplete")}
              </span>
            </div>
          </div>
        ) : isAiNode ? (
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-[9px] text-primary font-black uppercase tracking-tight">
              <Bot size={10} /> AI Generate
            </div>
            <p className="truncate max-w-[180px] text-text-main">{data.prompt || data.text || "Prompt AI..."}</p>
            <p className="text-[9px] text-text-muted">Save to: {data.saveTo || data.outputVariable || "ai_output"}</p>
          </div>
        ) : isBusinessHoursNode ? (
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-[9px] text-primary font-black uppercase tracking-tight">
              <Clock size={10} /> Business Hours
            </div>
            <p className="truncate max-w-[180px] text-text-main">
              {data.startTime || "09:00"} - {data.endTime || "17:00"} {data.timezone ? `(${data.timezone})` : ""}
            </p>
            <p className="text-[9px] text-text-muted">Open / Closed routing</p>
          </div>
        ) : isSplitTrafficNode ? (
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-[9px] text-primary font-black uppercase tracking-tight">
              <Split size={10} /> Split Traffic
            </div>
            <p className="truncate max-w-[180px] text-text-main">
              A: {Number(data.percentA || 50)}% | B: {Number(data.percentB || 50)}%
            </p>
            <p className="text-[9px] text-text-muted">Random A/B routing</p>
          </div>
        ) : isTriggerNode ? (
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-[9px] text-primary font-black uppercase tracking-tight">
              <Play size={10} /> Trigger Entry
            </div>
            <p className="truncate max-w-[180px] text-text-main">{data.text || "Configure trigger..."}</p>
          </div>
        ) : data.text ? (
          <div className="space-y-1">
            <p className="truncate max-w-[180px] text-text-main">{data.text}</p>
            {Number(data.delayMs || 0) > 0 ? (
              <p className="text-[9px] font-bold uppercase tracking-wide text-text-muted">
                Delay {Number(data.delayMs)} ms
              </p>
            ) : null}
            {resolvedInvalid ? (
              <p className="text-[9px] font-black uppercase tracking-wide text-rose-600">
                {resolvedValidationMessage || "Missing connection"}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="space-y-1">
            <p className="italic text-text-muted">Configure node...</p>
            {resolvedInvalid ? (
              <p className="text-[9px] font-black uppercase tracking-wide text-rose-600">
                {resolvedValidationMessage || "Missing connection"}
              </p>
            ) : null}
          </div>
        )}
      </div>

      {maxItems > 0 && (
        <div className="border-t border-border-main bg-surface flex flex-col">
          {Array.from({ length: maxItems }, (_, i) => i + 1).map((num) => {
            const itemText = data[`item${num}`];
            if (!itemText && num > 1) return null;
            return (
              <div
                key={num}
                className="relative p-2 text-[10px] font-bold text-center border-b border-border-main last:border-0 text-text-muted"
              >
                <span className="truncate block px-2">{itemText || `Item ${num}`}</span>
                <Handle
                  type="source"
                  position={Position.Right}
                  id={`item${num}`}
                  className={sideHandleClassName}
                  style={{ ...sideHandleStyle, background: "var(--primary)" }}
                />
              </div>
            );
          })}
        </div>
      )}

      {isConditionNode && (
        <div className="border-t border-border-main bg-surface flex flex-col">
          <div className="relative p-2 text-[10px] font-bold text-center border-b border-border-main text-primary">
            <span>True</span>
            <Handle
              type="source"
              position={Position.Right}
              id="true"
              className={sideHandleClassName}
              style={{ ...sideHandleStyle, background: "var(--primary)" }}
            />
          </div>
          <div className="relative p-2 text-[10px] font-bold text-center text-text-muted">
            <span>False</span>
            <Handle
              type="source"
              position={Position.Right}
              id="false"
              className={sideHandleClassName}
              style={{ ...sideHandleStyle, background: "var(--text-muted)" }}
            />
          </div>
        </div>
      )}

      {isApiNode && (
        <div className="border-t border-border-main bg-surface flex flex-col">
          <div className="relative p-2 text-[10px] font-bold text-center border-b border-border-main text-primary">
            <span>On Success</span>
            <Handle
              type="source"
              position={Position.Right}
              id="success"
              className={sideHandleClassName}
              style={{ ...sideHandleStyle, background: "var(--primary)" }}
            />
          </div>
          <div className="relative p-2 text-[10px] font-bold text-center text-text-muted">
            <span>On Error</span>
            <Handle
              type="source"
              position={Position.Right}
              id="error"
              className={sideHandleClassName}
              style={{ ...sideHandleStyle, background: "var(--text-muted)" }}
            />
          </div>
        </div>
      )}

      {isWaitingNode && (
        <div className="border-t border-border-main bg-surface flex flex-col">
          {isInputNode && (
            <div className="relative p-2 text-[10px] font-bold text-center border-b border-border-main text-primary">
              <span>On Response</span>
              <Handle
                type="source"
                position={Position.Right}
                id="response"
                className={sideHandleClassName}
                style={{ ...sideHandleStyle, background: "var(--primary)" }}
              />
            </div>
          )}
          <div className="relative p-2 text-[10px] font-bold text-center text-text-muted">
            <span>On Timeout</span>
            <Handle
              type="source"
              position={Position.Right}
              id="timeout"
              className={sideHandleClassName}
              style={{ ...sideHandleStyle, background: "var(--text-muted)" }}
            />
          </div>
        </div>
      )}

      {isAiExtractNode && (
        <div className="border-t border-border-main bg-surface flex flex-col">
          <div className="relative p-2 text-[10px] font-bold text-center border-b border-border-main text-cyan-700">
            <span>Success</span>
            <Handle
              type="source"
              position={Position.Right}
              id="next"
              className={sideHandleClassName}
              style={{ ...sideHandleStyle, background: "#06B6D4" }}
            />
          </div>
          <div className="relative p-2 text-[10px] font-bold text-center text-amber-700">
            <span>{String(data.onIncomplete || "incomplete").trim() || "incomplete"}</span>
            <Handle
              type="source"
              position={Position.Right}
              id={String(data.onIncomplete || "incomplete").trim() || "incomplete"}
              className={sideHandleClassName}
              style={{ ...sideHandleStyle, background: "#F59E0B" }}
            />
          </div>
        </div>
      )}

      {!isEndNode &&
      !isGotoNode &&
      !isInputNode &&
      !isMenuNode &&
      !isAiIntentNode &&
      !isAiExtractNode &&
      !isAiNode &&
      !isBusinessHoursNode &&
      !isSplitTrafficNode &&
      !isConditionNode &&
      !isApiNode &&
      !isTriggerNode &&
      maxItems === 0 ? (
        <Handle
          type="source"
          position={Position.Right}
          className={handleClassName}
          style={{ ...baseHandleStyle, background: "var(--primary)", right: handleOffset }}
        />
      ) : null}
    </div>
  );
}
