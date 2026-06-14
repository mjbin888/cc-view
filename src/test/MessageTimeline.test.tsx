import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MessageTimeline } from "../components/MessageTimeline";
import { NormEvent } from "../types/conversation";

const events: NormEvent[] = [
  { uuid: "u1", role: "user", timestamp: "2026-06-14T00:00:00Z",
    blocks: [{ kind: "text", text: "hello world" }], raw: '{"a":1}' },
  { uuid: "a1", role: "assistant", timestamp: "2026-06-14T00:00:02Z", model: "claude-sonnet-4-6",
    blocks: [
      { kind: "thinking", text: "secret thought" },
      { kind: "text", text: "the answer" },
      { kind: "tool_use", id: "t1", name: "Bash", input: { command: "ls" } },
    ], raw: '{"b":2}' },
];

describe("MessageTimeline", () => {
  it("renders user text and assistant text", () => {
    render(<MessageTimeline events={events} />);
    expect(screen.getByText("hello world")).toBeInTheDocument();
    expect(screen.getByText("the answer")).toBeInTheDocument();
  });

  it("renders tool name", () => {
    render(<MessageTimeline events={events} />);
    expect(screen.getByText(/Bash/)).toBeInTheDocument();
  });

  it("toggles raw view for an event", () => {
    render(<MessageTimeline events={events} />);
    expect(screen.queryByText(/"a":1/)).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /raw/i })[0]);
    expect(screen.getByText(/"a":1/)).toBeInTheDocument();
  });

  it("renders empty state", () => {
    render(<MessageTimeline events={[]} />);
    expect(screen.getByText("无消息")).toBeInTheDocument();
  });
});
