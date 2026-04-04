import React from 'react';
import { User, Bot } from 'lucide-react';

interface Props {
  list: any[];
  activeId?: string;
  onSelect: (convo: any) => void;
  loading?: boolean;
}

const platformBadgeClasses: Record<string, string> = {
  whatsapp: "bg-primary-fade text-primary",
  telegram: "bg-primary-fade text-primary",
  facebook: "bg-primary-fade text-primary",
  instagram: "bg-primary-fade text-primary",
  email: "bg-primary-fade text-primary",
  website: "bg-primary-fade text-primary",
};

const statusBadgeClasses: Record<string, string> = {
  pending: "bg-rose-100 text-rose-700",
  bot: "bg-canvas text-text-muted",
  resolved: "bg-primary-fade text-primary",
  closed: "bg-canvas text-text-muted",
};

export default function ConversationList({ list, activeId, onSelect, loading = false }: Props) {
  const safeList = Array.isArray(list) ? list : [];
  const queuedCount = safeList.filter((convo) => convo.agent_pending || convo.inbox_status === "pending").length;

  const formatStatusLabel = (value: string) =>
    value
      .replace(/_/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[1.25rem] border border-border-main bg-bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-border-main bg-bg-muted px-4 pb-3 pt-4">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
          Live Threads
        </h2>
        <div className="rounded-xs border border-primary bg-primary-soft px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-primary">
          {queuedCount} queue
        </div>
      </div>
      
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        <div className="space-y-2">
        {safeList.map((convo) => {
          const lastInboundAt = convo.last_inbound_at ? new Date(convo.last_inbound_at).getTime() : 0;
          const lastOutboundAt = convo.last_outbound_at ? new Date(convo.last_outbound_at).getTime() : 0;
          const isWaitingForReply = lastInboundAt > 0 && lastInboundAt >= lastOutboundAt;
          const hasUnreadSignal = isWaitingForReply && activeId !== convo.id;
          const conversationContext =
            convo?.context_json && typeof convo.context_json === "object" ? convo.context_json : {};
          const csatRating = String(conversationContext.csat_rating || convo?.csat_rating || "").trim().toLowerCase();
          const csatPending = Boolean(conversationContext.csat_pending || convo?.csat_pending);
          const csatLabel =
            csatPending
              ? "CSAT pending"
              : csatRating === "csat_bad"
                ? "😡 Bad"
                : csatRating === "csat_okay"
                  ? "😐 Okay"
                  : csatRating === "csat_good"
                    ? "🤩 Great"
                    : "";

          return (
            <button
                key={convo.id}
                onClick={() => onSelect(convo)}
            className={`flex w-full items-start gap-3 border-l-4 px-4 py-4 text-left transition-all ${
              activeId === convo.id
                    ? "border-l-primary bg-primary-fade"
                    : "border-l-transparent bg-bg-card hover:bg-bg-muted"
                }`}
              >
              <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border-main bg-bg-card text-text-main">
                <User size={18} />
                {hasUnreadSignal ? (
                  <span className="absolute right-0 top-0 h-3 w-3 rounded-full border-2 border-surface bg-primary" />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-text-main">
                      {convo.display_name || convo.external_id}
                    </div>
                    <div className="mt-1 truncate text-[11px] text-text-muted">
                      {convo.contact_phone_resolved || convo.external_id || convo.platform_user_id || "Unknown contact"}
                    </div>
                  </div>
                  {convo.assigned_to_name ? (
                    <span className="inline-flex items-center gap-1 rounded-xs border border-primary/20 bg-primary-fade px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
                      <User size={10} />
                      {convo.assigned_to_name}
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em]">
                  {(convo.agent_pending || convo.inbox_status === "pending") ? (
                    <span className="inline-flex items-center gap-1 rounded-xs border border-rose-200 bg-rose-50 px-2.5 py-1 text-rose-700">
                      <User size={10} />
                      Pending
                    </span>
                  ) : convo.inbox_status && String(convo.inbox_status).toLowerCase() !== "bot" ? (
                    <span className="inline-flex items-center gap-1 rounded-xs border border-border-main bg-bg-muted px-2.5 py-1 text-text-muted">
                      <Bot size={10} />
                      {formatStatusLabel(String(convo.inbox_status))}
                    </span>
                  ) : null}
                  {isWaitingForReply ? (
                    <span className="inline-flex items-center gap-1 rounded-xs border border-border-main bg-bg-muted px-2.5 py-1 text-text-muted">
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      Waiting
                    </span>
                  ) : null}
                  {hasUnreadSignal ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary-fade px-2.5 py-1 text-primary">
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      New
                    </span>
                  ) : null}
                  {csatLabel ? (
                    <span
                      className={`inline-flex items-center gap-1 rounded-xs border px-2.5 py-1 ${
                        csatRating === "csat_bad"
                          ? "bg-rose-100 text-rose-700"
                          : csatRating === "csat_good"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      {csatLabel}
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 truncate text-xs text-text-muted">
                  {convo.last_message_text || "No messages yet"}
                </div>
              </div>
            </button>
          );
        })}
        </div>
        {loading ? (
        <div className="p-8 text-center text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
            Loading inbox
          </div>
        ) : safeList.length === 0 ? (
          <div className="p-8 text-center text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
            No active chats
          </div>
        ) : null}
      </div>
    </div>
  );
}
