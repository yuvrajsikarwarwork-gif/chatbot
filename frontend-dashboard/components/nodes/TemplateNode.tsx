import { Handle, Position } from "reactflow";
import { MessageSquareDashed } from "lucide-react";

export default function TemplateNode({ data }: { data: any }) {
  return (
    <div className="w-64 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface-strong)] shadow-sm">
      <div className="flex items-center gap-2 border-b border-[var(--line)] bg-[var(--surface)] px-4 py-2">
        <MessageSquareDashed size={14} className="text-indigo-600" />
        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text)]">Template Message</span>
      </div>
      
      <div className="p-4 space-y-3">
        <div>
          <label className="text-[9px] font-bold uppercase tracking-widest text-[var(--muted)]">Template Name</label>
          <input 
            className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5 text-xs font-mono text-[var(--text)] outline-none focus:border-[var(--primary)]"
            defaultValue={data.templateName || "hello_world"}
            onChange={(e) => data.onChange?.("templateName", e.target.value)}
            placeholder="e.g. hello_world"
          />
        </div>
        <div>
          <label className="text-[9px] font-bold uppercase tracking-widest text-[var(--muted)]">Language Code</label>
          <input 
            className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5 text-xs font-mono text-[var(--text)] outline-none focus:border-[var(--primary)]"
            defaultValue={data.languageCode || "en_US"}
            onChange={(e) => data.onChange?.("languageCode", e.target.value)}
          />
        </div>
      </div>

      <Handle type="target" position={Position.Top} className="h-3 w-3 border-2 border-indigo-300 bg-[var(--surface)]" />
      <Handle type="source" position={Position.Bottom} className="h-3 w-3 border-2 border-indigo-300 bg-[var(--surface)]" />
    </div>
  );
}
