import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PortTable } from "../components/PortTable";
import { PortGroup } from "../lib/groupPorts";

const singlePortGroup: PortGroup = {
  pid: 42,
  processName: "node",
  exePath: "/usr/bin/node",
  cwd: "/Users/foo/myproject",
  cmd: "node vite.js",
  isUserProcess: true,
  entries: [
    { port: 3000, protocol: "TCP", pid: 42, processName: "node", exePath: "/usr/bin/node", cwd: "/Users/foo/myproject", cmd: "node vite.js", isUserProcess: true, state: "LISTEN", runTimeSecs: 120 },
  ],
};

const multiPortGroup: PortGroup = {
  pid: 1229,
  processName: "ControlCenter",
  exePath: "/System/CC",
  cwd: "/System",
  cmd: "ControlCenter",
  isUserProcess: false,
  entries: [
    { port: 5000, protocol: "TCP", pid: 1229, processName: "ControlCenter", exePath: "/System/CC", cwd: "/System", cmd: "ControlCenter", isUserProcess: false, state: "LISTEN", runTimeSecs: 7200 },
    { port: 7000, protocol: "TCP", pid: 1229, processName: "ControlCenter", exePath: "/System/CC", cwd: "/System", cmd: "ControlCenter", isUserProcess: false, state: "LISTEN", runTimeSecs: 7200 },
  ],
};

describe("PortTable", () => {
  it("renders a single-port group showing cwd as path", () => {
    render(<PortTable groups={[singlePortGroup]} onKill={vi.fn()} />);
    expect(screen.getByText("3000")).toBeInTheDocument();
    expect(screen.getByText("node")).toBeInTheDocument();
    expect(screen.getByText("/Users/foo/myproject")).toBeInTheDocument();
  });

  it("falls back to exePath when cwd is empty", () => {
    const group: PortGroup = {
      ...singlePortGroup,
      cwd: "",
      entries: [{ ...singlePortGroup.entries[0], cwd: "" }],
    };
    render(<PortTable groups={[group]} onKill={vi.fn()} />);
    expect(screen.getByText("/usr/bin/node")).toBeInTheDocument();
  });

  it("renders duration column for single-port group", () => {
    render(<PortTable groups={[singlePortGroup]} onKill={vi.fn()} />);
    expect(screen.getByText("2m")).toBeInTheDocument();
  });

  it("shows — for runTimeSecs === 0", () => {
    const group: PortGroup = {
      ...singlePortGroup,
      entries: [{ ...singlePortGroup.entries[0], runTimeSecs: 0 }],
    };
    render(<PortTable groups={[group]} onKill={vi.fn()} />);
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("shows default empty state when no groups", () => {
    render(<PortTable groups={[]} onKill={vi.fn()} />);
    expect(screen.getByText("未发现监听端口")).toBeInTheDocument();
  });

  it("shows custom empty message when provided", () => {
    render(<PortTable groups={[]} onKill={vi.fn()} emptyMessage="无匹配结果" />);
    expect(screen.getByText("无匹配结果")).toBeInTheDocument();
  });

  it("calls onKill with the entry when a single-port Kill is clicked", async () => {
    const onKill = vi.fn();
    const user = userEvent.setup();
    render(<PortTable groups={[singlePortGroup]} onKill={onKill} />);
    await user.click(screen.getByText("Kill"));
    expect(onKill).toHaveBeenCalledWith(singlePortGroup.entries[0]);
  });

  it("renders multi-port group child rows expanded by default", () => {
    render(<PortTable groups={[multiPortGroup]} onKill={vi.fn()} />);
    expect(screen.getByText("5000")).toBeInTheDocument();
    expect(screen.getByText("7000")).toBeInTheDocument();
    expect(screen.getByText("2 个端口")).toBeInTheDocument();
  });

  it("collapses and expands a multi-port group on header click", async () => {
    const user = userEvent.setup();
    render(<PortTable groups={[multiPortGroup]} onKill={vi.fn()} />);
    expect(screen.getByText("5000")).toBeInTheDocument();
    await user.click(screen.getByText("2 个端口"));
    expect(screen.queryByText("5000")).not.toBeInTheDocument();
    await user.click(screen.getByText("2 个端口"));
    expect(screen.getByText("5000")).toBeInTheDocument();
  });

  it("calls onKill with the correct child entry from a multi-port group", async () => {
    const onKill = vi.fn();
    const user = userEvent.setup();
    render(<PortTable groups={[multiPortGroup]} onKill={onKill} />);
    const killButtons = screen.getAllByText("Kill");
    await user.click(killButtons[0]);
    expect(onKill).toHaveBeenCalledWith(multiPortGroup.entries[0]);
  });
});
