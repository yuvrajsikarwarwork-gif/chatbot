import React, { useEffect, useRef } from "react";

interface MessageListProps {
  messages: any[];
}

function safeParse(value: unknown) {
  if (!value) {
    return {};
  }

  if (typeof value === "object") {
    return value as Record<string, any>;
  }

  if (typeof value === "string") {
    try {
      return JSON.parse(value) as Record<string, any>;
    } catch {
      return {};
    }
  }

  return {};
}

function formatTimestamp(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDeliveryStatus(value: unknown) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return "";
  }

  return normalized.replace(/_/g, " ");
}

function formatKeyLabel(value: string) {
  if (!value) {
    return "";
  }

  if (value.length <= 18) {
    return value;
  }

  return `${value.slice(0, 8)}...${value.slice(-8)}`;
}

function getDeliveryTrace(message: any) {
  const payload = safeParse(message.content);
  const events = Array.isArray(message.delivery_events)
    ? message.delivery_events
    : Array.isArray(payload.deliveryEvents)
      ? payload.deliveryEvents
      : message.delivery_event && typeof message.delivery_event === "object"
        ? [message.delivery_event]
        : payload.deliveryEvent && typeof payload.deliveryEvent === "object"
          ? [payload.deliveryEvent]
          : [];

  return {
    deliveryKey: String(message.delivery_key || payload.deliveryKey || "").trim(),
    providerMessageId: String(
      message.provider_message_id_resolved ||
        message.external_message_id ||
        payload.providerMessageId ||
        ""
    ).trim(),
    deliveryStatus: formatDeliveryStatus(
      message.delivery_status_resolved || message.status || payload.deliveryStatus
    ),
    deliveryError: String(message.delivery_error || payload.deliveryError || "").trim(),
    events,
  };
}

function renderDeliveryTrace(message: any) {
  const trace = getDeliveryTrace(message);
  const hasTrace =
    Boolean(trace.deliveryKey) ||
    Boolean(trace.providerMessageId) ||
    Boolean(trace.deliveryStatus) ||
    Boolean(trace.deliveryError) ||
    trace.events.length > 0;

  if (!hasTrace) {
    return null;
  }

  const latestEvent = trace.events[trace.events.length - 1] as Record<string, any> | undefined;
  const latestStatus = formatDeliveryStatus(
    latestEvent?.status || latestEvent?.message_status || latestEvent?.event || ""
  );
  const latestTimestamp = formatTimestamp(
    latestEvent?.timestamp || latestEvent?.created_at || latestEvent?.received_at
  );

  return (
    <div className="mt-2 rounded-xl border border-current/10 bg-current/5 px-3 py-2 text-[10px] font-medium uppercase tracking-[0.14em] opacity-80">
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {trace.deliveryStatus ? <span>Status: {trace.deliveryStatus}</span> : null}
        {trace.providerMessageId ? (
          <span>Provider Id: {formatKeyLabel(trace.providerMessageId)}</span>
        ) : null}
        {trace.deliveryKey ? <span>Trace: {formatKeyLabel(trace.deliveryKey)}</span> : null}
        {trace.events.length > 0 ? <span>Events: {trace.events.length}</span> : null}
      </div>
      {latestStatus || latestTimestamp ? (
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
          {latestStatus ? <span>Latest: {latestStatus}</span> : null}
          {latestTimestamp ? <span>{latestTimestamp}</span> : null}
        </div>
      ) : null}
      {trace.deliveryError ? (
        <div className="mt-1 break-words normal-case tracking-normal opacity-90">
          {trace.deliveryError}
        </div>
      ) : null}
    </div>
  );
}

function renderMessageContent(msg: any) {
  const payload = msg.content
    ? safeParse(msg.content)
    : { type: "text", text: msg.message || msg.text || msg.text_resolved || "" };
  const messageType = String(
    msg.message_type_resolved || msg.message_type || payload.type || "text"
  ).toLowerCase();
  const mediaUrl =
    msg.media_url ||
    payload.mediaUrl ||
    payload.media_url ||
    payload.url ||
    null;
  const text =
    payload.text ||
    payload.body ||
    msg.text_resolved ||
    msg.text ||
    msg.message ||
    "";

  if (messageType === "template" && payload.templateContent) {
    const tpl = safeParse(payload.templateContent);
    return (
      <div className="flex flex-col gap-1">
        {tpl.header?.text ? (
          <div className="mb-1 border-b border-current/20 pb-1 text-[13px] font-bold">
            {tpl.header.text}
          </div>
        ) : null}
        <div className="whitespace-pre-wrap">{tpl.body || text}</div>
        {tpl.footer ? <div className="mt-1 text-[11px] opacity-70">{tpl.footer}</div> : null}
        {tpl.buttons && tpl.buttons.length > 0 ? (
          <div className="mt-2 flex flex-col gap-1">
            {tpl.buttons.map((button: any, index: number) => (
              <div
                key={index}
                className="rounded bg-current/10 px-3 py-1.5 text-center text-xs font-semibold"
              >
                {button.title || button.text || "Action"}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  if (
    (messageType === "interactive" || messageType === "button" || messageType === "list") &&
    payload.buttons
  ) {
    return (
      <div className="flex flex-col gap-1">
        <div className="whitespace-pre-wrap">{text}</div>
        <div className="mt-2 flex flex-col gap-1">
          {payload.buttons.map((button: any, index: number) => (
            <div
              key={index}
              className="rounded bg-current/10 px-3 py-1.5 text-center text-xs font-semibold"
            >
              {button.title || button.text || "Option"}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (mediaUrl) {
    if (messageType === "image") {
      return (
        <div className="flex flex-col gap-2">
          <img
            src={mediaUrl}
            alt={text || "Message attachment"}
            className="max-h-72 rounded-xl object-cover"
          />
          {text ? <div className="whitespace-pre-wrap">{text}</div> : null}
        </div>
      );
    }

    if (messageType === "video") {
      return (
        <div className="flex flex-col gap-2">
          <video controls className="max-h-72 rounded-xl">
            <source src={mediaUrl} />
          </video>
          {text ? <div className="whitespace-pre-wrap">{text}</div> : null}
        </div>
      );
    }

    if (messageType === "audio") {
      return (
        <div className="flex flex-col gap-2">
          <audio controls className="max-w-full">
            <source src={mediaUrl} />
          </audio>
          {text ? <div className="whitespace-pre-wrap">{text}</div> : null}
        </div>
      );
    }

    if (messageType === "document" || messageType === "file") {
      return (
        <div className="flex flex-col gap-2">
          <a
            href={mediaUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg bg-current/10 px-3 py-2 text-xs font-semibold underline-offset-2 hover:underline"
          >
            Open attachment
          </a>
          {text ? <div className="whitespace-pre-wrap">{text}</div> : null}
        </div>
      );
    }
  }

  return <div className="whitespace-pre-wrap">{text || "[Unsupported Format]"}</div>;
}

export default function MessageList({ messages }: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hasInitializedRef = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    container.scrollTo({
      top: container.scrollHeight,
      behavior: hasInitializedRef.current ? "smooth" : "auto",
    });
    hasInitializedRef.current = true;
  }, [messages]);

  if (!messages || messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm font-bold text-text-muted">
        No messages in this conversation yet.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 flex flex-col gap-4 overflow-y-auto p-5 custom-scrollbar md:p-6"
    >
      <div className="mb-2 text-center text-[10px] font-black uppercase tracking-[0.22em] text-text-muted">
        Conversation Started
      </div>

      {messages.map((message, index) => {
        const sender = String(
          message.sender_type_resolved ||
            message.sender_type ||
            message.sender ||
            message.from ||
            "user"
        ).toLowerCase();
        const isBot = sender === "bot";
        const isAgent = sender === "agent";
        const isSystem = isBot || isAgent;
        const timestamp = formatTimestamp(message.created_at);
        const deliveryStatus = formatDeliveryStatus(message.status);
        const typeLabel = String(
          message.message_type_resolved ||
            message.message_type ||
            safeParse(message.content).type ||
            "text"
        ).toLowerCase();

        return (
          <div
            key={message.id || index}
            className={`flex w-full ${isSystem ? "justify-end" : "justify-start"}`}
          >
            <div className="flex max-w-[min(78%,42rem)] min-w-0 flex-col">
              <div
                className={`rounded-2xl p-3 text-sm shadow-sm ${
                  isAgent
                    ? "rounded-br-none bg-primary text-white"
                    : isBot
                      ? "rounded-br-none bg-primary text-white"
                      : "rounded-bl-none border border-border-main bg-surface text-text-main"
                }`}
              >
                {renderMessageContent(message)}
                {isSystem ? renderDeliveryTrace(message) : null}
              </div>
              <div
                className={`mt-1 flex flex-wrap gap-x-2 gap-y-1 break-all text-[9px] font-bold uppercase tracking-[0.22em] opacity-70 ${
                  isSystem ? "justify-end text-text-muted" : "justify-start text-text-muted"
                }`}
              >
                <span>{sender}</span>
                {typeLabel && typeLabel !== "text" ? <span>{typeLabel}</span> : null}
                {deliveryStatus ? <span>{deliveryStatus}</span> : null}
                {timestamp ? <span>{timestamp}</span> : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

