import Head from "next/head";
import { useRouter } from "next/router";
import Sidebar from "./Sidebar";
import Navbar from "./Navbar";
import { createContext, ReactNode, useContext } from "react";
import GlobalBackStrip from "../navigation/GlobalBackStrip";
import WorkspaceStatusBanner from "../workspace/WorkspaceStatusBanner";
import { WorkspaceRuntimeProvider, useWorkspaceRuntime } from "../workspace/WorkspaceRuntimeProvider";

const PersistentShellContext = createContext(false);

export function usePersistentDashboardShell() {
  return useContext(PersistentShellContext);
}

interface DashboardLayoutProps {
  children: ReactNode;
  title?: string;
  fullBleed?: boolean;
}

export function DashboardLayoutShell({ children, title, fullBleed = false }: DashboardLayoutProps) {
  return (
    <PersistentShellContext.Provider value={true}>
      <DashboardLayoutFrame title={title} fullBleed={fullBleed}>
        {children}
      </DashboardLayoutFrame>
    </PersistentShellContext.Provider>
  );
}

function DashboardLayoutFrame({ children, title, fullBleed = false }: DashboardLayoutProps) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-canvas">
      <Sidebar />
      <WorkspaceRuntimeProvider>
        <DashboardLayoutRuntimeFrame title={title} fullBleed={fullBleed}>
          {children}
        </DashboardLayoutRuntimeFrame>
      </WorkspaceRuntimeProvider>
    </div>
  );
}

function DashboardLayoutRuntimeFrame({ children, title, fullBleed = false }: DashboardLayoutProps) {
  const router = useRouter();
  const { workspace, banner, isReadOnly, loading } = useWorkspaceRuntime();
  const isWorkspaceShellRoute = router.pathname === "/workspaces" || router.pathname.startsWith("/workspaces/");
  const applyWorkspaceReadonlyStyles = !isWorkspaceShellRoute && isReadOnly;
  const shellClassName = fullBleed
    ? "min-h-full w-full bg-transparent"
    : "mx-auto min-h-full w-full max-w-[1600px] rounded-[2rem] border border-border-main bg-surface p-6 shadow-sm transition-colors duration-300";

  return (
    <>
      {title ? (
        <Head>
          <title>{`${title} | BOT.OS`}</title>
        </Head>
      ) : null}
      <div className="relative flex flex-1 flex-col overflow-y-auto bg-canvas text-text-main">
        <div className="relative z-10 flex min-h-0 flex-1 flex-col px-3 py-3 md:px-4 md:py-4">
          <Navbar />
          <GlobalBackStrip className="mb-2 mt-2" />
          {!isWorkspaceShellRoute && banner ? (
            <div className="mb-2">
              <WorkspaceStatusBanner workspace={workspace} />
            </div>
          ) : null}
          <main className="relative flex min-h-0 w-full flex-1 flex-col">
            <div
              className={shellClassName}
              data-workspace-readonly={applyWorkspaceReadonlyStyles ? "true" : "false"}
              data-workspace-loading={loading ? "true" : "false"}
            >
              {children}
            </div>
          </main>
        </div>
      </div>
    </>
  );
}

export default function DashboardLayout(props: DashboardLayoutProps) {
  const persistentShellActive = usePersistentDashboardShell();

  if (persistentShellActive) {
    return (
      <>
        {props.title ? (
          <Head>
            <title>{`${props.title} | BOT.OS`}</title>
          </Head>
        ) : null}
        {props.children}
      </>
    );
  }

  return (
    <DashboardLayoutShell {...props} />
  );
}

export { PersistentShellContext };
