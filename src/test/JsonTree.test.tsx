import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { JsonTree } from "../components/JsonTree";

describe("JsonTree", () => {
  it("renders keys and typed values", () => {
    render(<JsonTree data={{ title: "hi", count: 7 }} />);
    expect(screen.getByText(/title/)).toBeInTheDocument();
    expect(screen.getByText('"hi"')).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("collapses a node hiding its children", () => {
    render(<JsonTree data={{ outer: { inner: 42 } }} />);
    expect(screen.getByText("42")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /outer/ }));
    expect(screen.queryByText("42")).not.toBeInTheDocument();
  });

  it("highlights the search term", () => {
    const { container } = render(<JsonTree data={{ command: "ls -la" }} search="ls" />);
    expect(container.querySelector("mark")?.textContent).toBe("ls");
  });

  it("renders all nodes collapsed when defaultOpen is false", () => {
    render(<JsonTree data={{ outer: { inner: 42 } }} defaultOpen={false} />);
    expect(screen.queryByText("42")).not.toBeInTheDocument();
  });
});
