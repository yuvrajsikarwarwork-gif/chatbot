import { useMemo } from "react";
import { ArrowRight, BellOff, Info, ShieldAlert, X } from "lucide-react";

type KeywordInterruptRule = {
  keywords?: string[] | string;
  flow_id?: string;
  flowId?: string;
  target_flow_id?: string;
  targetFlowId?: string;
};

type GlobalSettings = {
  system_messages?: {
    fallback_message?: string;
    opt_out_message?: string;
  };
  system_flows?: {
    handoff_flow_id?: string;
    csat_flow_id?: string;
  };
  keyword_interrupts?: KeywordInterruptRule[];
};

interface GlobalRulesInfoPanelProps {
  isOpen: boolean;
  onClose: () => void;
  botId?: string | null;
  botName?: string;
  globalSettings?: GlobalSettings | null;
  flowSummaries?: Array<{ id: string; flow_name?: string; name?: string }>;
  onEditGlobalRules?: () => void;
}

function normalizeKeywords(keywords: KeywordInterruptRule["keywords"]) {
  if (Array.isArray(keywords)) {
    return keywords.map((keyword) => String(keyword || "").trim()).filter(Boolean);
  }

  return String(keywords || "")
    .split(",")
    .map((keyword) => keyword.trim())
    .filter(Boolean);
}

function RouteBadge({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2">
      <div className="text-[9px] font-black uppercase tracking-[0.22em] text-emerald-300">
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold text-white">{value}</div>
    </div>
  );
}

export default function GlobalRulesInfoPanel({
  isOpen,
  onClose,
  botId,
  botName,
  globalSettings,
  flowSummaries = [],
  onEditGlobalRules,
}: GlobalRulesInfoPanelProps) {
  const flowLookup = useMemo(() => {
    const map = new Map<string, string>();
    for (const flow of flowSummaries) {
      map.set(String(flow.id), String(flow.flow_name || flow.name || "Untitled flow"));
    }
    return map;
  }, [flowSummaries]);

  const keywordInterrupts = Array.isArray(globalSettings?.keyword_interrupts)
    ? globalSettings?.keyword_interrupts
    : [];
  const handoffFlowId = String(globalSettings?.system_flows?.handoff_flow_id || "").trim();
  const csatFlowId = String(globalSettings?.system_flows?.csat_flow_id || "").trim();
  const handoffFlowName = handoffFlowId ? flowLookup.get(handoffFlowId) || "Human Handoff Flow" : "Disabled";
  const csatFlowName = csatFlowId ? flowLookup.get(csatFlowId) || "CSAT Flow" : "Disabled";
  const fallbackMessage =
    String(globalSettings?.system_messages?.fallback_message || "").trim() ||
    "I didn't quite understand that. Can you rephrase?";
  const optOutMessage =
    String(globalSettings?.system_messages?.opt_out_message || "").trim() ||
    "You have been unsubscribed.";
  const resetKeywords = ["reset", "restart", "home", "menu", "start"];
  const endKeywords = ["end", "exit", "cancel", "quit", "conversation end"];

  if (!isOpen) return null;

  const attachedToBot = Boolean(botId);

  return (
    <div className="fixed inset-0 z-[120]">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close global rules panel"
      />

      <aside className="absolute right-0 top-0 h-full w-full max-w-xl overflow-y-auto border-l border-emerald-500/20 bg-slate-950 text-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.24em] text-emerald-400">
              <Info size={14} />
              Global Rules Active
            </div>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-white">
              Active Global Rules
            </h2>
            <p className="mt-2 max-w-lg text-sm leading-6 text-slate-300">
              Because this flow is attached to your Bot, the Bot is always listening for these universal commands in the background. If a user types one of these, it will instantly interrupt this flow.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:border-emerald-400/40 hover:bg-emerald-500/10 hover:text-white"
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-5 px-6 py-6">
          {!attachedToBot ? (
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-5 text-sm leading-6 text-emerald-100">
              This flow is not yet attached to a Bot. No global rules are currently active.
            </div>
          ) : (
            <>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <div className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.24em] text-emerald-400">
                  <ShieldAlert size={14} />
                  Permanent System Commands
                </div>

                <div className="mb-4 grid gap-3 md:grid-cols-3">
                  <RouteBadge label="Opt-Out Route" value="Direct Text Reply" />
                  <RouteBadge label="Handoff Route" value={handoffFlowName} />
                  <RouteBadge label="CSAT Route" value={csatFlowName} />
                </div>

                <div className="space-y-4 text-sm leading-6 text-slate-200">
                  <div className="rounded-xl border border-white/10 bg-slate-900/80 p-4">
                    <div className="mb-2 flex items-center gap-2 font-black text-white">
                      <BellOff size={16} className="text-emerald-400" />
                      Opt-Out
                    </div>
                    <p className="text-slate-300">
                      If a user types exactly <span className="font-black text-white">STOP</span> or{" "}
                      <span className="font-black text-white">UNSUBSCRIBE</span>, the bot will instantly opt them out of marketing and reply with your configured Opt-Out Message.
                    </p>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-slate-900/80 p-4">
                    <div className="mb-2 flex items-center gap-2 font-black text-white">
                      <Info size={16} className="text-emerald-400" />
                      Fallback
                    </div>
                    <p className="text-slate-300">
                      If the user types something the bot doesn&apos;t understand, it will reply with your Fallback Message.
                    </p>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-slate-900/80 p-4">
                    <div className="mb-2 flex items-center gap-2 font-black text-white">
                      <ArrowRight size={16} className="text-emerald-400" />
                      Reset / Restart Keywords
                    </div>
                    <p className="text-slate-300">
                      These keywords are treated as built-in shortcuts to restart the current journey or jump back to the bot&apos;s main flow.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {resetKeywords.map((keyword) => (
                        <span
                          key={keyword}
                          className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-300"
                        >
                          {keyword}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-slate-900/80 p-4">
                    <div className="mb-2 flex items-center gap-2 font-black text-white">
                      <ArrowRight size={16} className="text-emerald-400" />
                      End / Escape Keywords
                    </div>
                    <p className="text-slate-300">
                      These keywords can end a conversation or cancel the current flow when the engine is waiting for a new command.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {endKeywords.map((keyword) => (
                        <span
                          key={keyword}
                          className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-300"
                        >
                          {keyword}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                      <div className="text-[9px] font-black uppercase tracking-[0.22em] text-emerald-300">
                        Current Opt-Out Message
                      </div>
                      <p className="mt-2 text-sm leading-6 text-white">{optOutMessage}</p>
                    </div>
                    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                      <div className="text-[9px] font-black uppercase tracking-[0.22em] text-emerald-300">
                        Current Fallback Message
                      </div>
                      <p className="mt-2 text-sm leading-6 text-white">{fallbackMessage}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <div className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.24em] text-emerald-400">
                  <ArrowRight size={14} />
                  Custom Keyword Interrupts
                </div>
                {keywordInterrupts.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-white/10 bg-slate-900/80 p-4 text-sm text-slate-300">
                    No custom keyword interrupts are enabled for this bot yet.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {keywordInterrupts.map((rule, index) => {
                      const keywords = normalizeKeywords(rule?.keywords);
                      const targetFlowId = String(
                        rule?.target_flow_id || rule?.targetFlowId || rule?.flow_id || rule?.flowId || ""
                      ).trim();
                      const targetFlowName = targetFlowId ? flowLookup.get(targetFlowId) || "Selected Flow" : "Unassigned";

                      return (
                        <div key={`${index}-${targetFlowId}`} className="rounded-xl border border-white/10 bg-slate-900/80 p-4">
                          <div className="flex flex-wrap items-center gap-2">
                            {keywords.length > 0 ? (
                              keywords.map((keyword) => (
                                <span
                                  key={keyword}
                                  className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-300"
                                >
                                  {keyword}
                                </span>
                              ))
                            ) : (
                              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-300">
                                No keywords
                              </span>
                            )}
                            <span className="text-sm font-bold text-slate-300">→ Routes to:</span>
                            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-200">
                              {targetFlowName}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-5">
                <div className="mb-2 text-[10px] font-black uppercase tracking-[0.24em] text-emerald-300">
                  How to Edit
                </div>
                <p className="text-sm leading-6 text-slate-100">
                  Want to change these keywords or update your fallback messages? Save your current flow, go back to the Bots page, and click Edit Bot &gt; Global Rules.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  {onEditGlobalRules ? (
                    <button
                      type="button"
                      onClick={onEditGlobalRules}
                      className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-slate-950 transition hover:bg-emerald-400"
                    >
                      Open Bot Rules
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-white transition hover:border-emerald-400/40 hover:bg-emerald-500/10"
                  >
                    Keep Editing Flow
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
