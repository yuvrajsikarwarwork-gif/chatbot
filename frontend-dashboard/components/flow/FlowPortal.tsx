import { useRouter } from "next/router";
import { BrainCircuit, ChevronRight, Plus } from "lucide-react";

interface FlowPortalProps {
  availableBots: any[];
  embedded?: boolean;
}

export default function FlowPortal({ availableBots, embedded = false }: FlowPortalProps) {
  const router = useRouter();

  return (
    <div
      className={`flex flex-col items-center overflow-y-auto px-4 py-2 md:px-6 md:py-3 ${
        embedded
          ? "min-h-full bg-transparent"
          : "h-screen w-screen bg-slate-900"
      }`}
    >
      <div className="max-w-6xl w-full flex flex-col items-center">
        <div className="mb-5 flex flex-col items-center text-center">
            <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-4 border shadow-[0_0_30px_rgba(59,130,246,0.2)] ${
              embedded
                ? "bg-blue-50 text-blue-600 border-blue-100"
                : "bg-blue-500/10 text-blue-500 border-blue-500/20"
            }`}>
                <BrainCircuit size={28} />
            </div>
            <p className={`${embedded ? "text-slate-700" : "text-slate-300"} text-sm font-semibold tracking-wide`}>
              Choose a bot slot to open the workflow builder.
            </p>
        </div>

        <div className="grid w-full grid-cols-1 gap-6 md:grid-cols-2">
            {availableBots.map((b) => (
                <button 
                    key={b.id} 
                    onClick={() => router.push(`/flows?botId=${b.id}`)}
                    className={`group p-8 rounded-[2.5rem] flex items-center justify-between transition-all duration-500 text-left relative overflow-hidden active:scale-[0.98] ${
                      embedded
                        ? "bg-slate-50 border border-slate-200 hover:bg-white hover:border-blue-300 shadow-sm"
                        : "bg-white/5 border border-white/10 hover:bg-white/10 hover:border-blue-500/50"
                    }`}
                >
                    <div className="relative z-10">
                        <div className="flex items-center gap-3 mb-2">
                             <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                             <span className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-500">Active Slot</span>
                        </div>
                        <h3 className={`${embedded ? "text-slate-900" : "text-white"} text-xl font-black uppercase tracking-tight mb-1 group-hover:text-blue-400 transition-colors`}>{b.name}</h3>
                        <p className="text-slate-500 text-[10px] font-mono tracking-tighter uppercase">ID: {b.id.slice(0, 18)}...</p>
                    </div>
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white group-hover:rotate-12 transition-all duration-500 ${
                      embedded ? "bg-white text-slate-700 border border-slate-200" : "bg-white/5 text-white"
                    }`}>
                        <ChevronRight size={24} />
                    </div>
                    <div className={`absolute -right-4 -bottom-4 w-24 h-24 rounded-full blur-3xl transition-all ${
                      embedded ? "bg-blue-500/10 group-hover:bg-blue-500/15" : "bg-blue-500/5 group-hover:bg-blue-500/10"
                    }`} />
                </button>
            ))}
            
            <button 
                onClick={() => router.push('/bots')}
                className={`group border-2 border-dashed p-8 rounded-[2.5rem] flex flex-col items-center justify-center transition-all text-center gap-3 ${
                  embedded
                    ? "border-slate-200 hover:border-slate-400 bg-slate-50"
                    : "border-white/10 hover:border-white/30"
                } ${availableBots.length === 0 ? 'md:col-span-2 mx-auto w-full md:w-1/2' : ''}`}
            >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-slate-500 transition-all ${
                  embedded ? "bg-white border border-slate-200 group-hover:text-slate-900" : "bg-white/5 group-hover:text-white group-hover:bg-white/10"
                }`}>
                    <Plus size={20} />
                </div>
                <span className={`text-[10px] font-black uppercase tracking-widest ${
                  embedded ? "text-slate-500 group-hover:text-slate-900" : "text-slate-400 group-hover:text-white"
                }`}>Open Bot Slots</span>
            </button>
        </div>

        {availableBots.length === 0 && (
            <div className={`mt-12 p-6 border rounded-2xl text-center max-w-md ${
              embedded ? "bg-amber-50 border-amber-200" : "bg-amber-500/5 border-amber-500/20"
            }`}>
                 <p className="text-amber-500 text-[10px] font-black uppercase tracking-[0.2em]">
                   No Bot Slots Available. <br/>
                   <span className="opacity-60 font-medium">Open one from Bot Manager to continue.</span>
                  </p>
            </div>
        )}
      </div>
    </div>
  );
}
