// src/lib/filterPorts.ts
import { PortEntry } from "../types/port";

export function filterPorts(entries: PortEntry[], query: string): PortEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter(
    (e) =>
      String(e.port).includes(q) ||
      e.processName.toLowerCase().includes(q) ||
      e.exePath.toLowerCase().includes(q)
  );
}
