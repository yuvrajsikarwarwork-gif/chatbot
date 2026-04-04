import {
  MessageSquare,
  List,
  Type,
  Clock,
  LogOut,
  Split,
  Database,
  Webhook,
  ArrowRight,
  Headset,
  LayoutTemplate,
  BrainCircuit,
  Bot,
  Play,
  Timer,
} from "lucide-react";

export const AUTO_SAVE_DELAY = 10000;

export const NODE_CATEGORIES = [
  {
    title: "1. Communication",
    color: "emerald",
    items: [
      { type: "message", label: "Message", icon: MessageSquare, info: "Send text, image, video, audio, or files." },
      { type: "send_template", label: "Send Template", icon: LayoutTemplate, info: "Trigger official Meta templates." },
    ],
  },
  {
    title: "2. Data Capture",
    color: "violet",
    items: [
      { type: "input", label: "Input", icon: Type, info: "Collect answers with validation, timeouts, and lead mapping." },
      { type: "menu", label: "Interactive Menu", icon: List, info: "Buttons or list options." },
    ],
  },
  {
    title: "3. Logic & Routing",
    color: "purple",
    items: [
      { type: "condition", label: "Condition", icon: Split, info: "Decision branching logic." },
      { type: "split_traffic", label: "Split Traffic", icon: Split, info: "A/B testing routing." },
      { type: "business_hours", label: "Business Hours", icon: Clock, info: "Route based on timezone schedules." },
      { type: "goto", label: "Go To", icon: ArrowRight, info: "Jump to another node, flow, or bot." },
      { type: "delay", label: "Delay", icon: Timer, info: "Wait before continuing the flow." },
    ],
  },
  {
    title: "4. Integrations & AI",
    color: "blue",
    items: [
      { type: "api", label: "API Request", icon: Webhook, info: "External system integrations." },
      { type: "save", label: "Save Data", icon: Database, info: "Persist data to lead profile." },
      { type: "knowledge_lookup", label: "Knowledge Lookup", icon: BrainCircuit, info: "Search workspace knowledge." },
      { type: "ai_generate", label: "AI Generate", icon: Bot, info: "Prompt an AI model." },
      { type: "ai_intent", label: "AI Intent", icon: BrainCircuit, info: "Classify user intent into routing branches." },
      { type: "ai_extract", label: "AI Extract", icon: BrainCircuit, info: "Extract structured variables from user text." },
      { type: "assign_agent", label: "Assign Agent", icon: Headset, info: "Handoff to a Human." },
    ],
  },
  {
    title: "5. System Nodes",
    color: "slate",
    items: [
      { type: "start", label: "Start", icon: Play, info: "Permanent entry point." },
      { type: "end", label: "End Flow", icon: LogOut, info: "Clean session termination." },
      { type: "trigger", label: "Trigger Entry", icon: Webhook, info: "Entry point for keywords/external triggers." },
      { type: "resume_bot", label: "Resume Bot", icon: Bot, info: "Resume after human handoff." },
    ],
  },
];

export const formatDefaultLabel = (type: string) =>
  type.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
