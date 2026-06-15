import { useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "./contexts/ThemeProvider";
import { AppSidebar, ViewKey } from "./components/AppSidebar";
import { HudBar } from "./components/HudBar";
import { PortsView } from "./views/PortsView";
import { ConversationsView } from "./views/ConversationsView";

export default function App() {
  const [view, setView] = useState<ViewKey>("conversations");

  return (
    <ThemeProvider>
      <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
        <HudBar />
        <div className="flex min-h-0 flex-1">
          <AppSidebar view={view} onChange={setView} />
          <main className="flex-1 min-w-0 min-h-0 overflow-hidden">
            {view === "ports" ? <PortsView /> : <ConversationsView />}
          </main>
        </div>
        <Toaster />
      </div>
    </ThemeProvider>
  );
}
