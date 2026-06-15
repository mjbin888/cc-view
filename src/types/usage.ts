// 用量 snapshot 类型，对应 Rust UsageSnapshot（~/.claude/cc-viewer-usage.json）
export interface RateWindow {
  used_percentage?: number;
  resets_at?: string;
}

export interface UsageSnapshot {
  updated_at: string;
  five_hour?: RateWindow;
  seven_day?: RateWindow;
  context?: number; // 当前活跃会话上下文已用百分比
  stale?: boolean;
}
