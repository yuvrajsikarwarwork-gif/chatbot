import { Router } from "express";
import { 
  getInboxLeads, 
  sendAgentMessage, 
  resumeBotManually 
} from "../controllers/agentController";

const router = Router();

// Endpoint: /api/chat/leads
router.get("/leads", getInboxLeads);

// Endpoint: /api/chat/send
router.post("/send", sendAgentMessage);

// Endpoint: /api/chat/resume (Aligned with frontend)
router.post("/resume", resumeBotManually); 

export default router;