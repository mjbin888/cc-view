// src/hooks/usePorts.ts
import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { PortEntry } from "../types/port";

export function usePorts(autoRefresh: boolean) {
  return useQuery<PortEntry[]>({
    queryKey: ["ports"],
    queryFn: () => invoke<PortEntry[]>("list_ports"),
    refetchInterval: autoRefresh ? 3000 : false,
    staleTime: 0,
  });
}
