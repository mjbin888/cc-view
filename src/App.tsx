import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { useQueryClient } from "@tanstack/react-query";
import { usePorts } from "./hooks/usePorts";
import { PortTable } from "./components/PortTable";
import { RefreshBar } from "./components/RefreshBar";
import { KillDialog } from "./components/KillDialog";
import { PortEntry } from "./types/port";

export default function App() {
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [pendingKill, setPendingKill] = useState<PortEntry | null>(null);
  const queryClient = useQueryClient();

  const { data: ports = [], isFetching } = usePorts(autoRefresh);

  function handleRefresh() {
    queryClient.invalidateQueries({ queryKey: ["ports"] });
  }

  async function handleKillConfirm(entry: PortEntry) {
    setPendingKill(null);
    try {
      await invoke("kill_port", { pid: entry.pid });
      toast.success(`已 Kill ${entry.processName} (PID ${entry.pid})`);
      handleRefresh();
    } catch (err) {
      toast.error(`Kill 失败: ${err}`);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Port Manager</h1>
          <RefreshBar
            autoRefresh={autoRefresh}
            onAutoRefreshChange={setAutoRefresh}
            onRefresh={handleRefresh}
            isLoading={isFetching}
          />
        </div>
        <div className="rounded-lg border">
          <PortTable entries={ports} onKill={setPendingKill} />
        </div>
      </div>

      <KillDialog
        entry={pendingKill}
        onConfirm={handleKillConfirm}
        onCancel={() => setPendingKill(null)}
      />
      <Toaster />
    </div>
  );
}
