import { describe, it, expect } from "vitest";
import { groupSessionsByProject } from "../lib/groupSessionsByProject";
import { SessionSummary } from "../types/conversation";

const s = (id: string, projectPath: string): SessionSummary => ({
  id, source: "claude-code", projectPath, title: id,
  messageCount: 1, startedAt: "", lastActivityAt: "",
  totalInputTokens: 0, totalOutputTokens: 0, models: [],
});

describe("groupSessionsByProject", () => {
  it("groups by projectPath preserving order", () => {
    const g = groupSessionsByProject([s("a", "/p1"), s("b", "/p2"), s("c", "/p1")]);
    expect(g.map((x) => x.projectPath)).toEqual(["/p1", "/p2"]);
    expect(g[0].sessions.map((x) => x.id)).toEqual(["a", "c"]);
    expect(g[1].sessions.map((x) => x.id)).toEqual(["b"]);
  });

  it("uses placeholder for empty projectPath", () => {
    const g = groupSessionsByProject([s("a", "")]);
    expect(g[0].projectPath).toBe("(未知项目)");
  });
});
