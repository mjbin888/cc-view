import { describe, it, expect } from "vitest";
import { filterSessions } from "../lib/filterSessions";
import { SessionSummary } from "../types/conversation";

const s = (id: string, title: string, projectPath: string): SessionSummary => ({
  id, source: "claude-code", projectPath, title,
  messageCount: 1, startedAt: "", lastActivityAt: "",
  totalInputTokens: 0, totalOutputTokens: 0, models: [],
});

const items = [
  s("1", "fix auth bug", "/Users/me/api"),
  s("2", "add port viewer", "/Users/me/tools"),
];

describe("filterSessions", () => {
  it("returns all for empty query", () => {
    expect(filterSessions(items, "  ")).toHaveLength(2);
  });
  it("matches title case-insensitively", () => {
    expect(filterSessions(items, "AUTH").map((x) => x.id)).toEqual(["1"]);
  });
  it("matches project path", () => {
    expect(filterSessions(items, "tools").map((x) => x.id)).toEqual(["2"]);
  });
});
