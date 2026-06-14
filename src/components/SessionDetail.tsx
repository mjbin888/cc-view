// src/components/SessionDetail.tsx
import { SessionDetail as SessionDetailData } from "../types/conversation";
import { MessageTimeline } from "./MessageTimeline";
import { TokenStats } from "./TokenStats";

interface Props {
  detail: SessionDetailData | undefined;
  isLoading: boolean;
  hasSelection: boolean;
}

export function SessionDetail({ detail, isLoading, hasSelection }: Props) {
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
        <h2 className="truncate text-lg font-semibold">{detail.summary.title}</h2>
        <p className="truncate text-xs text-muted-foreground">{detail.summary.projectPath}</p>
        <TokenStats events={detail.events} />
      </div>
      <div className="flex-1 overflow-auto p-3">
        <MessageTimeline events={detail.events} />
      </div>
    </div>
  );
}
