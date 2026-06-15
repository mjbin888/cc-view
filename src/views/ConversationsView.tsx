// src/views/ConversationsView.tsx
import { useState } from "react";
import { useSessions } from "../hooks/useSessions";
import { useSession } from "../hooks/useSession";
import { SessionList } from "../components/SessionList";
import { SessionDetail } from "../components/SessionDetail";
import { SourceTabs, SourceKey } from "../components/SourceTabs";

export function ConversationsView() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<SourceKey>("claude-code");
  const { data: sessions = [], isError } = useSessions();
  const { data: detail, isLoading } = useSession(selectedId);

  const visible = sessions.filter((s) => s.source === source);

  const handleSourceChange = (next: SourceKey) => {
    setSource(next);
    setSelectedId(null); // 选中会话可能属于另一来源，切换时清空
  };

  return (
    <div className="flex h-full min-h-0">
      <div className="flex w-80 flex-col border-r min-h-0">
        <div className="border-b p-2">
          <SourceTabs active={source} onChange={handleSourceChange} />
        </div>
        {isError ? (
          <div className="p-6 text-center text-destructive text-sm">无法读取会话目录</div>
        ) : (
          <SessionList
            sessions={visible}
            selectedId={selectedId}
            onSelect={setSelectedId}
            query={query}
            onQueryChange={setQuery}
          />
        )}
      </div>
      <div className="flex-1 min-w-0 min-h-0">
        <SessionDetail detail={detail} isLoading={isLoading} hasSelection={!!selectedId} />
      </div>
    </div>
  );
}
