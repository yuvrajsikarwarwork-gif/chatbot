import { NextFunction, RequestHandler, Response } from "express";

import { AuthRequest } from "./authMiddleware";
import { validateApiKeyService } from "../services/apiKeyService";

export type MachineAuthContext =
  | {
      type: "api_key";
      apiKey: Awaited<ReturnType<typeof validateApiKeyService>>;
    }
  | {
      type: "internal_secret";
    };

export interface MachineAuthRequest extends AuthRequest {
  machineAuth?: MachineAuthContext | null;
}

function getHeaderValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

export const resolveMachineAuth: RequestHandler = async (req, res, next) => {
  try {
    const authReq = req as MachineAuthRequest;
    const apiKey = getHeaderValue(req.headers["x-api-key"]);
    if (apiKey) {
      const validated = await validateApiKeyService(apiKey);
      if (!validated) {
        res.status(401).json({ error: "Invalid API key" });
        return;
      }

      authReq.machineAuth = {
        type: "api_key",
        apiKey: validated,
      };
      next();
      return;
    }

    const internalSecret = getHeaderValue(req.headers["x-engine-secret"] || req.headers["x-trigger-secret"]) ||
      getHeaderValue(req.body?.secret);
    authReq.machineAuth = internalSecret ? { type: "internal_secret" } : null;
    next();
  } catch (err) {
    next(err);
  }
};
