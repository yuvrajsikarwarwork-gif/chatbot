// src/controllers/authController.ts

import { Request, Response, NextFunction } from "express";

import {
  acceptInviteService,
  registerService,
  loginService,
  logoutService,
  getUserService,
  previewInviteTokenService,
  requestPasswordResetService,
  resetPasswordService,
  verifyPasswordResetOtpService,
} from "../services/authService";

import { AuthRequest } from "../middleware/authMiddleware";

export async function register(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { email, password, name } = req.body;

    const data = await registerService(
      email,
      password,
      name
    );

    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function login(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { email, password } = req.body;

    const data = await loginService(
      email,
      password
    );

    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function me(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const user = await getUserService(
      req.user.id
    );

    res.json(user);
  } catch (err) {
    next(err);
  }
}

export async function logout(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const data = await logoutService(req.user.id);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function previewInvite(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const token = String(req.query.token || "");
    if (!token) {
      return res.status(400).json({ error: "token is required" });
    }

    const data = await previewInviteTokenService(token);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function acceptInvite(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const data = await acceptInviteService({
      token: req.body?.token,
      password: req.body?.password,
      name: req.body?.name,
    });
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function requestPasswordReset(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const data = await requestPasswordResetService(req.body?.email);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function verifyPasswordResetOtp(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const data = await verifyPasswordResetOtpService(req.body?.email, req.body?.otp);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function resetPassword(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const data = await resetPasswordService(
      req.body?.email,
      req.body?.otp,
      req.body?.password
    );
    res.json(data);
  } catch (err) {
    next(err);
  }
}
