// src/components/JsonTree.tsx
import { useState } from "react";
import { highlightText } from "../lib/highlightText";

interface JsonTreeProps {
  data: unknown;
  /** 节点初始是否展开。配合 key 重挂可实现「展开/折叠全部」。 */
  defaultOpen?: boolean;
  /** 搜索关键词，命中 key/值时高亮。 */
  search?: string;
}

/** 递归 JSON 查看器：可折叠、按类型着色、始终换行(无横向滚动)、搜索高亮。 */
export function JsonTree({ data, defaultOpen = true, search = "" }: JsonTreeProps) {
  return (
    <div className="font-mono text-xs leading-relaxed whitespace-pre-wrap break-all">
      <JsonNode value={data} depth={0} defaultOpen={defaultOpen} search={search} />
    </div>
  );
}

function ValueSpan({ value, search }: { value: unknown; search: string }) {
  if (value === null) return <span className="text-purple-500">null</span>;
  switch (typeof value) {
    case "string":
      return (
        <span className="text-green-600 dark:text-green-400">
          "{highlightText(value, search)}"
        </span>
      );
    case "number":
      return (
        <span className="text-blue-600 dark:text-blue-400">
          {highlightText(String(value), search)}
        </span>
      );
    case "boolean":
      return <span className="text-purple-600 dark:text-purple-400">{String(value)}</span>;
    default:
      return <span>{String(value)}</span>;
  }
}

function JsonNode({
  nodeKey,
  value,
  depth,
  defaultOpen,
  search,
}: {
  nodeKey?: string;
  value: unknown;
  depth: number;
  defaultOpen: boolean;
  search: string;
}) {
  const isObj = value !== null && typeof value === "object";
  const [open, setOpen] = useState(defaultOpen);
  const pad = { paddingLeft: depth * 14 };

  const keyPart =
    nodeKey !== undefined ? (
      <>
        <span className="text-sky-700 dark:text-sky-300">
          {highlightText(nodeKey, search)}
        </span>
        <span className="text-muted-foreground">: </span>
      </>
    ) : null;

  if (!isObj) {
    return (
      <div style={pad} className="py-px">
        {keyPart}
        <ValueSpan value={value} search={search} />
      </div>
    );
  }

  const entries = Array.isArray(value)
    ? (value as unknown[]).map((v, i) => [String(i), v] as const)
    : Object.entries(value as Record<string, unknown>);
  const ob = Array.isArray(value) ? "[" : "{";
  const cb = Array.isArray(value) ? "]" : "}";

  return (
    <div style={pad} className="py-px">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full rounded text-left hover:bg-accent/40"
      >
        <span className="text-muted-foreground">{open ? "▾ " : "▸ "}</span>
        {keyPart}
        <span className="text-muted-foreground">
          {open ? ob : `${ob} ${entries.length} ${cb}`}
        </span>
      </button>
      {open && (
        <>
          {entries.map(([ck, cv]) => (
            <JsonNode
              key={ck}
              nodeKey={ck}
              value={cv}
              depth={depth + 1}
              defaultOpen={defaultOpen}
              search={search}
            />
          ))}
          <div style={pad} className="text-muted-foreground">
            {cb}
          </div>
        </>
      )}
    </div>
  );
}
