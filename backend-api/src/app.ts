import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";

import routes from "./routes";
import webhookRoutes from "./routes/webhookRoutes"; // ✅ IMPORT ADDED
import { errorMiddleware } from "./middleware/errorMiddleware";
import { JwtPayload } from "jsonwebtoken";

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload & { user_id?: string; role?: string };
      rawBody?: Buffer;
    }
  }
}
dotenv.config();

export const app = express();

// ================= CORS =================

const corsOptions = {
  origin: true,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "x-bot-id",
    "x-workspace-id",
    "x-project-id",
    "Bypass-Tunnel-Reminder",
    "x-localtunnel-skip-warning",
    "ngrok-skip-browser-warning",
  ],
};

app.use(
  cors(corsOptions)
);

// Preflight fix
app.options("*", cors(corsOptions));

// ================= MIDDLEWARE =================

app.use(
  express.json({
    verify: (req, _res, buf) => {
      (req as Request).rawBody = Buffer.from(buf);
    },
  })
);

app.use(
  "/uploads",
  express.static(path.join(__dirname, "../uploads"))
);

// ================= ROUTES =================

// 1. 🔴 CRITICAL: Mount Webhook Explicitly First to bypass global auth/index issues
app.use("/api/webhook", webhookRoutes);

// 2. Then mount all other general routes
app.use("/api", routes);

// ================= ERROR =================

app.use(errorMiddleware);
