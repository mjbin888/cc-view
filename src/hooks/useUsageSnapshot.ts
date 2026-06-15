import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { UsageSnapshot } from "../types/usage";

export function useUsageSnapshot() {
  return useQuery<UsageSnapshot | null, Error>({
    queryKey: ["usage-snapshot"],
    queryFn: () => invoke<UsageSnapshot | null>("read_usage_snapshot"),
    refetchInterval: 30_000,
    staleTime: 0,
    retry: 0,
  });
}
