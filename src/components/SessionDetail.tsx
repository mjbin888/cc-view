// src/components/SessionDetail.tsx
import { useState } from "react";
import { SessionDetail as SessionDetailData } from "../types/conversation";
import { MessageTimeline } from "./MessageTimeline";
import { TokenStats } from "./TokenStats";
import { Button } from "@/components/ui/button";

interface Props {
  detail: SessionDetailData | undefined;
  isLoading: boolean;
  hasSelection: boolean;
}

export function SessionDetail({ detail, isLoading, hasSelection }: Props) {
  // open + seq：seq 每次点击自增，作为 key 强制重挂，保证“展开/折叠全部”覆盖个别手动状态
  const [{ open, seq }, setExpand] = useState({ open: false, seq: 0 });
  if (!hasSelection) {
    return <div className="p-6 text-center text-muted-foreground">选择左侧会话查看消息</div>;
  }
  if (isLoading && !detail) {
    return <div className="p-6 text-center text-muted-foreground">加载中…</div>;
  }
  if (!detail) {
    return <div className="p-6 text-center text-muted-foreground">无法加载会话</div>;
  }
  return (
    <div className="flex h-full flex-col">
      <div className="border-b p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <h2 className="truncate text-lg font-semibold">{detail.summary.title}</h2>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0"
            onClick={() => setExpand((s) => ({ open: !s.open, seq: s.seq + 1 }))}
          >
            {open ? "折叠全部" : "展开全部"}
          </Button>
        </div>
        <p className="truncate text-xs text-muted-foreground">{detail.summary.projectPath}</p>
        <TokenStats events={detail.events} />
      </div>
      <div className="flex-1 overflow-auto p-3">
        <MessageTimeline key={seq} events={detail.events} open={open} />
      </div>
    </div>
  );
}
