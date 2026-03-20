import express from "express";
import { ENV } from "../config/env";
import { processMessage } from "./processController";
import { loadContext } from "../services/contextManager";

const app = express();

app.use(express.json());

app.post("/process", processMessage);

app.get("/health", (_, res) => {
  res.send("bot-engine running");
});

// 🔴 CRITICAL FIX: Isolate the engine to port 5002 to prevent conflicts with the backend
const PORT = ENV.PORT || 5002;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ BOT ENGINE LIVE | http://localhost:${PORT}`);
});