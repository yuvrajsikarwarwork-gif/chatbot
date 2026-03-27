import { Router } from "express";
import { 
  getTickets, 
  createTicket, 
  closeTicket, 
  replyToTicket,
  getInboxConversations,
  getInboxLeads,
  getConversationDetail, // NEW
  resumeConversation,
  sendAgentReply         // NEW
} from "../controllers/agentController";
import { authMiddleware } from "../middleware/authMiddleware";
import {
  requireAuthenticatedUser,
  requireWorkspaceAccess,
  resolveProjectContext,
  resolveWorkspaceContext,
} from "../middleware/policyMiddleware";

const router = Router();

// ✅ Use authMiddleware to protect all agent routes
router.use(authMiddleware);
router.use(requireAuthenticatedUser);
router.use(resolveWorkspaceContext);
router.use(requireWorkspaceAccess);
router.use(resolveProjectContext);

// ✅ Existing Ticket Routes
router.get("/conversations", getInboxConversations);
router.get("/leads", getInboxLeads);
router.get("/tickets/:botId", getTickets);
router.post("/tickets", createTicket);
router.post("/tickets/:ticketId/close", closeTicket);
router.post("/tickets/:ticketId/reply", replyToTicket);

// ✅ New Unified Inbox Routes (Phase D)
router.get("/conversations/:conversationId", getConversationDetail);
router.post("/conversations/:conversationId/resume", resumeConversation);
router.post("/conversations/:conversationId/reply", sendAgentReply);

export default router;
