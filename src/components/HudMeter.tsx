interface Props {
  label: string;
  percent: number | null; // null → 显示 —
  sub?: string; // reset 倒计时等副文本
  tone?: "context" | "usage";
  dim?: boolean; // snapshot 陈旧时变灰
}

// 按百分比阈值取色，复刻 claude-hud：
//   context: >=85 红 / >=70 黄 / 否则 绿
//   usage(配额): >=90 红 / >=75 品红 / 否则 蓝
// 返回 bar 填充色 + 百分比文字色，二者同色以增强区分度。
function colorFor(tone: "context" | "usage", pct: number) {
  if (tone === "context") {
    if (pct >= 85) return { bar: "bg-red-500", text: "text-red-600 dark:text-red-400" };
    if (pct >= 70) return { bar: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" };
    return { bar: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" };
  }
  if (pct >= 90) return { bar: "bg-red-500", text: "text-red-600 dark:text-red-400" };
  if (pct >= 75) return { bar: "bg-fuchsia-500", text: "text-fuchsia-600 dark:text-fuchsia-400" };
  return { bar: "bg-blue-500", text: "text-blue-600 dark:text-blue-400" };
}

export function HudMeter({ label, percent, sub, tone = "context", dim }: Props) {
  const pct = percent ?? 0;
  const color = colorFor(tone, pct);
  // 阈值色始终保留：stale 只整段降透明度（dim），不抹掉颜色。
  // 无数据(percent===null)时才用中性灰。
  const barColor = percent === null ? "bg-muted-foreground/40" : color.bar;
  const textColor = percent === null ? "text-muted-foreground" : color.text;

  return (
    <div className={`flex items-center gap-2 ${dim ? "opacity-60" : ""}`}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <div
          data-testid="hud-meter-fill"
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-xs font-semibold tabular-nums ${textColor}`}>
        {percent === null ? "—" : `${Math.round(percent)}%`}
      </span>
      {sub && <span className="text-xs text-muted-foreground">({sub})</span>}
    </div>
  );
}
