import { describe, it, expect } from "vitest";
import { filterPorts } from "../lib/filterPorts";
import { PortEntry } from "../types/port";

const entries: PortEntry[] = [
  { port: 3000, protocol: "TCP", pid: 1, processName: "node", exePath: "/usr/bin/node", isUserProcess: true, state: "LISTEN" },
  { port: 5432, protocol: "TCP", pid: 2, processName: "postgres", exePath: "/opt/pg/bin/postgres", isUserProcess: false, state: "LISTEN" },
  { port: 8080, protocol: "TCP", pid: 3, processName: "java", exePath: "/Library/Java/bin/java", isUserProcess: true, state: "LISTEN" },
];

describe("filterPorts", () => {
  it("returns all entries for empty query", () => {
    expect(filterPorts(entries, "")).toHaveLength(3);
    expect(filterPorts(entries, "   ")).toHaveLength(3);
  });

  it("matches by port number substring", () => {
    const r = filterPorts(entries, "3000");
    expect(r).toHaveLength(1);
    expect(r[0].port).toBe(3000);
  });

  it("matches by process name case-insensitively", () => {
    const r = filterPorts(entries, "POSTGRES");
    expect(r).toHaveLength(1);
    expect(r[0].processName).toBe("postgres");
  });

  it("matches by exe path", () => {
    const r = filterPorts(entries, "/library/java");
    expect(r).toHaveLength(1);
    expect(r[0].processName).toBe("java");
  });

  it("returns empty array when nothing matches", () => {
    expect(filterPorts(entries, "zzz")).toHaveLength(0);
  });
});
