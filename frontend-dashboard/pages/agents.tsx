import React, { useState } from 'react';
import DashboardLayout from '../components/layout/DashboardLayout';
import { UserPlus, MessageCircle, CheckCircle } from 'lucide-react';

export default function AgentSystem() {
  const [tickets, setTickets] = useState([]);

  return (
    <DashboardLayout title="Agent Workspace">
      <div className="grid grid-cols-12 gap-6 p-6">
        {/* Sidebar: Open Tickets */}
        <div className="col-span-3 bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-200 font-bold flex justify-between">
            <span>Open Tickets</span>
            <span className="bg-blue-100 text-blue-700 px-2 rounded-full text-xs flex items-center">12</span>
          </div>
          <div className="p-2 space-y-2">
            {/* Map tickets here */}
            <div className="p-3 hover:bg-slate-50 rounded-lg cursor-pointer border border-transparent hover:border-slate-200">
              <p className="font-semibold text-sm">+91 98765 43210</p>
              <p className="text-xs text-slate-500 truncate">I need help with my billing...</p>
            </div>
          </div>
        </div>

        {/* Center: Live Chat & Assignment */}
        <div className="col-span-9 bg-white rounded-xl border border-slate-200 flex flex-col h-[700px]">
          <div className="p-4 border-b border-slate-200 flex justify-between items-center">
            <h3 className="font-bold">Chat with Customer</h3>
            <div className="flex gap-2">
              <button className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200">
                <UserPlus size={16} /> Assign Agent
              </button>
              <button className="flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">
                <CheckCircle size={16} /> Resolve
              </button>
            </div>
          </div>
          <div className="flex-1 bg-slate-50 p-4 overflow-y-auto">
            {/* Chat Messages */}
          </div>
          <div className="p-4 border-t border-slate-200">
            <input type="text" placeholder="Type a reply as an agent..." className="w-full p-3 bg-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all" />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}