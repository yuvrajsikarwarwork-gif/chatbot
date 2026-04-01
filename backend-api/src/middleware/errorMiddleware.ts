// src/middleware/errorMiddleware.ts

import { Request, Response, NextFunction } from "express";

function uniqueDetails(items: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      items
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    )
  );
}

function normalizeError(err: any) {
  const normalized = err && typeof err === "object" ? err : { message: String(err || "") };

  if (normalized?.code === "23505" && !normalized.status) {
    normalized.status = 409;
    normalized.message = normalized.detail || "A record with these values already exists";
  }

  if (normalized?.code === "23503" && !normalized.status) {
    normalized.status = 409;
    normalized.message = normalized.detail || "This record is still referenced elsewhere.";
  }

  if (normalized?.code === "22P02" && !normalized.status) {
    normalized.status = 400;
    normalized.message = normalized.message || "One of the submitted values has an invalid format.";
  }

  if (normalized?.code === "42P01" && !normalized.status) {
    normalized.status = 500;
    normalized.message =
      normalized.table
        ? `Database table "${normalized.table}" is missing for this feature.`
        : "A required database table is missing for this feature.";
  }

  if (normalized?.code === "42703" && !normalized.status) {
    normalized.status = 500;
    normalized.message =
      normalized.column
        ? `Database column "${normalized.column}" is missing for this feature.`
        : "A required database column is missing for this feature.";
  }

  return normalized;
}

export function errorMiddleware(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) {
  const normalized = normalizeError(err);
  const requestId = req.requestId || "unknown";

  console.error(`[${requestId}]`, normalized);

  const details = uniqueDetails([
    ...(Array.isArray(normalized?.details) ? normalized.details : []),
    normalized?.detail && normalized?.detail !== normalized?.message ? normalized.detail : null,
    normalized?.hint ? `Hint: ${normalized.hint}` : null,
    normalized?.table ? `Table: ${normalized.table}` : null,
    normalized?.column ? `Column: ${normalized.column}` : null,
    normalized?.constraint ? `Constraint: ${normalized.constraint}` : null,
    normalized?.where ? `Where: ${normalized.where}` : null,
    normalized?.code ? `Code: ${normalized.code}` : null,
    `Request ID: ${requestId}`,
  ]);

  res.status(normalized.status || 500).json({
    success: false,
    error: normalized.message || "Internal Server Error",
    code: normalized.code || normalized.appCode || null,
    details,
    requestId,
  });
}
