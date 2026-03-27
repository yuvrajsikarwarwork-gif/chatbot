// src/middleware/errorMiddleware.ts

import { Request, Response, NextFunction } from "express";

export function errorMiddleware(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) {
  console.error(err);

  if (err?.code === "23505" && !err.status) {
    err.status = 409;
    err.message = err.detail || "A record with these values already exists";
  }

  res.status(err.status || 500).json({
    success: false,
    error: err.message || "Internal Server Error",
  });
}
