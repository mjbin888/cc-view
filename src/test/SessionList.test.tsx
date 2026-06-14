import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SessionList } from "../components/SessionList";
import { SessionSummary } from "../types/conversation";

const s = (id: string, title: string, projectPath: string): SessionSummary => ({
  id, source: "claude-code", projectPath, title,
  messageCount: 3, startedAt: "", lastActivityAt: "2026-06-14T00:00:00Z",
  totalInputTokens: 0, totalOutputTokens: 0, models: [],
});

const sessions = [s("1", "fix auth", "/p/api"), s("2", "add viewer", "/p/tools")];

describe("SessionList", () => {
  it("renders grouped sessions", () => {
    render(<SessionList sessions={sessions} selectedId={null} onSelect={() => {}} query="" onQueryChange={() => {}} />);
    expect(screen.getByText("fix auth")).toBeInTheDocument();
    expect(screen.getByText("/p/tools")).toBeInTheDocument();
  });

  it("calls onSelect when a session is clicked", () => {
    const onSelect = vi.fn();
    render(<SessionList sessions={sessions} selectedId={null} onSelect={onSelect} query="" onQueryChange={() => {}} />);
    fireEvent.click(screen.getByText("fix auth"));
    expect(onSelect).toHaveBeenCalledWith("1");
  });

  it("shows empty state", () => {
    render(<SessionList sessions={[]} selectedId={null} onSelect={() => {}} query="" onQueryChange={() => {}} />);
    expect(screen.getByText("无会话")).toBeInTheDocument();
  });
});
