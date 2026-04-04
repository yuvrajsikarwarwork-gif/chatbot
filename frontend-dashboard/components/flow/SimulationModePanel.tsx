import { useEffect, useMemo, useState } from "react";
import { Bot, MessageSquareMore, RefreshCw, Sparkles } from "lucide-react";
import type { Node } from "reactflow";

type SimulationMessage = {
  role: "system" | "user" | "bot";
  text: string;
};

type SimulationModePanelProps = {
  flowName?: string | null;
  flowId?: string | null;
  selectedNode?: Node | null;
};

function buildSeedTranscript(flowName?: string | null, selectedNode?: Node | null): SimulationMessage[] {
  const flowLabel = String(flowName || "Untitled flow").trim() || "Untitled flow";
  const nodeLabel = String(
    selectedNode?.data?.label ||
      selectedNode?.data?.text ||
      selectedNode?.type ||
      selectedNode?.id ||
      "current node"
  ).trim();
  const nodeType = String(selectedNode?.type || "node").replace(/_/g, " ");

  return [
    {
      role: "system",
      text: `Simulation mode is read-only and focused on customer experience for ${flowLabel}.`,
    },
    {
      role: "user",
      text: "Hi, I need help with my order.",
    },
    {
      role: "bot",
      text:
        selectedNode?.id
          ? `I’m previewing the selected ${nodeType} node: ${nodeLabel}. This is where the flow would respond to the customer.`
          : "Select a node to preview how this flow responds at a specific step.",
    },
    {
      role: "user",
      text: "Can you confirm the next step for me?",
    },
    {
      role: "bot",
      text:
        "Absolutely. In simulation mode, you can review the end-user tone without variables, provenance, or technical overlays distracting the review.",
    },
  ];
}

function Bubble({ message }: { message: SimulationMessage }) {
  if (message.role === "system") {
    return (
      <div className="mx-auto max-w-[92%] rounded-2xl border border-border-main bg-surface px-4 py-3 text-center text-[11px] leading-5 text-text-muted shadow-sm">
        {message.text}
      </div>
    );
  }

  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[82%] rounded-3xl px-4 py-3 text-sm leading-6 shadow-sm ${
          isUser
            ? "rounded-br-md bg-primary text-white"
            : "rounded-bl-md border border-border-main bg-white text-text-main"
        }`}
      >
        {message.text}
      </div>
    </div>
  );
}

export default function SimulationModePanel({
  flowName,
  flowId,
  selectedNode,
}: SimulationModePanelProps) {
  const seed = useMemo(() => buildSeedTranscript(flowName, selectedNode), [flowName, selectedNode?.id, selectedNode?.type, selectedNode?.data]);
  const [messages, setMessages] = useState<SimulationMessage[]>(seed);

  useEffect(() => {
    setMessages(seed);
  }, [seed]);

  const handleResetSession = () => {
    setMessages(seed);
  };

  const selectedNodeLabel = String(
    selectedNode?.data?.label ||
      selectedNode?.data?.text ||
      selectedNode?.type ||
      selectedNode?.id ||
      ""
  ).trim();

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      <div className="flex items-start justify-between gap-3 border-b border-border-main bg-surface px-5 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-text-muted">
            <MessageSquareMore size={13} className="text-primary" />
            Simulation Mode
          </div>
          <h3 className="mt-2 truncate text-sm font-semibold text-text-main">
            {flowName?.trim() || "Untitled flow"}
          </h3>
          <p className="mt-1 text-xs leading-5 text-text-muted">
            Review the customer-facing conversation without variable dumps, provenance, or other technical overlays.
          </p>
        </div>
        <button
          type="button"
          onClick={handleResetSession}
          className="inline-flex shrink-0 items-center gap-2 rounded-full border border-primary/20 bg-primary-fade px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-primary transition hover:border-primary/30 hover:bg-primary/10"
        >
          <RefreshCw size={12} />
          Reset Session
        </button>
      </div>

      <div className="border-b border-border-main bg-canvas px-5 py-4">
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-2xl border border-border-main bg-surface px-3 py-2">
            <div className="text-[9px] font-black uppercase tracking-[0.18em] text-text-muted">Preview</div>
            <div className="mt-1 text-sm font-semibold text-text-main">Output only</div>
          </div>
          <div className="rounded-2xl border border-border-main bg-surface px-3 py-2">
            <div className="text-[9px] font-black uppercase tracking-[0.18em] text-text-muted">Focus</div>
            <div className="mt-1 text-sm font-semibold text-text-main">
              {selectedNodeLabel || "No node selected"}
            </div>
          </div>
          <div className="rounded-2xl border border-border-main bg-surface px-3 py-2">
            <div className="text-[9px] font-black uppercase tracking-[0.18em] text-text-muted">Flow ID</div>
            <div className="mt-1 truncate font-mono text-[11px] text-text-main">
              {flowId || "n/a"}
            </div>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          {messages.map((message, index) => (
            <Bubble key={`simulation-${index}`} message={message} />
          ))}
        </div>
      </div>

      <div className="border-t border-border-main bg-surface px-5 py-3">
        <div className="flex items-center gap-2 text-[10px] font-medium text-text-muted">
          <Sparkles size={12} className="text-primary" />
          Simulation mode intentionally hides variables, provenance, and node JSON to keep brand review clean.
        </div>
      </div>
    </div>
  );
}
