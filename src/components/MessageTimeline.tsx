// src/components/MessageTimeline.tsx
import { memo, useMemo, useState } from "react";
import { Block, NormEvent } from "../types/conversation";
import { buildMessageTree, TreeNode } from "../lib/buildMessageTree";
import { formatTimestamp } from "../lib/formatTimestamp";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { JsonTree } from "./JsonTree";
import { JsonViewer } from "./JsonViewer";

/**
 * 惰性 details：折叠态**不挂载** body。
 * 大 codex tool_result（巨大命令输出）若常驻 DOM 会拖垮渲染，故仅展开时渲染。
 * 初始 open 由 `open` 决定；"展开/折叠全部" 会通过 key 重挂使其重新取值。
 */
function LazyDetails({
  summary,
  open,
  className,
  children,
}: {
  summary: React.ReactNode;
  open: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(open);
  return (
    <details
      open={isOpen}
      onToggle={(e) => setIsOpen((e.currentTarget as HTMLDetailsElement).open)}
      className={className}
    >
      <summary className="cursor-pointer select-none">{summary}</summary>
      {isOpen && <div className="mt-1">{children}</div>}
    </details>
  );
}

function BlockView({ block, open }: { block: Block; open: boolean }) {
  switch (block.kind) {
    case "text":
      return <p className="whitespace-pre-wrap text-sm">{block.text}</p>;
    case "thinking":
      return (
        <LazyDetails open={open} summary="💭 thinking" className="text-sm text-muted-foreground">
          <p className="whitespace-pre-wrap">{block.text}</p>
        </LazyDetails>
      );
    case "redacted_thinking":
      return (
        <p className="text-sm text-muted-foreground">🔒 已加密思考（不可见）</p>
      );
    case "tool_use":
      return (
        <LazyDetails
          open={open}
          className="text-sm"
          summary={
            <>
              🔧 tool_use: <span className="font-mono">{block.name}</span>
            </>
          }
        >
          <div className="rounded bg-muted p-2">
            <JsonTree data={block.input} />
          </div>
        </LazyDetails>
      );
    case "tool_result":
      return (
        <LazyDetails open={open} summary="📤 tool_result" className="text-sm">
          <div className="rounded bg-muted p-2">
            {typeof block.content === "string" ? (
              <pre className="whitespace-pre-wrap break-all text-xs">{block.content}</pre>
            ) : (
              <JsonTree data={block.content} />
            )}
          </div>
        </LazyDetails>
      );
    case "image":
      return <p className="text-sm text-muted-foreground">🖼️ image</p>;
  }
}

function RawPanel({ raw }: { raw: string }) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return (
      <pre className="overflow-auto rounded bg-muted p-2 text-xs whitespace-pre-wrap break-all">
        {raw}
      </pre>
    );
  }
  return <JsonViewer data={parsed} />;
}

function jumpTo(uuid: string) {
  const el = document.getElementById(`msg-${uuid}`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("ring-2", "ring-primary");
  window.setTimeout(() => el.classList.remove("ring-2", "ring-primary"), 1200);
}

const EventCard = memo(function EventCard({ event, open }: { event: NormEvent; open: boolean }) {
  const [raw, setRaw] = useState(false);
  return (
    <div
      id={`msg-${event.uuid}`}
      className="rounded-xl border border-border/60 bg-card p-4 space-y-2.5"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant={event.role === "assistant" ? "default" : "secondary"}>
            {event.role}
          </Badge>
          {event.isSidechain && (
            <Badge variant="outline">🤖 subagent</Badge>
          )}
          {event.model && <span className="text-xs text-muted-foreground">{event.model}</span>}
          <span className="text-xs text-muted-foreground">
            {formatTimestamp(event.timestamp)}
          </span>
        </div>
        <Button size="sm" variant="ghost" onClick={() => setRaw((v) => !v)}>
          {raw ? "Pretty" : "Raw"}
        </Button>
      </div>
      <div className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
        <span title={event.uuid}>id {event.uuid.slice(0, 8)}</span>
        {event.parentUuid && (
          <button
            type="button"
            title={`跳转到父消息 ${event.parentUuid}`}
            onClick={() => jumpTo(event.parentUuid!)}
            className="cursor-pointer underline-offset-2 hover:text-foreground hover:underline"
          >
            ↳ parent {event.parentUuid.slice(0, 8)}
          </button>
        )}
      </div>
      {raw ? (
        <RawPanel raw={event.raw} />
      ) : (
        <div className="space-y-2">
          {event.blocks.map((b, i) => (
            <BlockView key={i} block={b} open={open} />
          ))}
        </div>
      )}
    </div>
  );
});

function countSubtree(n: TreeNode): number {
  return 1 + n.children.reduce((s, c) => s + countSubtree(c), 0);
}

/** 渲染一组同级子节点：>1 个时视为分支，加左边框缩进；否则保持线性平铺。 */
function ChildrenView({ nodes, open }: { nodes: TreeNode[]; open: boolean }) {
  if (nodes.length === 0) return null;
  const branched = nodes.length > 1;
  return (
    <div className={branched ? "space-y-3 border-l-2 border-muted pl-3" : "space-y-3"}>
      {nodes.map((n) => (
        <NodeView key={n.event.uuid} node={n} open={open} />
      ))}
    </div>
  );
}

function NodeView({ node, open }: { node: TreeNode; open: boolean }) {
  // sidechain 子树整体折叠
  if (node.sidechainRoot) {
    return (
      <details open={open} className="rounded-lg border border-dashed">
        <summary className="cursor-pointer select-none px-3 py-2 text-sm text-muted-foreground">
          🤖 subagent 旁支（{countSubtree(node)} 条）
        </summary>
        <div className="space-y-3 p-3 pt-0">
          <EventCard event={node.event} open={open} />
          <ChildrenView nodes={node.children} open={open} />
        </div>
      </details>
    );
  }
  return (
    <div className="space-y-3">
      <EventCard event={node.event} open={open} />
      <ChildrenView nodes={node.children} open={open} />
    </div>
  );
}

export function MessageTimeline({
  events,
  open = false,
}: {
  events: NormEvent[];
  open?: boolean;
}) {
  const tree = useMemo(() => buildMessageTree(events), [events]);
  if (events.length === 0) {
    return <div className="p-6 text-center text-muted-foreground">无消息</div>;
  }
  return (
    <div className="space-y-3">
      {tree.map((n) => (
        <NodeView key={n.event.uuid} node={n} open={open} />
      ))}
    </div>
  );
}
