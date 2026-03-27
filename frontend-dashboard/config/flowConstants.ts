import { 
  MessageSquare, MousePointerClick, List, Image as ImageIcon, Type, Zap, 
  Clock, LogOut, Split, Database, Webhook, Timer, ArrowRight, 
  ShieldAlert, Play, Hourglass, LayoutTemplate, Headset, Bot
} from "lucide-react";

export const AUTO_SAVE_DELAY = 10000;

export const NODE_CATEGORIES = [
  { 
    title: "1. Core & Messages", color: "emerald",
    items: [
      { type: "start", label: "Start Node", icon: Play, info: "Entry point for the conversation." },
      { type: "trigger", label: "Trigger Node", icon: Zap, info: "Keyword or event based trigger." },
      { type: "msg_text", label: "Text Message", icon: MessageSquare, info: "Sends standard text message." },
      { type: "msg_media", label: "Media Message", icon: ImageIcon, info: "Sends Image, Video, or Documents." },
      { type: "send_template", label: "Send Template", icon: LayoutTemplate, info: "Trigger official Meta templates." }
    ] 
  },
  { 
    title: "2. User Inputs", color: "violet",
    items: [
      { type: "input", label: "User Input", icon: Type, info: "Smart input with validation, Reset footer, and Timeout paths." }
    ] 
  },
  { 
    title: "3. Interactive Menus", color: "purple",
    items: [
      { type: "menu_button", label: "Menu Button", icon: MousePointerClick, info: "Standard buttons (Max 4)." },
      { type: "menu_list", label: "List Menu", icon: List, info: "Dropdown-style menus (Max 10)." }
    ] 
  },
  { 
    title: "4. System & Logic", color: "amber",
    items: [
      { type: "condition", label: "Condition", icon: Split, info: "Decision branching logic." },
      { type: "api", label: "API Request", icon: Webhook, info: "External system integrations." },
      { type: "lead_form", label: "Lead Form", icon: Database, info: "Persist a lead using campaign, platform, entry point, flow, and list context." },
      { type: "save", label: "Save Data", icon: Database, info: "Persist data to lead profile." },
      { type: "reminder", label: "Reminder", icon: Clock, info: "Nudge user if inactive." },
      { type: "delay", label: "Delay", icon: Timer, info: "Pause execution momentarily." },
      { type: "timeout", label: "Timeout", icon: Hourglass, info: "Connection target for idle sessions." },
      { type: "error_handler", label: "Error Handler", icon: ShieldAlert, info: "Floating global listener for unrecognized inputs." },
      { type: "assign_agent", label: "Assign Agent", icon: Headset, info: "Switch from Bot to Human mode." },
      { type: "resume_bot", label: "Resume Bot", icon: Bot, info: "Switch back to Bot with Resume/Restart options." },
      { type: "goto", label: "Go To", icon: ArrowRight, info: "Bridge to specific Node IDs or Bot IDs." },
      { type: "end", label: "End Flow", icon: LogOut, info: "Clean session termination." }
    ] 
  }
];

export const formatDefaultLabel = (type: string) => 
  type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
