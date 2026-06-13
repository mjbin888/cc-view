import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PortTable } from "../components/PortTable";
import { PortEntry } from "../types/port";

const mockEntries: PortEntry[] = [
  { port: 3000, protocol: "TCP", pid: 1234, processName: "node", state: "LISTEN" },
  { port: 5432, protocol: "TCP", pid: 5678, processName: "postgres", state: "LISTEN" },
];

describe("PortTable", () => {
  it("renders port entries", () => {
    render(<PortTable entries={mockEntries} onKill={vi.fn()} />);
    expect(screen.getByText("3000")).toBeDefined();
    expect(screen.getByText("node")).toBeDefined();
    expect(screen.getByText("5432")).toBeDefined();
    expect(screen.getByText("postgres")).toBeDefined();
  });

  it("shows empty state when no entries", () => {
    render(<PortTable entries={[]} onKill={vi.fn()} />);
    expect(screen.getByText("未发现监听端口")).toBeDefined();
  });

  it("calls onKill with entry when Kill button clicked", () => {
    const onKill = vi.fn();
    render(<PortTable entries={mockEntries} onKill={onKill} />);
    const killButtons = screen.getAllByText("Kill");
    killButtons[0].click();
    expect(onKill).toHaveBeenCalledWith(mockEntries[0]);
  });
});
