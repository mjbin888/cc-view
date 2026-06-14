// src/components/TokenStats.tsx
import { NormEvent } from "../types/conversation";
import { aggregateUsage } from "../lib/aggregateUsage";
import { Badge } from "@/components/ui/badge";

export function TokenStats({ events }: { events: NormEvent[] }) {
  const a = aggregateUsage(events);
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <Badge variant="outline">in {a.totalInput.toLocaleString()}</Badge>
      <Badge variant="outline">out {a.totalOutput.toLocaleString()}</Badge>
      <Badge variant="outline">cache r {a.totalCacheRead.toLocaleString()}</Badge>
      <Badge variant="outline">cache w {a.totalCacheCreation.toLocaleString()}</Badge>
      {Object.entries(a.byModel).map(([m, v]) => (
        <span key={m} className="text-muted-foreground">
          {m}: {v.input.toLocaleString()}/{v.output.toLocaleString()}
        </span>
      ))}
    </div>
  );
}
