import { app } from "./app";
import { env } from "./config/env";
import { db, query } from "./config/db";
import { redis } from "./config/redis";

import http from "http";
import { Server } from "socket.io";
import cron from "node-cron";
import "dotenv/config";

import { startFlowWaitQueueProcessor } from "./services/flowWaitQueueService";
import { initializeWebConnector } from "./connectors/website/websiteAdapter";

async function start() {
  try {
    await db.connect();
    console.log("DB connected");

    try {
      await redis.ping();
      console.log("Redis connected");
    } catch {
      console.warn("Redis not reachable");
    }

    const server = http.createServer(app);

    const io = new Server(server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: true,
      },
    });

    app.set("io", io);
    initializeWebConnector(io);
    startFlowWaitQueueProcessor(io);

    cron.schedule("* * * * *", async () => {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

      try {
        const result = await query(
          `UPDATE conversations
           SET status='active', current_node=NULL
           WHERE status='agent_pending'
           AND updated_at < $1
           RETURNING id`,
          [tenMinutesAgo]
        );

        if (result.rowCount) {
          console.log("Auto resumed", result.rowCount);
        }
      } catch (err) {
        console.error(err);
      }
    });

    io.on("connection", (socket) => {
      console.log("Socket connected", socket.id);
    });

    const PORT = Number(env.PORT) || 4000;

    server.listen(PORT, "0.0.0.0", () => {
      console.log(`BACKEND API LIVE | http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error(err);
  }
}

start();
