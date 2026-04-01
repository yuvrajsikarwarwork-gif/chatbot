// backend-api/src/routes/conversationRoutes.ts

import { Router } from "express";
import { authMiddleware } from "../middleware/authMiddleware";
import {
  requireAuthenticatedUser,
  requireWorkspaceAccess,
  resolveProjectContext,
  resolveWorkspaceContext,
} from "../middleware/policyMiddleware";
import {
  assignConversation,
  addConversationNote,
  addConversationTag,
  getWorkspaceConversations,
  getAssignmentCapacity,
  getConversations,
  getConversation,
  getConversationTimeline,
  getConversationAssignments,
  getMessages,
  removeConversationTag,
  reassignConversation,
  releaseConversation,
  replyToConversation,
  updateConversationContext,
  updateConversationList,
  updateConversationStatus
} from "../controllers/conversationController";

const router = Router();

// Secure all conversation routes
router.use(authMiddleware);
router.use(requireAuthenticatedUser);
router.use(resolveWorkspaceContext);
router.use(requireWorkspaceAccess);
router.use(resolveProjectContext);

// Workspace-aware inbox with Phase 15 filters
router.get("/", getWorkspaceConversations);
router.get("/assignment-capacity", getAssignmentCapacity);

// Get all active conversations for a specific bot
router.get("/bot/:botId", getConversations);

// Get specific conversation details
router.get("/:id", getConversation);
router.get("/:id/timeline", getConversationTimeline);

// Get message history for a conversation
router.get("/:id/messages", getMessages);

// Send an agent reply or approved template
router.post("/:id/reply", replyToConversation);

// Update status (e.g., agent taking over, or closing ticket)
router.put("/:id/status", updateConversationStatus);
router.post("/:id/assign", assignConversation);
router.post("/:id/reassign", reassignConversation);
router.post("/:id/release", releaseConversation);
router.get("/:id/assignments", getConversationAssignments);
router.post("/:id/notes", addConversationNote);
router.post("/:id/tags", addConversationTag);
router.delete("/:id/tags/:tag", removeConversationTag);
router.put("/:id/list", updateConversationList);
router.put("/:id/context", updateConversationContext);

export default router;
