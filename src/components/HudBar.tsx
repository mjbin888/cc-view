// 顶部常驻 HUD 条，镜像 CLI claude-hud：Context% | Usage 5h% | Weekly%
// 三段均来自 snapshot（当前活跃 CC 会话）。snapshot 陈旧时整条变灰。
import { useUsageSnapshot } from "../hooks/useUsageSnapshot";
import { formatDuration } from "../lib/formatDuration";
import { HudMeter } from "./HudMeter";

function resetSub(resetsAt?: string): string | undefined {
  if (!resetsAt) return undefined;
  const ms = new Date(resetsAt).getTime() - Date.now();
  if (Number.isNaN(ms) || ms <= 0) return undefined;
  return `resets in ${formatDuration(Math.floor(ms / 1000))}`;
}

const Sep = () => <span className="text-muted-foreground/40">|</span>;

export function HudBar() {
  const { data: snapshot } = useUsageSnapshot();

  const stale = snapshot?.stale ?? true;
  const five = snapshot?.five_hour;
  const seven = snapshot?.seven_day;

  return (
    <div className="flex items-center gap-3 border-b bg-muted/30 px-4 py-1.5">
      <HudMeter
        label="Context"
        tone="context"
        dim={stale}
        percent={snapshot?.context ?? null}
      />
      <Sep />
      <HudMeter
        label="Usage"
        tone="usage"
        dim={stale}
        percent={five?.used_percentage ?? null}
        sub={resetSub(five?.resets_at)}
      />
      <Sep />
      <HudMeter
        label="Weekly"
        tone="usage"
        dim={stale}
        percent={seven?.used_percentage ?? null}
        sub={resetSub(seven?.resets_at)}
      />
    </div>
  );
}
