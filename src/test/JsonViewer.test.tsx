import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { JsonViewer } from "../components/JsonViewer";

describe("JsonViewer", () => {
  it("collapse all hides nested values; expand all shows them again", () => {
    render(<JsonViewer data={{ a: { b: 99 } }} />);
    expect(screen.getByText("99")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "折叠" }));
    expect(screen.queryByText("99")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "展开" }));
    expect(screen.getByText("99")).toBeInTheDocument();
  });

  it("search highlights matches", () => {
    const { container } = render(<JsonViewer data={{ cmd: "echo hi" }} />);
    fireEvent.change(screen.getByPlaceholderText("搜索 JSON…"), {
      target: { value: "echo" },
    });
    expect(container.querySelector("mark")?.textContent).toBe("echo");
  });

  it("copy writes formatted json to clipboard", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    render(<JsonViewer data={{ x: 1 }} />);
    fireEvent.click(screen.getByRole("button", { name: "复制" }));
    expect(writeText).toHaveBeenCalledWith(JSON.stringify({ x: 1 }, null, 2));
  });
});
