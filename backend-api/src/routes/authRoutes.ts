// src/routes/authRoutes.ts

import { Router } from "express";

import {
  acceptInvite,
  createSupportWorkspaceSession,
  downloadWorkspaceExport,
  endSupportWorkspaceSession,
  login,
  logout,
  register,
  me,
  previewInvite,
  requestPasswordReset,
  resetPassword,
  verifyPasswordResetOtp,
  pricingCheckoutInit,
  pricingCheckoutConfirm,
} from "../controllers/authController";
import { listPublicPlansCtrl } from "../controllers/planController";

import { authMiddleware } from "../middleware/authMiddleware";
import { resolveOrganizationContext } from "../middleware/organizationContextMiddleware";

const router = Router();

router.post("/login", login);
router.post("/register", register);
router.get("/public-plans", listPublicPlansCtrl);
router.post("/pricing-checkout/init", pricingCheckoutInit);
router.post("/pricing-checkout/confirm", pricingCheckoutConfirm);
router.get("/invite", previewInvite);
router.post("/accept-invite", acceptInvite);
router.post("/request-password-reset", requestPasswordReset);
router.post("/verify-password-reset-otp", verifyPasswordResetOtp);
router.post("/reset-password", resetPassword);
router.get("/workspace-export", downloadWorkspaceExport);

router.get("/me", authMiddleware, resolveOrganizationContext, me);
router.post("/logout", authMiddleware, logout);
router.post("/support-session", authMiddleware, createSupportWorkspaceSession);
router.delete("/support-session", authMiddleware, endSupportWorkspaceSession);

export default router;
