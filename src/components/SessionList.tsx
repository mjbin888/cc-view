// src/components/SessionList.tsx
import { SessionSummary } from "../types/conversation";
import { groupSessionsByProject } from "../lib/groupSessionsByProject";
import { filterSessions } from "../lib/filterSessions";
import { formatTimestamp } from "../lib/formatTimestamp";
import { Input } from "@/components/ui/input";

interface Props {
  sessions: SessionSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  query: string;
  onQueryChange: (q: string) => void;
}

export function SessionList({ sessions, selectedId, onSelect, query, onQueryChange }: Props) {
  const groups = groupSessionsByProject(filterSessions(sessions, query));
  return (
    <div className="flex h-full flex-col">
      <div className="p-2">
        <Input
          placeholder="搜索会话（标题/项目）"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
        />
      </div>
      <div className="flex-1 overflow-auto">
        {groups.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground">无会话</div>
        ) : (
          groups.map((g) => (
            <div key={g.projectPath} className="mb-3">
              <div className="px-3 py-1 text-xs font-medium text-muted-foreground truncate">
                {g.projectPath}
              </div>
              {g.sessions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => onSelect(s.id)}
                  aria-current={selectedId === s.id}
                  className={`block w-full border-l-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent ${
                    selectedId === s.id
                      ? "border-primary bg-accent font-medium text-foreground"
                      : "border-transparent"
                  }`}
                >
                  <div className="truncate">{s.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {s.messageCount} msgs · {formatTimestamp(s.lastActivityAt)}
                  </div>
                </button>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
