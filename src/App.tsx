import { useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { AppSidebar, ViewKey } from "./components/AppSidebar";
import { PortsView } from "./views/PortsView";
import { ConversationsView } from "./views/ConversationsView";

export default function App() {
  const [view, setView] = useState<ViewKey>("ports");

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <AppSidebar view={view} onChange={setView} />
      <main className="flex-1 min-h-0 overflow-auto">
        {view === "ports" ? <PortsView /> : <ConversationsView />}
      </main>
      <Toaster />
    </div>
  );
}
