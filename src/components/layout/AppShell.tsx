import { type ReactNode } from "react";
import { ProjectRail } from "./ProjectRail";
import { Sidebar } from "./Sidebar";
import { usePageHeaderSlot } from "@/contexts/PageHeaderContext";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const headerSlot = usePageHeaderSlot();

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-card">
      {/* Custom titlebar — titleBarStyle: Overlay keeps native macOS traffic lights.
          data-tauri-drag-region on empty areas makes the window draggable. */}
      <div className="flex items-center h-10 shrink-0 select-none border-b border-border/40">
        {/* Left zone: matches ProjectRail width — traffic lights sit here */}
        <div data-tauri-drag-region className="w-[60px] h-full shrink-0" />

        {/* Middle zone: matches Sidebar width — draggable empty space */}
        <div data-tauri-drag-region className="w-56 h-full shrink-0" />

        {/* Separator */}
        <div className="w-px h-5 bg-border/50 shrink-0" />

        {/* Toolbar slot */}
        <div className="flex-1 flex items-center min-w-0 px-3">
          {headerSlot}
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        <ProjectRail />
        <Sidebar />
        <main className="flex-1 overflow-hidden p-2 pl-0">
          <div className="h-full rounded-xl border border-border bg-background overflow-hidden">
            <div className="h-full overflow-auto p-6">
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
