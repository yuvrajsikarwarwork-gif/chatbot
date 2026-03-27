import { Handle, Position } from "reactflow";
import { MessageSquareDashed } from "lucide-react";

export default function TemplateNode({ data }: { data: any }) {
  return (
    <div className="w-64 overflow-hidden rounded-2xl border border-[rgba(129,140,248,0.28)] bg-[var(--glass-surface)] shadow-[var(--shadow-soft)] backdrop-blur-xl">
      <div className="flex items-center gap-2 border-b border-[rgba(129,140,248,0.18)] bg-[linear-gradient(135deg,rgba(99,102,241,0.18),rgba(56,189,248,0.14))] px-4 py-2">
        <MessageSquareDashed size={14} className="text-indigo-200" />
        <span className="text-[10px] font-black uppercase tracking-widest text-white">Template Message</span>
      </div>
      
      <div className="p-4 space-y-3">
        <div>
          <label className="text-[9px] font-bold uppercase tracking-widest text-[var(--muted)]">Template Name</label>
          <input 
            className="mt-1 w-full rounded-lg border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] px-2 py-1.5 text-xs font-mono text-[var(--text)] outline-none focus:border-[var(--line-strong)]"
            defaultValue={data.templateName || "hello_world"}
            onChange={(e) => data.onChange?.("templateName", e.target.value)}
            placeholder="e.g. hello_world"
          />
        </div>
        <div>
          <label className="text-[9px] font-bold uppercase tracking-widest text-[var(--muted)]">Language Code</label>
          <input 
            className="mt-1 w-full rounded-lg border border-[var(--glass-border)] bg-[var(--glass-surface-strong)] px-2 py-1.5 text-xs font-mono text-[var(--text)] outline-none focus:border-[var(--line-strong)]"
            defaultValue={data.languageCode || "en_US"}
            onChange={(e) => data.onChange?.("languageCode", e.target.value)}
          />
        </div>
      </div>

      <Handle type="target" position={Position.Top} className="h-3 w-3 border-2 border-indigo-300 bg-[var(--glass-surface)]" />
      <Handle type="source" position={Position.Bottom} className="h-3 w-3 border-2 border-indigo-300 bg-[var(--glass-surface)]" />
    </div>
  );
}
