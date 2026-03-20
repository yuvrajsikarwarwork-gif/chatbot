import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";

import routes from "./routes";
import { errorMiddleware } from "./middleware/errorMiddleware";

dotenv.config();

export const app = express();

// ================= CORS =================

app.use(
  cors({
    origin: true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "x-bot-id",
      "Bypass-Tunnel-Reminder",
      "x-localtunnel-skip-warning",
      "ngrok-skip-browser-warning",
    ],
  })
);

// Preflight fix

app.options("*", cors());

// ================= MIDDLEWARE =================

app.use(express.json());

app.use(
  "/uploads",
  express.static(path.join(__dirname, "../uploads"))
);

// ================= ROUTES =================

// ✅ ONLY HERE

app.use("/api", routes);

// ================= ERROR =================

app.use(errorMiddleware);