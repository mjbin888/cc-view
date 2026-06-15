import { describe, it, expect } from "vitest";
import { filterPorts } from "../lib/filterPorts";
import { PortEntry } from "../types/port";

const entries: PortEntry[] = [
  { port: 3000, protocol: "TCP", pid: 1, processName: "node", exePath: "/usr/bin/node", cwd: "/Users/foo/myproject", cmd: "node vite.js", isUserProcess: true, state: "LISTEN", runTimeSecs: 120 },
  { port: 5432, protocol: "TCP", pid: 2, processName: "postgres", exePath: "/opt/pg/bin/postgres", cwd: "/var/lib/postgres", cmd: "postgres -D /var/lib/postgres", isUserProcess: false, state: "LISTEN", runTimeSecs: 3600 },
  { port: 8080, protocol: "TCP", pid: 3, processName: "java", exePath: "/Library/Java/bin/java", cwd: "/Users/foo/app", cmd: "java -jar app.jar", isUserProcess: true, state: "LISTEN", runTimeSecs: 60 },
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

  it("matches by cwd", () => {
    const r = filterPorts(entries, "myproject");
    expect(r).toHaveLength(1);
    expect(r[0].port).toBe(3000);
  });

  it("matches by cmd", () => {
    const r = filterPorts(entries, "vite.js");
    expect(r).toHaveLength(1);
    expect(r[0].port).toBe(3000);
  });

  it("returns empty array when nothing matches", () => {
    expect(filterPorts(entries, "zzz")).toHaveLength(0);
  });
});
