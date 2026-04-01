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
} from "lucide-react";

export const AUTO_SAVE_DELAY = 10000;

export const NODE_CATEGORIES = [
  { 
    title: "1. Communication", color: "emerald",
    items: [
      { type: "message", label: "Message", icon: MessageSquare, info: "Send text, image, video, audio, or file messages from one node." },
      { type: "send_template", label: "Send Template", icon: LayoutTemplate, info: "Trigger official Meta templates." }
    ] 
  },
  { 
    title: "2. Data Capture", color: "violet",
    items: [
      { type: "input", label: "Input", icon: Type, info: "Collect answers with validation, timeout rules, and built-in retry behavior." },
      { type: "menu", label: "Interactive Menu", icon: List, info: "Buttons or list options in one node. The UI adapts based on the number of choices." }
    ] 
  },
  { 
    title: "3. Logic & Routing", color: "purple",
    items: [
      { type: "condition", label: "Condition", icon: Split, info: "Decision branching logic." },
      { type: "split_traffic", label: "Split Traffic", icon: Split, info: "Randomly route traffic between two branches for A/B testing." },
      { type: "business_hours", label: "Business Hours", icon: Clock, info: "Route based on whether the current time is inside your schedule." },
      { type: "goto", label: "Go To", icon: ArrowRight, info: "Jump to another node, flow, or bot." },
      { type: "api", label: "API Request", icon: Webhook, info: "External system integrations." },
      { type: "save", label: "Save Data", icon: Database, info: "Persist data to lead profile." },
      { type: "knowledge_lookup", label: "Knowledge Lookup", icon: BrainCircuit, info: "Search workspace knowledge and save results for downstream replies." },
      { type: "ai_generate", label: "AI Generate", icon: Bot, info: "Prompt an AI model and save the generated reply or summary." },
      { type: "assign_agent", label: "Assign Agent", icon: Headset, info: "Switch from Bot to Human mode." },
      { type: "end", label: "End Flow", icon: LogOut, info: "Clean session termination." }
    ] 
  }
];

export const formatDefaultLabel = (type: string) => 
  type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
