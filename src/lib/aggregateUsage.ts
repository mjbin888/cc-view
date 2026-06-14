// src/lib/aggregateUsage.ts
import { NormEvent } from "../types/conversation";

export interface UsageAggregate {
  totalInput: number;
  totalOutput: number;
  totalCacheRead: number;
  totalCacheCreation: number;
  byModel: Record<string, { input: number; output: number }>;
}

export function aggregateUsage(events: NormEvent[]): UsageAggregate {
  const agg: UsageAggregate = {
    totalInput: 0,
    totalOutput: 0,
    totalCacheRead: 0,
    totalCacheCreation: 0,
    byModel: {},
  };
  for (const ev of events) {
    if (!ev.usage) continue;
    agg.totalInput += ev.usage.inputTokens;
    agg.totalOutput += ev.usage.outputTokens;
    agg.totalCacheRead += ev.usage.cacheReadTokens;
    agg.totalCacheCreation += ev.usage.cacheCreationTokens;
    const m = ev.model;
    if (m) {
      const cur = agg.byModel[m] ?? { input: 0, output: 0 };
      cur.input += ev.usage.inputTokens;
      cur.output += ev.usage.outputTokens;
      agg.byModel[m] = cur;
    }
  }
  return agg;
}
