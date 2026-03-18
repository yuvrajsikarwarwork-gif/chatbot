import { app } from "./app";
import { env } from "./config/env";
import { db, query } from "./config/db"; 
import { redis } from "./config/redis";
import http from "http";
import { Server } from "socket.io";
import cron from "node-cron"; 
import 'dotenv/config';

async function start() {
  try {
    // 1. Core Infrastructure Connections
    await db.connect();
    console.log("✅ DB connected");

    try {
      await redis.ping();
      console.log("✅ Redis connected");
    } catch (e) {
      console.warn("⚠️ Redis not reachable, skipping cache features.");
    }

    // 2. Create HTTP Server from Express App
    const server = http.createServer(app);

    // 3. Initialize Socket.io
    const io = new Server(server, {
      cors: {
        origin: ["http://localhost:3000", "http://localhost:3001"],
        methods: ["GET", "POST"],
        credentials: true
      }
    });

    app.set("io", io);

    // --- PATCH: 10-Minute Auto-Timeout Cron Job ---
    // This runs every minute to check for abandoned human chats
    cron.schedule("* * * * *", async () => {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      try {
        const result = await query(
          `UPDATE leads 
           SET human_active = false, bot_active = true, last_node_id = NULL 
           WHERE human_active = true AND updated_at < $1`,
          [tenMinutesAgo]
        );
        if (result.rowCount > 0) {
          console.log(`🤖 Auto-resumed bot for ${result.rowCount} inactive sessions.`);
        }
      } catch (err) {
        console.error("❌ Cron Job Error:", err);
      }
    });

    // 4. Socket Connection Logic
    io.on("connection", (socket) => {
      console.log(`🖥️ Frontend connected | ID: ${socket.id}`);
      socket.on("disconnect", () => {
        console.log(`🔌 Frontend disconnected | ID: ${socket.id}`);
      });
    });

    // 5. Start Listening
    const PORT = env.PORT || 4000;
    server.listen(PORT, () => {
      console.log(`🚀 ENGINE LIVE | http://localhost:${PORT}`);
    });

  } catch (err) {
    console.error("❌ CRITICAL BOOT ERROR:", err);
    process.exit(1);
  }
}

start();