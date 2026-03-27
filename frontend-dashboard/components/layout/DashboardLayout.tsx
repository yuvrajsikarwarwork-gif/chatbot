import Sidebar from "./Sidebar";
import Navbar from "./Navbar";
import { ReactNode } from "react";
import GlobalBackStrip from "../navigation/GlobalBackStrip";

interface DashboardLayoutProps {
  children: ReactNode;
  title?: string;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div className="relative flex h-screen w-screen overflow-hidden bg-transparent text-[var(--text)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_84%_8%,var(--accent-glow),transparent_18%),radial-gradient(circle_at_16%_14%,rgba(56,189,248,0.12),transparent_24%),radial-gradient(circle_at_50%_100%,rgba(15,23,42,0.08),transparent_28%)]" />
      <Sidebar />
      <div className="relative flex flex-1 flex-col overflow-hidden px-3 py-3 md:px-4 md:py-4">
        <Navbar />
        <GlobalBackStrip className="mb-2 mt-2" />
        <main className="platform-surface relative flex-1 overflow-auto rounded-[2rem] border border-[var(--glass-border)] bg-[var(--glass-surface)] p-4 shadow-[var(--shadow-glass)] backdrop-blur-2xl md:p-5">
          {children}
        </main>
      </div>
    </div>
  );
}
