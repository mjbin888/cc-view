// src/views/ConversationsView.tsx
import { useState } from "react";
import { useSessions } from "../hooks/useSessions";
import { useSession } from "../hooks/useSession";
import { SessionList } from "../components/SessionList";
import { SessionDetail } from "../components/SessionDetail";

export function ConversationsView() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const { data: sessions = [], isError } = useSessions();
  const { data: detail, isLoading } = useSession(selectedId);

  return (
    <div className="flex h-screen">
      <div className="w-80 border-r">
        {isError ? (
          <div className="p-6 text-center text-destructive text-sm">无法读取会话目录</div>
        ) : (
          <SessionList
            sessions={sessions}
            selectedId={selectedId}
            onSelect={setSelectedId}
            query={query}
            onQueryChange={setQuery}
          />
        )}
      </div>
      <div className="flex-1">
        <SessionDetail detail={detail} isLoading={isLoading} hasSelection={!!selectedId} />
      </div>
    </div>
  );
}
