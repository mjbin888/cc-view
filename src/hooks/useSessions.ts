// src/hooks/useSessions.ts
import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { SessionSummary } from "../types/conversation";

export function useSessions() {
  return useQuery<SessionSummary[], Error>({
    queryKey: ["sessions"],
    queryFn: () => invoke<SessionSummary[]>("list_sessions"),
    refetchInterval: 5000,
    staleTime: 0,
    retry: 0,
  });
}
