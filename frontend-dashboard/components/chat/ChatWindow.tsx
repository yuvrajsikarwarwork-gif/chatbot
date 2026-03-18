import React, { useState } from "react";
import MessageList from "./MessageList";
import { CheckCircle2, Send, User, Bot, Loader2 } from "lucide-react";
import apiClient from "../../services/apiClient"; 

interface ChatWindowProps {
  messages: any[];
  activeConversation: any;
  onResumeBot: () => void;
  onMessageSent: (msg: any) => void;
}

export default function ChatWindow({ messages, activeConversation, onResumeBot, onMessageSent }: ChatWindowProps) {
  const [inputValue, setInputValue] = useState("");
  const [isSending, setIsSending] = useState(false);

  // Function to resume bot control
  const handleResume = async () => {
    if (!activeConversation) return;
    try {
      // Endpoint must match backend: /chat/resume
      const res = await apiClient.post("/chat/resume", { 
        wa_number: activeConversation.wa_number 
      });

      if (res.data.success) {
        // Triggers the parent to refresh lead status and hide agent input
        onResumeBot(); 
        alert("Bot resumed successfully!");
      }
    } catch (err) {
      console.error("Failed to resume bot", err);
      alert("Error: Could not resume bot session. Check console for details.");
    }
  };

  const handleSend = async () => {
    if (!inputValue.trim() || isSending) return;
    setIsSending(true);

    try {
      await apiClient.post("/chat/send", {
        wa_number: activeConversation.wa_number,
        message: inputValue
      });
      
      onMessageSent({ 
        id: Date.now(),
        message: inputValue, 
        sender: "agent", 
        timestamp: new Date().toISOString() 
      });
      setInputValue(""); 
    } catch (error) {
      console.error("Failed to send message");
    } finally {
      setIsSending(false);
    }
  };

  if (!activeConversation) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 text-slate-400">
        <Bot size={64} className="mb-4 opacity-20" />
        <h2 className="text-xl font-black text-slate-300 uppercase tracking-widest">No Conversation Selected</h2>
        <p className="text-sm mt-2">Select a lead from the sidebar to view the inbox.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-slate-50 relative h-full">
      {/* Header */}
      <div className="bg-white p-4 border-b border-slate-200 flex justify-between items-center shadow-sm z-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-200 rounded-full flex items-center justify-center text-slate-500">
            <User size={20} />
          </div>
          <div>
            <h3 className="font-bold text-slate-800">{activeConversation.wa_name || "User"}</h3>
            <p className="text-xs text-slate-500 font-mono">{activeConversation.wa_number}</p>
          </div>
        </div>

        {activeConversation.human_active && (
          <button 
            onClick={handleResume}
            className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all shadow-sm active:scale-95"
          >
            <CheckCircle2 size={16} /> Resolve & Resume Bot
          </button>
        )}
      </div>

      <div className="flex-1 overflow-hidden relative">
        <MessageList messages={messages} />
      </div>

      {/* Input Area */}
      <div className="bg-white p-4 border-t border-slate-200 shrink-0 z-10">
        {activeConversation.human_active ? (
          <div className="flex gap-2">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="Type your message..."
              className="flex-1 border-2 border-slate-200 bg-slate-50 focus:bg-white rounded-xl p-3 text-sm focus:border-blue-500 outline-none transition-all"
            />
            <button 
              disabled={isSending}
              onClick={handleSend}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 rounded-xl flex items-center justify-center transition-all shadow-md active:scale-95 disabled:opacity-50"
            >
              {isSending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            </button>
          </div>
        ) : (
          <div className="bg-slate-100 border border-slate-200 rounded-xl p-4 text-center">
            <p className="text-sm font-bold text-slate-500">The Bot is currently handling this conversation.</p>
          </div>
        )}
      </div>
    </div>
  );
}