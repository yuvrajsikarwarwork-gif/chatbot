import React from "react";

interface HintProps {
  text: string;
  isVisible: boolean;
  onDismiss: () => void;
}

export default function CommandRailHint({ text, isVisible, onDismiss }: HintProps) {
  if (!isVisible) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute left-16 top-1/2 z-[100] -translate-y-1/2 animate-in fade-in slide-in-from-left-2 duration-300">
      <div className="absolute -left-1.5 top-1/2 h-0 w-0 -translate-y-1/2 border-b-[6px] border-r-[8px] border-t-[6px] border-b-transparent border-r-purple-600 border-t-transparent" />
      <div className="pointer-events-auto w-48 rounded-xl bg-purple-600 p-3 text-white shadow-2xl">
        <p className="mb-2 text-[10px] font-medium leading-tight italic">"{text}"</p>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onDismiss();
          }}
          className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest transition-colors hover:text-purple-200"
        >
          <span>✨</span> Got it
        </button>
      </div>
    </div>
  );
}
