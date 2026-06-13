import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PortTable } from "../components/PortTable";
import { PortEntry } from "../types/port";

const mockEntries: PortEntry[] = [
  { port: 3000, protocol: "TCP", pid: 1234, processName: "node", state: "LISTEN" },
  { port: 5432, protocol: "TCP", pid: 5678, processName: "postgres", state: "LISTEN" },
];

describe("PortTable", () => {
  it("renders port entries", () => {
    render(<PortTable entries={mockEntries} onKill={vi.fn()} />);
    expect(screen.getByText("3000")).toBeInTheDocument();
    expect(screen.getByText("node")).toBeInTheDocument();
    expect(screen.getByText("5432")).toBeInTheDocument();
    expect(screen.getByText("postgres")).toBeInTheDocument();
  });

  it("shows empty state when no entries", () => {
    render(<PortTable entries={[]} onKill={vi.fn()} />);
    expect(screen.getByText("未发现监听端口")).toBeInTheDocument();
  });

  it("calls onKill with entry when Kill button clicked", async () => {
    const onKill = vi.fn();
    const user = userEvent.setup();
    render(<PortTable entries={mockEntries} onKill={onKill} />);
    const killButtons = screen.getAllByText("Kill");
    await user.click(killButtons[0]);
    expect(onKill).toHaveBeenCalledWith(mockEntries[0]);
  });
});
