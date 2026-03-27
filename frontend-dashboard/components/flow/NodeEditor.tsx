// frontend-dashboard/components/flow/NodeEditor.tsx

import { Node } from "reactflow";
import { useEffect, useState } from "react";
import apiClient from "../../services/apiClient";
import { RotateCcw, Link, Headset, Bot, LayoutTemplate } from "lucide-react";

interface NodeEditorProps {
  node: Node | null;
  onUpdate: (data: any) => void;
  onClose: () => void;
}

export default function NodeEditor({ node, onUpdate, onClose }: NodeEditorProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [draftData, setDraftData] = useState<any>(node?.data || {});

  if (!node) return null;

  useEffect(() => {
    setDraftData(node?.data || {});
  }, [node?.id]);

  const updateData = (key: string, value: any) => {
    setDraftData((prev: any) => ({ ...prev, [key]: value }));
  };

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      let fileToUpload = file;

      if (file.type.startsWith('image/')) {
        fileToUpload = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = (event) => {
            const img = new Image();
            img.src = event.target?.result as string;
            img.onload = () => {
              const canvas = document.createElement('canvas');
              const MAX_WIDTH = 1024;
              let width = img.width;
              let height = img.height;

              if (width > MAX_WIDTH) {
                height = Math.round((height * MAX_WIDTH) / width);
                width = MAX_WIDTH;
              }

              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext('2d');
              ctx?.drawImage(img, 0, 0, width, height);
              
              canvas.toBlob((blob) => {
                if (blob) resolve(new File([blob], file.name, { type: file.type }));
                else resolve(file); 
              }, file.type, 0.7); 
            };
          };
        });
      }

      const formData = new FormData();
      formData.append("file", fileToUpload);

      const response = await apiClient.post("/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });

      if (response.data?.url) updateData('media_url', response.data.url);
    } catch (error) {
      console.error("Upload failed", error);
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  /* =====================================================================
     SHARED LOGIC (For Inputs and Menus)
  ===================================================================== */
  
  const RenderTimeoutAndRetryLogic = () => (
    <div className="space-y-4 pt-4 border-t border-slate-200">
      <div>
        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">On Invalid Message</label>
        <textarea className="w-full border border-slate-200 bg-slate-50 rounded-lg p-2.5 text-xs resize-none h-12" placeholder="Invalid format/selection. Please try again." value={draftData.onInvalidMessage || ""} onChange={(e) => updateData('onInvalidMessage', e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Max Retries</label>
          <input type="number" className="w-full border border-slate-200 bg-slate-50 rounded-lg p-2.5 text-xs" placeholder="3" value={draftData.maxRetries || ""} onChange={(e) => updateData('maxRetries', Number(e.target.value))} />
        </div>
        <div>
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Global Error Node ID</label>
          <input className="w-full border border-slate-200 bg-slate-50 rounded-lg p-2.5 text-xs font-mono" placeholder="error1" value={draftData.errorNode || ""} onChange={(e) => updateData('errorNode', e.target.value)} />
        </div>
      </div>

      <div className="bg-amber-50 p-3 rounded-lg border border-amber-100 space-y-3">
        <div className="flex items-center gap-1 mb-1">
          <RotateCcw size={12} className="text-amber-600" />
          <span className="text-[10px] font-black text-amber-800 uppercase tracking-widest">Inactivity & Timeout</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[8px] font-black text-amber-600 uppercase mb-1">Reminder Delay (Sec)</label>
            <input type="number" className="w-full border-none bg-white rounded p-2 text-xs" placeholder="300" value={draftData.reminderDelay || ""} onChange={(e) => updateData('reminderDelay', Number(e.target.value))} />
          </div>
          <div>
            <label className="block text-[8px] font-black text-amber-600 uppercase mb-1">Timeout (Sec)</label>
            <input type="number" className="w-full border-none bg-white rounded p-2 text-xs" placeholder="900" value={draftData.timeout || ""} onChange={(e) => updateData('timeout', Number(e.target.value))} />
          </div>
        </div>
        <textarea className="w-full border-none bg-white rounded p-2 text-xs resize-none h-12" placeholder="Reminder text..." value={draftData.reminderText || ""} onChange={(e) => updateData('reminderText', e.target.value)} />
        <textarea className="w-full border-none bg-white rounded p-2 text-xs resize-none h-12" placeholder="Fallback text if Timeout Node is missing..." value={draftData.timeoutFallback || ""} onChange={(e) => updateData('timeoutFallback', e.target.value)} />
      </div>
    </div>
  );

  /* =====================================================================
     NODE-SPECIFIC RENDER COMPONENTS
  ===================================================================== */

  const RenderMenuOptionsNode = (maxOptions: number, label: string, isList = false) => (
    <div className="space-y-4 pt-4 border-t border-slate-200">
      {isList ? (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Button Text</label>
            <input className="w-full border border-slate-200 bg-slate-50 rounded-lg p-2.5 text-xs font-medium" placeholder="View Options" value={draftData.buttonText || ""} onChange={(e) => updateData("buttonText", e.target.value)} />
          </div>
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Section Title</label>
            <input className="w-full border border-slate-200 bg-slate-50 rounded-lg p-2.5 text-xs font-medium" placeholder="Options" value={draftData.sectionTitle || ""} onChange={(e) => updateData("sectionTitle", e.target.value)} />
          </div>
        </div>
      ) : null}
      <div className="space-y-2">
        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}s (Max {maxOptions})</label>
        {Array.from({ length: maxOptions }).map((_, i) => {
          const num = i + 1;
          return (
            <input 
              key={num}
              className="w-full border border-slate-200 bg-slate-50 focus:bg-white rounded-lg p-2.5 text-xs font-medium focus:border-blue-500 outline-none transition-all" 
              placeholder={`${label} ${num}`}
              value={draftData[`item${num}`] || ""}
              onChange={(e) => updateData(`item${num}`, e.target.value)}
            />
          );
        })}
      </div>
      {RenderTimeoutAndRetryLogic()}
    </div>
  );

  const RenderInputNode = () => (
    <div className="space-y-4 pt-4 border-t border-slate-200">
      <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
        <label className="block text-[10px] font-black text-blue-800 uppercase tracking-widest mb-1">Variable Name</label>
        <input className="w-full border border-white bg-white rounded p-2 text-xs font-mono" placeholder="e.g. user_email" value={draftData.variable || ""} onChange={(e) => updateData('variable', e.target.value)} />
      </div>

      <div>
        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Validation Type</label>
        <select className="w-full border border-slate-200 bg-slate-50 rounded-lg p-2.5 text-xs font-medium outline-none" value={draftData.validation || "text"} onChange={(e) => updateData('validation', e.target.value)}>
          <option value="text">Text / Any</option>
          <option value="email">Email</option>
          <option value="phone">Phone Number</option>
          <option value="number">Numeric</option>
          <option value="date">Date</option>
          <option value="regex">Custom Regex</option>
        </select>
      </div>

      {draftData.validation === 'regex' && (
        <div>
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Regex Pattern</label>
          <input className="w-full border border-slate-200 bg-slate-50 rounded-lg p-2.5 text-xs font-mono" placeholder="e.g. ^[A-Z]{3}$" value={draftData.regex || ""} onChange={(e) => updateData('regex', e.target.value)} />
        </div>
      )}

      {RenderTimeoutAndRetryLogic()}
    </div>
  );

  const RenderTriggerNode = () => (
    <div className="space-y-4 pt-4 border-t border-slate-200">
      <div>
        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Keywords</label>
        <input className="w-full border border-slate-200 bg-slate-50 rounded-lg p-2.5 text-xs font-medium" placeholder="e.g. hi, hello, start" value={draftData.keywords || ""} onChange={(e) => updateData('keywords', e.target.value)} />
      </div>
      <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
        <input type="checkbox" checked={Boolean(draftData.isGlobalOverride)} onChange={(e) => updateData("isGlobalOverride", e.target.checked)} />
        Interrupt active flows globally
      </label>
    </div>
  );

  const RenderDelayNodeLogic = (label = "Delay Before Send (ms)") => (
    <div className="space-y-4 pt-4 border-t border-slate-200">
      <div>
        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</label>
        <input
          type="number"
          min="0"
          step="100"
          className="w-full border border-slate-200 bg-slate-50 rounded-lg p-2.5 text-xs"
          placeholder="0"
          value={draftData.delayMs || ""}
          onChange={(e) => updateData("delayMs", Number(e.target.value || 0))}
        />
      </div>
    </div>
  );

  const RenderDelayNode = () => (
    <div className="space-y-4 pt-4 border-t border-slate-200">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Duration</label>
          <input
            type="number"
            min="0"
            className="w-full border border-slate-200 bg-slate-50 rounded-lg p-2.5 text-xs"
            placeholder="2"
            value={draftData.duration || ""}
            onChange={(e) => updateData("duration", Number(e.target.value || 0))}
          />
        </div>
        <div>
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Unit</label>
          <select
            className="w-full border border-slate-200 bg-slate-50 rounded-lg p-2.5 text-xs outline-none"
            value={draftData.unit || "seconds"}
            onChange={(e) => updateData("unit", e.target.value)}
          >
            <option value="seconds">Seconds</option>
            <option value="minutes">Minutes</option>
            <option value="hours">Hours</option>
          </select>
        </div>
      </div>
    </div>
  );

  const RenderApiNode = () => (
    <div className="space-y-4 pt-4 border-t border-slate-200">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Method</label>
          <select className="w-full border border-slate-200 bg-slate-50 rounded-lg p-2.5 text-xs outline-none" value={draftData.method || "GET"} onChange={(e) => updateData("method", e.target.value)}>
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="PATCH">PATCH</option>
            <option value="DELETE">DELETE</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Save Response To</label>
          <input className="w-full border border-slate-200 bg-slate-50 rounded-lg p-2.5 text-xs font-mono" placeholder="api_response" value={draftData.saveTo || ""} onChange={(e) => updateData("saveTo", e.target.value)} />
        </div>
      </div>
      <div>
        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">URL</label>
        <input className="w-full border border-slate-200 bg-slate-50 rounded-lg p-2.5 text-xs font-mono" placeholder="https://api.example.com/orders" value={draftData.url || ""} onChange={(e) => updateData("url", e.target.value)} />
      </div>
      <div>
        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">JSON Body</label>
        <textarea className="w-full border border-slate-200 bg-slate-50 rounded-lg p-2.5 text-xs font-mono resize-none h-24" placeholder='{"orderId":"{{order_id}}"}' value={draftData.body || ""} onChange={(e) => updateData("body", e.target.value)} />
      </div>
    </div>
  );

  const RenderReminderNode = () => (
    <div className="space-y-4 pt-4 border-t border-slate-200">
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] leading-5 text-slate-600">
        Reminder nodes send a follow-up message immediately when reached. For inactivity reminders on user responses, configure reminder/timeout settings on input or menu nodes.
      </div>
    </div>
  );

  const RenderTemplateNode = () => (
    <div className="space-y-4 pt-4 border-t border-slate-200">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Template Name</label>
          <input className="w-full border border-slate-200 bg-slate-50 rounded-lg p-2.5 text-xs font-mono" placeholder="e.g. welcome_msg" value={draftData.templateName || ""} onChange={(e) => updateData('templateName', e.target.value)} />
        </div>
        <div>
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Language</label>
          <input className="w-full border border-slate-200 bg-slate-50 rounded-lg p-2.5 text-xs font-mono" placeholder="en_US" value={draftData.language || ""} onChange={(e) => updateData('language', e.target.value)} />
        </div>
      </div>
      <div>
        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Variables (CSV)</label>
        <textarea className="w-full border border-slate-200 bg-slate-50 rounded-lg p-2.5 text-xs resize-none h-16" placeholder='e.g. {{name}}, {{company}}' value={draftData.variables || ""} onChange={(e) => updateData('variables', e.target.value)} />
      </div>
    </div>
  );

  const RenderMediaNode = () => (
    <div className="space-y-4 pt-4 border-t border-slate-200">
      <div>
        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Media Target</label>
        <div className="flex gap-2 mb-2">
          <input className="flex-1 border border-slate-200 bg-slate-50 rounded-lg p-2.5 text-xs font-mono" placeholder="https://..." value={draftData.media_url || draftData.url || ""} onChange={(e) => updateData('media_url', e.target.value)} />
          <label className="bg-blue-50 border border-blue-100 text-blue-600 px-3 rounded-lg text-xs font-bold cursor-pointer hover:bg-blue-100 flex items-center justify-center transition-all min-w-[70px]">
            {isUploading ? "..." : "Upload"}
            <input type="file" accept="image/*,video/*,application/pdf" className="hidden" onChange={handleMediaUpload} disabled={isUploading} />
          </label>
        </div>
      </div>
      {RenderDelayNodeLogic()}
    </div>
  );

  const RenderAssignAgentNode = () => (
    <div className="space-y-4 pt-4 border-t border-slate-200">
      <div>
        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Global Handoff Keywords</label>
        <input
          className="w-full border border-slate-200 bg-slate-50 rounded-lg p-2.5 text-xs font-medium"
          placeholder="e.g. human, support, agent"
          value={draftData.keywords || ""}
          onChange={(e) => updateData("keywords", e.target.value)}
        />
      </div>
      <div className="rounded-lg border border-amber-100 bg-amber-50 p-3 text-[11px] leading-5 text-amber-800">
        If keywords are provided, this node can act as a global interrupt and transfer the user to a human agent from any active flow.
      </div>
    </div>
  );

  const RenderEndNode = () => (
    <div className="space-y-4 pt-4 border-t border-slate-200">
      <div>
        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Active Flow Escape Keywords</label>
        <input
          className="w-full border border-slate-200 bg-slate-50 rounded-lg p-2.5 text-xs font-medium"
          placeholder="e.g. cancel, stop, quit"
          value={draftData.keywords || ""}
          onChange={(e) => updateData("keywords", e.target.value)}
        />
      </div>
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] leading-5 text-slate-600">
        End nodes now reset the current flow and keep the conversation active for future triggers.
      </div>
    </div>
  );

  const RenderSystemTextNode = (hint: string) => (
    <div className="space-y-4 pt-4 border-t border-slate-200">
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] leading-5 text-slate-600">
        {hint}
      </div>
    </div>
  );

  const RenderGotoNode = () => (
    <div className="space-y-4 pt-4 border-t border-slate-200">
      <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
        <button onClick={() => updateData('gotoType', 'node')} className={`flex-1 py-2 text-[10px] font-black uppercase rounded-lg transition-all ${draftData.gotoType !== 'bot' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400'}`}>Internal Node</button>
        <button onClick={() => updateData('gotoType', 'bot')} className={`flex-1 py-2 text-[10px] font-black uppercase rounded-lg transition-all ${draftData.gotoType === 'bot' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400'}`}>External Bot</button>
      </div>
      <div>
        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
          {draftData.gotoType === 'bot' ? 'Target Bot ID' : 'Target Node ID'}
        </label>
        <input className="w-full border border-slate-200 bg-slate-50 rounded-lg p-2.5 text-xs font-mono" placeholder={draftData.gotoType === 'bot' ? "bot_1" : "n_123"} value={draftData.targetNode || draftData.targetBotId || ""} onChange={(e) => updateData(draftData.gotoType === 'bot' ? 'targetBotId' : 'targetNode', e.target.value)} />
      </div>
    </div>
  );

  const RenderConditionNode = () => (
    <div className="space-y-4 pt-4 border-t border-slate-200">
      <div>
        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Variable to Check</label>
        <input className="w-full border border-slate-200 bg-slate-50 rounded-lg p-2.5 text-xs font-mono" placeholder="e.g. user_email" value={draftData.variable || ""} onChange={(e) => updateData('variable', e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Operator</label>
          <select className="w-full border border-slate-200 bg-slate-50 rounded-lg p-2.5 text-xs outline-none" value={draftData.operator || "equals"} onChange={(e) => updateData('operator', e.target.value)}>
            <option value="equals">Equals</option>
            <option value="contains">Contains</option>
            <option value="exists">Exists</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Value</label>
          <input className="w-full border border-slate-200 bg-slate-50 rounded-lg p-2.5 text-xs" placeholder="e.g. test@gmail.com" value={draftData.value || ""} onChange={(e) => updateData('value', e.target.value)} />
        </div>
      </div>
    </div>
  );

  const RenderSaveNode = () => (
    <div className="space-y-4 pt-4 border-t border-slate-200">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Data Variable</label>
          <input className="w-full border border-slate-200 bg-slate-50 rounded-lg p-2.5 text-xs font-mono" placeholder="e.g. session_val" value={draftData.variable || ""} onChange={(e) => updateData('variable', e.target.value)} />
        </div>
        <div>
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Lead DB Field</label>
          <input className="w-full border border-slate-200 bg-slate-50 rounded-lg p-2.5 text-xs font-mono" placeholder="e.g. name, email" value={draftData.leadField || draftData.field || ""} onChange={(e) => updateData('leadField', e.target.value)} />
        </div>
      </div>
    </div>
  );

  const RenderLeadFormNode = () => (
    <div className="space-y-4 pt-4 border-t border-slate-200">
      <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-[11px] leading-5 text-emerald-800">
        This node saves a lead using runtime context from campaign, channel, entry point, flow, and list. The flow stays reusable because the campaign context comes from the entry point, not from the flow itself.
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">Name Variable</label>
          <input className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs font-mono" placeholder="name" value={draftData.nameVariable || ""} onChange={(e) => updateData("nameVariable", e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">Phone Variable</label>
          <input className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs font-mono" placeholder="phone" value={draftData.phoneVariable || ""} onChange={(e) => updateData("phoneVariable", e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">Email Variable</label>
          <input className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs font-mono" placeholder="email" value={draftData.emailVariable || ""} onChange={(e) => updateData("emailVariable", e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">Lead Status</label>
          <input className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs font-mono" placeholder="captured" value={draftData.statusValue || ""} onChange={(e) => updateData("statusValue", e.target.value)} />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">Source Label</label>
        <input className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs font-mono" placeholder="lead_form" value={draftData.sourceLabel || ""} onChange={(e) => updateData("sourceLabel", e.target.value)} />
      </div>
    </div>
  );

  const renderSpecificNodeFields = () => {
    switch (node.type) {
      case 'input': return <RenderInputNode />;
      case 'menu_button': return RenderMenuOptionsNode(4, "Button");
      case 'menu_list': return RenderMenuOptionsNode(10, "List Item", true);
      case 'trigger': return <RenderTriggerNode />;
      case 'msg_text': return RenderDelayNodeLogic();
      case 'send_template': return <RenderTemplateNode />;
      case 'msg_media': return <RenderMediaNode />;
      case 'api': return <RenderApiNode />;
      case 'delay': return <RenderDelayNode />;
      case 'reminder': return <RenderReminderNode />;
      case 'assign_agent': return <RenderAssignAgentNode />;
      case 'end': return <RenderEndNode />;
      case 'error_handler': return RenderSystemTextNode("This node acts as the global fallback when retries are exhausted or no trigger matches.");
      case 'timeout': return RenderSystemTextNode("Use this node as a timeout target from input or menu nodes.");
      case 'resume_bot': return RenderSystemTextNode("This node returns the conversation from human mode back into bot mode.");
      case 'goto': return <RenderGotoNode />;
      case 'condition': return <RenderConditionNode />;
      case 'lead_form': return <RenderLeadFormNode />;
      case 'save': return <RenderSaveNode />;
      default: return null;
    }
  };

  return (
    <div 
      className="w-full h-full bg-white flex flex-col relative overflow-hidden nodrag nopan" 
      onMouseDownCapture={(e) => e.stopPropagation()}
      onClickCapture={(e) => e.stopPropagation()}
      onKeyDownCapture={(e) => e.stopPropagation()}
      onKeyUpCapture={(e) => e.stopPropagation()}
    >
      <div className="flex-1 overflow-y-auto p-5 pb-6 custom-scrollbar">
        <div className="space-y-4 mb-4">
          <div>
            <label className="block text-[10px] font-black text-slate-900 uppercase tracking-widest mb-1">Node Header (Label)</label>
            <input 
              className="w-full border-2 border-slate-200 bg-slate-50 focus:bg-white rounded-xl p-3 text-sm font-bold focus:border-blue-500 outline-none transition-all"
              placeholder="e.g. Greeting"
              value={draftData.label || ""}
              onChange={(e) => updateData('label', e.target.value)}
            />
          </div>
          <div>
            <label className="block text-[10px] font-black text-slate-900 uppercase tracking-widest mb-1">Message Text / Notes</label>
            <textarea 
              className="w-full border-2 border-slate-200 bg-slate-50 focus:bg-white rounded-xl p-3 text-sm min-h-[100px] resize-none focus:border-blue-500 outline-none transition-all"
              placeholder="Content..."
              value={draftData.text || ""}
              onChange={(e) => updateData('text', e.target.value)}
            />
          </div>
        </div>
        {renderSpecificNodeFields()}
      </div>
      <div className="w-full p-4 border-t border-slate-200 bg-white shrink-0 shadow-[0_-10px_20px_-5px_rgba(0,0,0,0.05)] z-10">
        <button
          onClick={() => {
            onUpdate(draftData);
            onClose();
          }}
          className="w-full bg-slate-900 text-white py-3 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-black transition-all shadow-lg active:scale-95"
        >
          Save & Close
        </button>
      </div>
    </div>
  );
}
