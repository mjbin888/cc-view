// src/lib/groupPorts.ts
import { PortEntry } from "../types/port";

export interface PortGroup {
  pid: number;
  processName: string;
  exePath: string;
  cwd: string;
  cmd: string;
  isUserProcess: boolean;
  entries: PortEntry[];
}

export function groupPorts(entries: PortEntry[]): PortGroup[] {
  const map = new Map<number, PortGroup>();
  for (const e of entries) {
    const existing = map.get(e.pid);
    if (existing) {
      existing.entries.push(e);
    } else {
      map.set(e.pid, {
        pid: e.pid,
        processName: e.processName,
        exePath: e.exePath,
        cwd: e.cwd,
        cmd: e.cmd,
        isUserProcess: e.isUserProcess,
        entries: [e],
      });
    }
  }
  return Array.from(map.values());
}
