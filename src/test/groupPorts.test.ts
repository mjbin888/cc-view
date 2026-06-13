import { describe, it, expect } from "vitest";
import { groupPorts } from "../lib/groupPorts";
import { PortEntry } from "../types/port";

const entries: PortEntry[] = [
  { port: 5000, protocol: "TCP", pid: 1229, processName: "ControlCenter", exePath: "/System/CC", isUserProcess: false, state: "LISTEN" },
  { port: 7000, protocol: "TCP", pid: 1229, processName: "ControlCenter", exePath: "/System/CC", isUserProcess: false, state: "LISTEN" },
  { port: 3000, protocol: "TCP", pid: 42, processName: "node", exePath: "/usr/bin/node", isUserProcess: true, state: "LISTEN" },
];

describe("groupPorts", () => {
  it("aggregates same-PID entries into one group", () => {
    const groups = groupPorts(entries);
    const cc = groups.find((g) => g.pid === 1229);
    expect(cc).toBeDefined();
    expect(cc!.entries).toHaveLength(2);
    expect(cc!.processName).toBe("ControlCenter");
  });

  it("keeps single-port PID as its own group of one", () => {
    const groups = groupPorts(entries);
    const node = groups.find((g) => g.pid === 42);
    expect(node).toBeDefined();
    expect(node!.entries).toHaveLength(1);
  });

  it("produces one group per distinct PID", () => {
    const groups = groupPorts(entries);
    expect(groups).toHaveLength(2);
  });

  it("preserves first-seen order of groups", () => {
    const groups = groupPorts(entries);
    expect(groups[0].pid).toBe(1229);
    expect(groups[1].pid).toBe(42);
  });

  it("returns empty array for empty input", () => {
    expect(groupPorts([])).toHaveLength(0);
  });
});
