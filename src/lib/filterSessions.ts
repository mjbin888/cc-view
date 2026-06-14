// src/lib/filterSessions.ts
import { SessionSummary } from "../types/conversation";

export function filterSessions(sessions: SessionSummary[], query: string): SessionSummary[] {
  const q = query.trim().toLowerCase();
  if (!q) return sessions;
  return sessions.filter(
    (s) =>
      s.title.toLowerCase().includes(q) ||
      s.projectPath.toLowerCase().includes(q)
  );
}
