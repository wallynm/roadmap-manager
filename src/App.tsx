import { Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { RepoView } from "@/pages/RepoView";
import { SettingsView } from "@/pages/SettingsView";
import { useRepos } from "@/hooks/useRepos";
import { CommandPalette } from "@/components/command/CommandPalette";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useItemEvents } from "@/hooks/useItems";

export default function App() {
  useKeyboardShortcuts();
  useItemEvents();

  return (
    <>
      <AppShell>
        <Routes>
          <Route path="/" element={<DefaultRedirect />} />
          <Route path="/repos/:repoId" element={<RepoView />} />
          <Route path="/settings" element={<SettingsView />} />
        </Routes>
      </AppShell>
      <CommandPalette />
      <Toaster
        position="bottom-right"
        theme="dark"
        toastOptions={{
          style: {
            background: "hsl(222 47% 8%)",
            border: "1px solid hsl(217 33% 17%)",
            color: "hsl(210 40% 98%)",
          },
        }}
      />
    </>
  );
}

function DefaultRedirect() {
  const { data: repos } = useRepos();
  if (repos && repos.length > 0) {
    return <Navigate to={`/repos/${repos[0].id}`} replace />;
  }
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center space-y-4">
        <h2 className="text-2xl font-semibold text-foreground">Welcome to Roadmap Manager</h2>
        <p className="text-muted-foreground">Add your first repository to get started.</p>
      </div>
    </div>
  );
}
