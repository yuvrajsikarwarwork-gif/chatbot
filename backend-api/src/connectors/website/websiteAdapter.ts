import { Server, Socket } from "socket.io";
import crypto from "crypto";
import * as FlowEngine from "../../services/flowEngine";
import { GenericMessage, OutboundDeliveryResult, routeMessage } from "../../services/messageRouter";

export const initializeWebConnector = (io: Server) => {
  io.on("connection", (socket: Socket) => {
    console.log(`Web socket connected | ID: ${socket.id}`);

    socket.on("register_web_user", (data: { botId: string; platformUserId: string }) => {
      if (data.botId && data.platformUserId) {
        const room = `${data.botId}_${data.platformUserId}`;
        socket.join(room);
        console.log(`Web user registered in room: ${room}`);
      }
    });

    socket.on(
      "send_web_message",
      async (data: {
        botId: string;
        platformUserId: string;
        userName: string;
        text: string;
        buttonId?: string;
        entryKey?: string;
      }) => {
        try {
          console.log(
            `[Web Inbound] MSG/Button from ${data.platformUserId}: ${data.text || data.buttonId}`
          );

          const result = await FlowEngine.processIncomingMessage(
            data.botId,
            data.platformUserId,
            data.userName || "Web User",
            data.text || "",
            data.buttonId || "",
            io,
            "website",
            data.entryKey ? { entryKey: data.entryKey } : {}
          );

          if (result?.conversationId && result.actions?.length) {
            for (const action of result.actions) {
              await routeMessage(result.conversationId, action, io);
            }
          }
        } catch (err: any) {
          console.error("[Web Inbound Error]:", err.message);
        }
      }
    );

    socket.on("disconnect", () => {
      console.log(`Web socket disconnected | ID: ${socket.id}`);
    });
  });
};

export const sendWebAdapter = async (
  botId: string,
  platformUserId: string,
  msg: GenericMessage,
  io: Server,
  _platformAccountId?: string | null
): Promise<OutboundDeliveryResult> => {
  if (!io) {
    throw { status: 400, message: "Website replies require an active realtime socket server" };
  }

  const room = `${botId}_${platformUserId}`;
  const outboundPayload = {
    botId,
    from: platformUserId,
    message: {
      ...msg,
      text:
        msg.text ||
        msg.templateContent?.body ||
        (msg.type === "template" ? `[Template: ${msg.templateName}]` : ""),
    },
    timestamp: new Date().toISOString(),
  };

  io.to(room).emit("receive_web_message", outboundPayload);

  if (msg.type === "template") {
    console.log(`[Web Outbound] Delivered Template: ${msg.templateName} to ${room}`);
  }

  return {
    providerMessageId: crypto.randomUUID(),
    status: "delivered",
  };
};
