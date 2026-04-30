import { Routes, Route, Navigate } from "react-router-dom";
import { PageHeaderProvider } from "@/contexts/PageHeaderContext";
import { Toaster } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { CommandPalette } from "@/components/command/CommandPalette";
import { InboxModal } from "@/components/inbox/InboxModal";
import { RepoView } from "@/pages/RepoView";
import { ItemView } from "@/pages/ItemView";
import { NewItemView } from "@/pages/NewItemView";
import { SettingsModal } from "@/components/modals/SettingsModal";
import { RoadmapView } from "@/pages/RoadmapView";
import { ImpactView } from "@/pages/ImpactView";
import { NextView } from "@/pages/NextView";
import { ValidateView } from "@/pages/ValidateView";
import { useRepos } from "@/hooks/useRepos";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useItemEvents } from "@/hooks/useItems";
import { getLastRepoId, saveLastRepo } from "@/hooks/usePrefs";

export default function App() {
  useKeyboardShortcuts();
  useItemEvents();

  return (
    <>
      <PageHeaderProvider>
      <CommandPalette />
      <InboxModal />
      <SettingsModal />
      <AppShell>
        <Routes>
          <Route path="/" element={<DefaultRedirect />} />
          <Route path="/repos/:repoId" element={<RepoView />} />
          <Route path="/repos/:repoId/next" element={<NextView />} />
          <Route path="/repos/:repoId/roadmap" element={<RoadmapView />} />
          <Route path="/repos/:repoId/impact" element={<ImpactView />} />
          <Route path="/repos/:repoId/validate" element={<ValidateView />} />
          <Route path="/repos/:repoId/settings" element={<></>} />
          <Route path="/repos/:repoId/items/new" element={<NewItemView />} />
          <Route path="/repos/:repoId/items/:itemId" element={<ItemView />} />
        </Routes>
      </AppShell>
      </PageHeaderProvider>
      <Toaster
        position="bottom-right"
        theme="dark"
        toastOptions={{
          style: {
            background: "hsl(240 17% 12%)",
            border: "1px solid hsl(240 13% 19%)",
            color: "hsl(240 10% 90%)",
          },
        }}
      />
    </>
  );
}

function DefaultRedirect() {
  const { data: repos } = useRepos();
  if (repos && repos.length > 0) {
    const lastId = getLastRepoId();
    const target = repos.find((r) => r.id === lastId) ?? repos[0];
    saveLastRepo(target.id);
    return <Navigate to={`/repos/${target.id}`} replace />;
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
