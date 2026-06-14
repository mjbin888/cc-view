import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { highlightText } from "../lib/highlightText";

describe("highlightText", () => {
  it("returns text unchanged with no term", () => {
    const { container } = render(<>{highlightText("hello", "")}</>);
    expect(container.textContent).toBe("hello");
    expect(container.querySelector("mark")).toBeNull();
  });

  it("wraps case-insensitive match in mark, preserving full text", () => {
    const { container } = render(<>{highlightText("Hello World", "world")}</>);
    expect(container.querySelector("mark")?.textContent).toBe("World");
    expect(container.textContent).toBe("Hello World");
  });

  it("highlights every occurrence", () => {
    const { container } = render(<>{highlightText("aXaXa", "x")}</>);
    expect(container.querySelectorAll("mark")).toHaveLength(2);
  });
});
