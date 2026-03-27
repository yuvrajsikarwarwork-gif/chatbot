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
      <div className="flex h-full items-center justify-center px-6 text-center text-sm font-bold text-slate-400">
        No messages in this conversation yet.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 flex flex-col gap-4 overflow-y-auto p-5 custom-scrollbar md:p-6"
    >
      <div className="mb-2 text-center text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
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
                    ? "rounded-br-none bg-blue-600 text-white"
                    : isBot
                      ? "rounded-br-none bg-slate-800 text-white"
                      : "rounded-bl-none border border-slate-200 bg-white text-slate-800"
                }`}
              >
                {renderMessageContent(message)}
              </div>
              <div
                className={`mt-1 flex flex-wrap gap-x-2 gap-y-1 break-all text-[9px] font-bold uppercase tracking-[0.22em] opacity-70 ${
                  isSystem ? "justify-end text-slate-500" : "justify-start text-slate-500"
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
