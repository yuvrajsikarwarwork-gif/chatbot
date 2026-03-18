import React, { useState, useEffect, useRef } from 'react';
import DashboardLayout from '../components/layout/DashboardLayout';
import ConversationList from '../components/chat/ConversationList';
import ChatWindow from '../components/chat/ChatWindow';
import apiClient from '../services/apiClient';
import { io, Socket } from 'socket.io-client';

export default function ConversationsPage() {
  const [conversations, setConversations] = useState<any[]>([]);
  const [activeConversation, setActiveConversation] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]); 
  const [socket, setSocket] = useState<Socket | null>(null);

  // We use a ref to always have access to the currently active conversation inside the socket listener
  const activeConvoRef = useRef<any>(null);

  const fetchConversations = async () => {
    try {
      // Depending on your index.ts, this might be /chat/leads or /leads
      const res = await apiClient.get('/chat/leads').catch(() => apiClient.get('/leads')); 
      setConversations(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Failed to load conversations:", err);
      setConversations([]);
    }
  };

  useEffect(() => {
    fetchConversations();

    const newSocket = io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'); 
    setSocket(newSocket);

    newSocket.on('whatsapp_message', (msg: any) => {
      console.log("🔔 Socket Ping:", msg);
      
      // Refresh the sidebar so the "Waiting" badges update live
      fetchConversations();

      // ONLY append the message if the user is looking at THIS specific chat
      const currentActive = activeConvoRef.current;
      if (currentActive && msg.from === currentActive.wa_number) {
        setMessages(prev => [...prev, {
          id: Date.now(),
          text: msg.text,
          sender: msg.isBot ? "bot" : "user",
          timestamp: new Date().toISOString()
        }]);
      }
    });

    return () => {
      newSocket.disconnect();
    };
  }, []);

  const handleSelectConversation = async (convo: any) => {
  setActiveConversation(convo);
  activeConvoRef.current = convo;

  // Clear messages instantly for snappy UX while loading
  setMessages([]);

  // ✅ Fetch the actual chat history from the DB
  try {
    const res = await apiClient.get(`/chat/messages/${convo.wa_number}`);

    if (res.data && Array.isArray(res.data)) {

      // Map the DB columns to the frontend expectations
      const formattedHistory = res.data.map((msg: any) => ({
        id: msg.id,
        text: msg.text,
        sender: msg.sender,
        timestamp: msg.timestamp,
      }));

      setMessages(formattedHistory);
    }

  } catch (err) {
    console.error("Failed to fetch chat history:", err);
  }
};

  const handleResumeBot = () => {
    fetchConversations(); 
    setActiveConversation((prev: any) => {
      const updated = { ...prev, human_active: false };
      activeConvoRef.current = updated;
      return updated;
    });
  };

  const handleMessageSent = (msg: any) => {
    // Standardize the payload to match the socket
    setMessages(prev => [...prev, {
      id: msg.id || Date.now(),
      text: msg.message || msg.text,
      sender: "agent",
      timestamp: msg.timestamp || new Date().toISOString()
    }]);
  };

  return (
    <DashboardLayout title="Live Chat Inbox">
      <div className="flex h-[calc(100vh-100px)] bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden mx-6 mb-6">
        
        <div className="w-1/3 border-r border-slate-100 flex flex-col bg-slate-50">
          <div className="p-5 border-b border-slate-200 bg-white">
            <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">Active Chats</h2>
          </div>
          <div className="flex-1 overflow-y-auto">
            <ConversationList list={conversations} activeId={activeConversation?.id} onSelect={handleSelectConversation} />
          </div>
        </div>

        <div className="flex-1 flex flex-col bg-slate-50/50 relative">
          <ChatWindow 
            messages={messages}
            activeConversation={activeConversation} 
            onResumeBot={handleResumeBot}
            onMessageSent={handleMessageSent}
          />
        </div>

      </div>
    </DashboardLayout>
  );
};