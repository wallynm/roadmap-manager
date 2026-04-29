import { ReactNode } from "react";
import { ProjectRail } from "./ProjectRail";
import { Sidebar } from "./Sidebar";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-card">
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
  );
}
