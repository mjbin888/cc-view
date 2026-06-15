import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SourceTabs } from "../components/SourceTabs";

describe("SourceTabs", () => {
  it("renders all three source tabs", () => {
    render(<SourceTabs active="claude-code" onChange={() => {}} />);
    expect(screen.getByRole("tab", { name: "Claude Code" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Codex" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "OpenCode" })).toBeInTheDocument();
  });

  it("marks the active tab with aria-selected", () => {
    render(<SourceTabs active="codex" onChange={() => {}} />);
    expect(screen.getByRole("tab", { name: "Codex" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Claude Code" })).toHaveAttribute("aria-selected", "false");
  });

  it("fires onChange with the source key when a tab is clicked", () => {
    const onChange = vi.fn();
    render(<SourceTabs active="claude-code" onChange={onChange} />);
    fireEvent.click(screen.getByRole("tab", { name: "OpenCode" }));
    expect(onChange).toHaveBeenCalledWith("opencode");
  });
});
