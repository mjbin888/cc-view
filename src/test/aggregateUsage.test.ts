import { describe, it, expect } from "vitest";
import { aggregateUsage } from "../lib/aggregateUsage";
import { NormEvent } from "../types/conversation";

const ev = (model: string | undefined, u?: Partial<NormEvent["usage"]>): NormEvent => ({
  uuid: Math.random().toString(),
  role: "assistant",
  timestamp: "",
  blocks: [],
  model,
  usage: u
    ? { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, ...u }
    : undefined,
  raw: "",
});

describe("aggregateUsage", () => {
  it("returns zeros for empty input", () => {
    const r = aggregateUsage([]);
    expect(r.totalInput).toBe(0);
    expect(r.totalOutput).toBe(0);
    expect(r.byModel).toEqual({});
  });

  it("sums totals and groups by model", () => {
    const r = aggregateUsage([
      ev("claude-sonnet-4-6", { inputTokens: 10, outputTokens: 20, cacheReadTokens: 5 }),
      ev("claude-sonnet-4-6", { inputTokens: 3, outputTokens: 7 }),
      ev("claude-opus-4-8", { inputTokens: 100, outputTokens: 200, cacheCreationTokens: 50 }),
      ev(undefined),
    ]);
    expect(r.totalInput).toBe(113);
    expect(r.totalOutput).toBe(227);
    expect(r.totalCacheRead).toBe(5);
    expect(r.totalCacheCreation).toBe(50);
    expect(r.byModel["claude-sonnet-4-6"]).toEqual({ input: 13, output: 27 });
    expect(r.byModel["claude-opus-4-8"]).toEqual({ input: 100, output: 200 });
  });
});
