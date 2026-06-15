// src/hooks/useSession.ts
import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { SessionDetail } from "../types/conversation";

export function useSession(id: string | null) {
  return useQuery<SessionDetail, Error>({
    queryKey: ["session", id],
    queryFn: () => invoke<SessionDetail>("read_session", { id }),
    enabled: !!id,
    // 历史会话内容不变，不轮询（大 codex 会话每 5s 重拉+重渲染是卡顿主因）；
    // 列表仍轮询以发现新会话，详情按需重取即可。
    refetchInterval: false,
    staleTime: Infinity,
    retry: 0,
  });
}
