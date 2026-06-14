// src/components/MessageTimeline.tsx
import { useState } from "react";
import { Block, NormEvent } from "../types/conversation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case "text":
      return <p className="whitespace-pre-wrap text-sm">{block.text}</p>;
    case "thinking":
      return (
        <details className="text-sm text-muted-foreground">
          <summary className="cursor-pointer select-none">💭 thinking</summary>
          <p className="whitespace-pre-wrap mt-1">{block.text}</p>
        </details>
      );
    case "tool_use":
      return (
        <details className="text-sm">
          <summary className="cursor-pointer select-none">
            🔧 tool_use: <span className="font-mono">{block.name}</span>
          </summary>
          <pre className="mt-1 overflow-auto rounded bg-muted p-2 text-xs">
            {JSON.stringify(block.input, null, 2)}
          </pre>
        </details>
      );
    case "tool_result":
      return (
        <details className="text-sm">
          <summary className="cursor-pointer select-none">📤 tool_result</summary>
          <pre className="mt-1 overflow-auto rounded bg-muted p-2 text-xs">
            {typeof block.content === "string"
              ? block.content
              : JSON.stringify(block.content, null, 2)}
          </pre>
        </details>
      );
    case "image":
      return <p className="text-sm text-muted-foreground">🖼️ image</p>;
  }
}

function EventCard({ event }: { event: NormEvent }) {
  const [raw, setRaw] = useState(false);
  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant={event.role === "assistant" ? "default" : "secondary"}>
            {event.role}
          </Badge>
          {event.model && <span className="text-xs text-muted-foreground">{event.model}</span>}
          <span className="text-xs text-muted-foreground">{event.timestamp}</span>
        </div>
        <Button size="sm" variant="ghost" onClick={() => setRaw((v) => !v)}>
          {raw ? "Pretty" : "Raw"}
        </Button>
      </div>
      {raw ? (
        <pre className="overflow-auto rounded bg-muted p-2 text-xs">{event.raw}</pre>
      ) : (
        <div className="space-y-2">
          {event.blocks.map((b, i) => (
            <BlockView key={i} block={b} />
          ))}
        </div>
      )}
    </div>
  );
}

export function MessageTimeline({ events }: { events: NormEvent[] }) {
  if (events.length === 0) {
    return <div className="p-6 text-center text-muted-foreground">无消息</div>;
  }
  return (
    <div className="space-y-3">
      {events.map((e, i) => (
        <EventCard key={e.uuid || i} event={e} />
      ))}
    </div>
  );
}
