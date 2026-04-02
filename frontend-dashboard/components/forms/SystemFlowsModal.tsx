import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Save, Trash2, X } from "lucide-react";

import { botService } from "../../services/botService";
import { notify } from "../../store/uiStore";

type SystemInterruptRule = {
  id: string;
  keywords: string;
  targetFlowType: "handoff";
};

type SystemEventRule = {
  id: string;
  eventType: "conversation_closed_by_agent";
  enabled: boolean;
  targetFlowType: "csat";
};

function mergeSettingsSources(...sources: any[]) {
  return sources.reduce((acc, source) => {
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      return acc;
    }
    return { ...acc, ...source };
  }, {});
}

function createId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeKeywordString(value: string) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .join(", ");
}

function readSystemRules(settingsJson: any) {
  const settings = settingsJson && typeof settingsJson === "object" ? settingsJson : {};
  const legacySystemRules =
    settings.system_rules && typeof settings.system_rules === "object"
      ? settings.system_rules
      : settings.systemRules && typeof settings.systemRules === "object"
        ? settings.systemRules
        : settings.systemTriggers && typeof settings.systemTriggers === "object"
          ? settings.systemTriggers
          : settings.system_triggers && typeof settings.system_triggers === "object"
            ? settings.system_triggers
            : {};

  const interruptSource = Array.isArray(settings.interrupts)
    ? settings.interrupts
    : Array.isArray(legacySystemRules.interrupts)
    ? legacySystemRules.interrupts
    : Array.isArray(settings.keyword_interrupts)
      ? settings.keyword_interrupts
      : Array.isArray(settings.universal_rules)
        ? settings.universal_rules
        : Array.isArray(settings.universalRules)
          ? settings.universalRules
          : [];

  const eventSource = Array.isArray(settings.events)
    ? settings.events
    : Array.isArray(legacySystemRules.events)
      ? legacySystemRules.events
      : [];

  const interrupts: SystemInterruptRule[] = interruptSource
    .map((rule: any) => ({
      id: String(rule?.id || createId("interrupt")).trim(),
      keywords: normalizeKeywordString(
        Array.isArray(rule?.keywords)
          ? rule.keywords.join(", ")
          : rule?.keywords || rule?.keyword || rule?.trigger_keywords || rule?.triggerKeywords || ""
      ),
      targetFlowType: "handoff" as const,
    }))
    .filter((rule: SystemInterruptRule) => rule.keywords.length > 0);

  const events: SystemEventRule[] = eventSource.length
    ? eventSource.map((rule: any) => ({
        id: String(rule?.id || createId("event")).trim(),
        eventType: "conversation_closed_by_agent" as const,
        enabled: Boolean(
          typeof rule?.enabled === "boolean"
            ? rule.enabled
            : typeof rule?.active === "boolean"
              ? rule.active
              : typeof rule?.is_enabled === "boolean"
                ? rule.is_enabled
                : true
        ),
        targetFlowType: "csat" as const,
      }))
    : [
        {
          id: createId("event"),
          eventType: "conversation_closed_by_agent",
          enabled:
            Boolean(settings.csat_flow_id || settings.csatFlowId || settings.conversationCloseFlowId) ||
            String(settings.csat_mode || settings.csatMode || "").trim() === "default",
          targetFlowType: "csat",
        },
      ];

  return { interrupts, events };
}

interface SystemFlowsModalProps {
  isOpen: boolean;
  onClose: () => void;
  bot: any;
  onSuccess: () => void;
}

export default function SystemFlowsModal({ isOpen, onClose, bot, onSuccess }: SystemFlowsModalProps) {
  const [name, setName] = useState("");
  const [interrupts, setInterrupts] = useState<SystemInterruptRule[]>([]);
  const [events, setEvents] = useState<SystemEventRule[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [resolvedBot, setResolvedBot] = useState<any>(bot);

  const mergedSettings = useMemo(
    () =>
      mergeSettingsSources(
        resolvedBot?.settings,
        resolvedBot?.settings_json,
        resolvedBot?.global_settings,
        bot?.settings,
        bot?.settings_json,
        bot?.global_settings
      ),
    [bot?.global_settings, bot?.settings, bot?.settings_json, resolvedBot?.global_settings, resolvedBot?.settings, resolvedBot?.settings_json]
  );

  useEffect(() => {
    if (!isOpen || !bot?.id) {
      return;
    }

    setResolvedBot(bot);
    setName(bot.name || "");
    setInterrupts([]);
    setEvents([]);

    botService
      .getBot(bot.id)
      .then((freshBot) => {
        if (!freshBot) {
          return;
        }

        setResolvedBot(freshBot);
        setName(freshBot.name || bot.name || "");
        const parsed = readSystemRules(mergeSettingsSources(freshBot.settings, freshBot.settings_json, freshBot.global_settings));
        setInterrupts(parsed.interrupts);
        setEvents(parsed.events);
      })
      .catch((err) => {
        console.error("Failed to hydrate system flows", err);
        const parsed = readSystemRules(mergeSettingsSources(bot.settings, bot.settings_json, bot.global_settings));
        setInterrupts(parsed.interrupts);
        setEvents(parsed.events);
      });
  }, [bot, isOpen]);

  if (!isOpen || !bot) {
    return null;
  }

  const addInterrupt = () => {
    setInterrupts((current) => [
      ...current,
      {
        id: createId("interrupt"),
        keywords: "",
        targetFlowType: "handoff",
      },
    ]);
  };

  const save = async () => {
    setIsSaving(true);

    try {
      const cleanedInterrupts = interrupts
        .map((rule) => ({
          id: rule.id,
          keywords: normalizeKeywordString(rule.keywords),
          target_flow_type: "handoff" as const,
        }))
        .filter((rule) => rule.keywords.length > 0);

      const cleanedEvents = events.map((rule) => ({
        id: rule.id,
        event_type: rule.eventType,
        enabled: Boolean(rule.enabled),
        target_flow_type: "csat" as const,
      }));

      const nextSettings = {
        ...mergedSettings,
        system_rules: {
          interrupts: cleanedInterrupts,
          events: cleanedEvents,
        },
      };

      await botService.updateBot(bot.id, {
        globalSettings: nextSettings,
        settingsJson: nextSettings,
      });

      notify("System flows updated.", "success");
      onSuccess();
      onClose();
    } catch (err) {
      console.error("Failed to save system flows", err);
      notify("Failed to save system flows.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 flex h-[94vh] max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-[2rem] border border-border-main bg-surface shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between border-b border-border-main bg-surface p-6">
          <div>
            <h2 className="font-black uppercase tracking-tighter text-text-main">System Flows</h2>
            <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
              {name || bot?.name || "Bot"} · Keyword interrupts and event triggers
            </p>
          </div>

          <button onClick={onClose} className="rounded-full p-2 transition-colors hover:bg-primary-fade">
            <X size={20} className="text-text-muted" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8">
          <div className="space-y-6">
            <section className="rounded-[1.5rem] border border-border-main bg-canvas p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-text-muted">
                    Keyword Interrupts
                  </div>
                  <p className="mt-1 max-w-2xl text-sm text-text-muted">
                    Match inbound text and jump into the human handoff flow. CSAT is intentionally hidden here.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={addInterrupt}
                  className="inline-flex items-center gap-2 rounded-full border border-border-main bg-surface px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-text-main transition hover:border-primary/30 hover:bg-primary-fade hover:text-primary"
                >
                  <Plus size={14} />
                  Add Rule
                </button>
              </div>

              <div className="mt-5 space-y-3">
                {interrupts.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border-main bg-surface px-4 py-5 text-sm text-text-muted">
                    No keyword interrupts yet. Add one for support, help, human, or agent.
                  </div>
                ) : null}

                {interrupts.map((rule, index) => (
                  <div
                    key={rule.id}
                    className="grid gap-3 rounded-2xl border border-border-main bg-surface p-4 md:grid-cols-[1.3fr_1fr_auto]"
                  >
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">
                        Keywords
                      </label>
                      <input
                        type="text"
                        value={rule.keywords}
                        onChange={(e) =>
                          setInterrupts((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, keywords: e.target.value } : item
                            )
                          )
                        }
                        placeholder="human, support, agent"
                        className="w-full rounded-2xl border border-border-main bg-canvas px-4 py-3 text-sm font-semibold text-text-main outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">
                        Target Flow
                      </label>
                      <select
                        value={rule.targetFlowType}
                        onChange={(e) =>
                          setInterrupts((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, targetFlowType: e.target.value as "handoff" }
                                : item
                            )
                          )
                        }
                        className="w-full rounded-2xl border border-border-main bg-canvas px-4 py-3 text-sm font-semibold text-text-main outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary"
                      >
                        <option value="handoff">Global: Human Handoff</option>
                      </select>
                    </div>

                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={() => setInterrupts((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                        className="inline-flex h-[48px] items-center justify-center rounded-2xl border border-border-main bg-canvas px-4 text-text-muted transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                        title="Remove rule"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-[1.5rem] border border-border-main bg-canvas p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-text-muted">
                    Event Auto-Triggers
                  </div>
                  <p className="mt-1 max-w-2xl text-sm text-text-muted">
                    System events fire automatically in the backend. No keywords are needed.
                  </p>
                </div>
                <div className="rounded-full border border-border-main bg-surface px-3 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-text-muted">
                  Predefined Events
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {events.map((rule) => (
                  <div key={rule.id} className="rounded-2xl border border-border-main bg-surface p-4">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="text-sm font-black uppercase tracking-tight text-text-main">
                          Conversation Closed by Agent
                        </div>
                        <p className="mt-1 text-xs text-text-muted">
                          Target flow: Post-Handoff CSAT
                        </p>
                      </div>

                      <label className="inline-flex items-center gap-3 rounded-full border border-border-main bg-canvas px-4 py-2 text-xs font-semibold text-text-main">
                        <input
                          type="checkbox"
                          checked={rule.enabled}
                          onChange={(e) =>
                            setEvents((current) =>
                              current.map((item) =>
                                item.id === rule.id ? { ...item, enabled: e.target.checked } : item
                              )
                            )
                          }
                        />
                        Enabled
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>

        <div className="shrink-0 border-t border-border-main bg-surface px-8 py-4">
          <button
            type="button"
            onClick={save}
            disabled={isSaving}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-xs font-black uppercase tracking-widest text-white transition-opacity hover:opacity-90"
          >
            {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {isSaving ? "Saving..." : "Save System Flows"}
          </button>
        </div>
      </div>
    </div>
  );
}
