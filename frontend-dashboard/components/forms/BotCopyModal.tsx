import { useEffect, useState } from "react";
import { Copy, Loader2, X } from "lucide-react";

import { flowService } from "../../services/flowService";
import { notify } from "../../store/uiStore";

interface BotCopyModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceBot: any;
}

function pickExportFlow(flows: any[]) {
  const normalizedFlows = Array.isArray(flows) ? flows.filter(Boolean) : [];
  if (normalizedFlows.length === 0) {
    return null;
  }

  return (
    normalizedFlows.find((flow: any) => Boolean(flow?.is_default)) ||
    normalizedFlows.find((flow: any) => !Boolean(flow?.is_system_flow)) ||
    normalizedFlows[0]
  );
}

function buildPasteReadyFlowJson(sourceBot: any, flow: any) {
  const flowJson = flow?.flow_json && typeof flow.flow_json === "object" ? flow.flow_json : {};

  return {
    flow_name: String(flow?.flow_name || sourceBot?.name || "Bot Flow").trim(),
    layout_left_to_right: Boolean(
      flowJson.layout_left_to_right ?? flowJson.layoutLeftToRight ?? flowJson.layout_leftToRight ?? true
    ),
    nodes: Array.isArray(flowJson.nodes) ? flowJson.nodes : [],
    edges: Array.isArray(flowJson.edges) ? flowJson.edges : [],
  };
}

async function copyToClipboard(text: string) {
  if (navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const fallback = document.createElement("textarea");
  fallback.value = text;
  fallback.setAttribute("readonly", "true");
  fallback.style.position = "fixed";
  fallback.style.opacity = "0";
  document.body.appendChild(fallback);
  fallback.select();
  document.execCommand("copy");
  document.body.removeChild(fallback);
}

export default function BotCopyModal({ isOpen, onClose, sourceBot }: BotCopyModalProps) {
  const [loadingExport, setLoadingExport] = useState(false);
  const [copying, setCopying] = useState(false);
  const [exportJson, setExportJson] = useState("");
  const [exportFlowName, setExportFlowName] = useState("");

  useEffect(() => {
    if (!isOpen || !sourceBot) {
      setExportJson("");
      setExportFlowName("");
      return;
    }

    let cancelled = false;

    setLoadingExport(true);
    flowService
      .getFlowSummaries(String(sourceBot.id))
      .then((flows) => {
        if (cancelled) {
          return;
        }
        const selectedFlow = pickExportFlow(flows);
        const payload = buildPasteReadyFlowJson(sourceBot, selectedFlow);
        setExportFlowName(String(payload.flow_name || "").trim());
        setExportJson(JSON.stringify(payload, null, 2));
      })
      .catch((err) => {
        console.error("Failed to load bot flow export", err);
        if (!cancelled) {
          const fallbackPayload = buildPasteReadyFlowJson(sourceBot, null);
          setExportFlowName(String(fallbackPayload.flow_name || "").trim());
          setExportJson(JSON.stringify(fallbackPayload, null, 2));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingExport(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, sourceBot]);

  if (!isOpen || !sourceBot) return null;

  const handleCopyJson = async () => {
    if (!exportJson) {
      notify("No flow JSON is available yet.", "error");
      return;
    }

    setCopying(true);
    try {
      await copyToClipboard(exportJson);
      notify("Flow JSON copied. Paste it into a new flow.", "success");
    } catch (err) {
      console.error("Copy flow JSON failed", err);
      notify("Failed to copy flow JSON.", "error");
    } finally {
      setCopying(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await handleCopyJson();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-[2rem] border border-border-main bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border-main bg-surface p-6">
          <div>
            <h2 className="text-lg font-black uppercase tracking-tight text-text-main">
              Copy Bot Flow JSON
            </h2>
            <p className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-text-muted">
              Paste-ready export for the flow builder
            </p>
          </div>
          <button onClick={onClose} className="text-text-muted transition hover:text-text-main">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col gap-5 p-8">
          <div className="rounded-2xl border border-border-main bg-canvas p-4">
            <div className="text-[10px] font-black uppercase tracking-widest text-text-muted">
              Source Bot
            </div>
            <div className="mt-2 text-sm font-semibold text-text-main">
              {sourceBot.name || "Unnamed Bot"}
            </div>
            <div className="mt-1 text-[11px] text-text-muted">
              This exports the bot&apos;s primary flow in the exact JSON shape the builder can import.
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-text-muted">
                  Paste-ready JSON
                </div>
                <div className="mt-1 text-xs text-text-muted">
                  Flow: <span className="font-semibold text-text-main">{exportFlowName || "Loading..."}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCopyJson}
                disabled={loadingExport || copying || !exportJson}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-black uppercase tracking-[0.16em] text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loadingExport || copying ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Copy size={14} />
                )}
                Copy JSON
              </button>
            </div>

            <textarea
              readOnly
              value={exportJson || (loadingExport ? "Loading flow JSON..." : "")}
              className="min-h-[28rem] w-full flex-1 rounded-2xl border border-border-main bg-canvas p-4 font-mono text-[11px] leading-6 text-text-main outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
            <div className="rounded-2xl border border-primary/20 bg-primary/8 px-4 py-3 text-[11px] leading-6 text-text-muted">
              Copy this JSON and paste it into a new flow import. The builder will preserve the node
              positions, layout direction, and edge connections.
            </div>
          </div>

          <div className="flex gap-4 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-border-main bg-transparent px-4 py-3 text-xs font-black text-text-main transition-all hover:bg-primary-fade hover:text-primary hover:border-primary/30"
            >
              CLOSE
            </button>
            <button
              type="submit"
              disabled={loadingExport || copying || !exportJson}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-xs font-black text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loadingExport || copying ? <Loader2 size={14} className="animate-spin" /> : <Copy size={14} />}{" "}
              COPY JSON
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
