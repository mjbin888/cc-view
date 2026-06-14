// src/lib/groupSessionsByProject.ts
import { SessionSummary } from "../types/conversation";

export interface ProjectGroup {
  projectPath: string;
  sessions: SessionSummary[];
}

export function groupSessionsByProject(sessions: SessionSummary[]): ProjectGroup[] {
  const order: string[] = [];
  const map = new Map<string, SessionSummary[]>();
  for (const s of sessions) {
    const key = s.projectPath || "(未知项目)";
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)!.push(s);
  }
  return order.map((projectPath) => ({ projectPath, sessions: map.get(projectPath)! }));
}
