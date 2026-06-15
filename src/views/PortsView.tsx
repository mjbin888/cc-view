import { useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { usePorts } from "../hooks/usePorts";
import { PortTable } from "../components/PortTable";
import { RefreshBar } from "../components/RefreshBar";
import { KillDialog } from "../components/KillDialog";
import { SearchBar } from "../components/SearchBar";
import { filterPorts } from "../lib/filterPorts";
import { groupPorts } from "../lib/groupPorts";
import { PortEntry } from "../types/port";

export function PortsView() {
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [query, setQuery] = useState("");
  const [pendingKill, setPendingKill] = useState<PortEntry | null>(null);
  const queryClient = useQueryClient();

  const { data: ports = [], isFetching, isError } = usePorts(autoRefresh);

  const groups = useMemo(() => groupPorts(filterPorts(ports, query)), [ports, query]);

  const emptyMessage =
    query.trim() && ports.length > 0 ? "无匹配结果" : "未发现监听端口";

  function handleRefresh() {
    queryClient.invalidateQueries({ queryKey: ["ports"] });
  }

  async function handleKillConfirm(entry: PortEntry) {
    try {
      await invoke("kill_port", { pid: entry.pid });
      setPendingKill(null);
      toast.success(`已 Kill ${entry.processName} (PID ${entry.pid})`);
      handleRefresh();
    } catch (err) {
      toast.error(`Kill 失败: ${err}`);
    }
  }

  return (
    <div className="h-full w-full overflow-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">本地端口管理</h1>
        <RefreshBar
          autoRefresh={autoRefresh}
          onAutoRefreshChange={setAutoRefresh}
          onRefresh={handleRefresh}
          isLoading={isFetching}
        />
      </div>
      <SearchBar query={query} onQueryChange={setQuery} />
      {isError && (
        <div className="mb-4 rounded-md border border-destructive bg-destructive/10 px-4 py-2 text-sm text-destructive">
          无法获取端口列表，请检查应用权限
        </div>
      )}
      <div className="rounded-lg border overflow-x-auto">
        <PortTable groups={groups} onKill={setPendingKill} emptyMessage={emptyMessage} />
      </div>

      <KillDialog
        entry={pendingKill}
        onConfirm={handleKillConfirm}
        onCancel={() => setPendingKill(null)}
      />
    </div>
  );
}
