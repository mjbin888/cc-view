// src/components/JsonViewer.tsx
import { useState } from "react";
import { JsonTree } from "./JsonTree";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/** 带工具栏的 JSON 查看器：搜索高亮 + 展开/折叠全部 + 一键复制。 */
export function JsonViewer({ data }: { data: unknown }) {
  const [search, setSearch] = useState("");
  const [gen, setGen] = useState(0);
  const [defaultOpen, setDefaultOpen] = useState(true);
  const [copied, setCopied] = useState(false);

  function expandAll() {
    setDefaultOpen(true);
    setGen((g) => g + 1);
  }
  function collapseAll() {
    setDefaultOpen(false);
    setGen((g) => g + 1);
  }
  async function copyAll() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 剪贴板不可用时静默
    }
  }

  // 搜索激活时强制全展开，确保命中可见；切换激活态时重挂一次。
  const searching = search.trim().length > 0;
  const treeOpen = searching ? true : defaultOpen;
  const treeKey = `${gen}-${searching ? "s" : "n"}`;

  return (
    <div className="space-y-2 rounded bg-muted p-2">
      <div className="flex items-center gap-2">
        <Input
          className="h-7 text-xs"
          placeholder="搜索 JSON…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button size="sm" variant="ghost" className="h-7 shrink-0" onClick={expandAll}>
          展开
        </Button>
        <Button size="sm" variant="ghost" className="h-7 shrink-0" onClick={collapseAll}>
          折叠
        </Button>
        <Button size="sm" variant="ghost" className="h-7 shrink-0" onClick={copyAll}>
          {copied ? "已复制" : "复制"}
        </Button>
      </div>
      <JsonTree key={treeKey} data={data} defaultOpen={treeOpen} search={search} />
    </div>
  );
}
