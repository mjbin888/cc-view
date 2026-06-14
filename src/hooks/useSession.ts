// src/hooks/useSession.ts
import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { SessionDetail } from "../types/conversation";

export function useSession(id: string | null) {
  return useQuery<SessionDetail, Error>({
    queryKey: ["session", id],
    queryFn: () => invoke<SessionDetail>("read_session", { id }),
    enabled: !!id,
    refetchInterval: 5000,
    staleTime: 0,
    retry: 0,
  });
}
