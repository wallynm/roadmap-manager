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
      {/* Custom titlebar — replaces native macOS titlebar via titleBarStyle: Overlay.
          data-tauri-drag-region makes the empty area draggable.
          pl-[72px] avoids overlapping the native traffic light buttons. */}
      <div
        data-tauri-drag-region
        className="flex items-center h-10 shrink-0 pl-[72px] pr-3 select-none border-b border-border/40"
      >
        {headerSlot
          ? <div className="flex-1 flex items-center min-w-0">{headerSlot}</div>
          : <div className="flex-1" />
        }
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
