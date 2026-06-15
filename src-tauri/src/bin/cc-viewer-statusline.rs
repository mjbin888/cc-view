// CC Viewer 自带 statusline：替代 claude-hud。读 Claude Code 喂来的 stdin JSON，
// 1) 把 rate_limits 原子写到 ~/.claude/cc-viewer-usage.json 供 CC Viewer 读取；
// 2) 在终端渲染 Context/Usage/Weekly 三段 bar（复刻 claude-hud 视觉）。
// 任何解析/写盘/git 失败都降级，绝不 panic，保证终端 statusLine 永不崩。
use serde_json::Value;
use std::io::Read;
use tauri_app_lib::snapshot::{write_snapshot, RateWindow, UsageSnapshot};

const BAR_W: usize = 10;
// ANSI
const DIM: &str = "\x1b[2m";
const RESET: &str = "\x1b[0m";
const GREEN: &str = "\x1b[32m";
const YELLOW: &str = "\x1b[33m";
const RED: &str = "\x1b[31m";
const BRIGHT_BLUE: &str = "\x1b[94m";
const BRIGHT_MAGENTA: &str = "\x1b[95m";

// 按阈值取色，复刻 claude-hud colors.js
fn context_color(p: f64) -> &'static str {
    if p >= 85.0 {
        RED
    } else if p >= 70.0 {
        YELLOW
    } else {
        GREEN
    }
}
fn quota_color(p: f64) -> &'static str {
    if p >= 90.0 {
        RED
    } else if p >= 75.0 {
        BRIGHT_MAGENTA
    } else {
        BRIGHT_BLUE
    }
}

fn main() {
    let mut input = String::new();
    let _ = std::io::stdin().read_to_string(&mut input);
    let v: Value = serde_json::from_str(&input).unwrap_or(Value::Null);

    // 1) 写 snapshot（失败不影响终端渲染）
    let _ = write_snapshot(&build_snapshot(&v));

    // 2) 渲染终端 HUD
    println!("{}", render(&v));
}

fn build_snapshot(v: &Value) -> UsageSnapshot {
    let rl = v.get("rate_limits");
    UsageSnapshot {
        updated_at: chrono::Utc::now().to_rfc3339(),
        five_hour: rl.and_then(|r| r.get("five_hour")).map(rate_window),
        seven_day: rl.and_then(|r| r.get("seven_day")).map(rate_window),
        context: context_percent(v),
        stale: false,
    }
}

fn rate_window(v: &Value) -> RateWindow {
    RateWindow {
        used_percentage: v.get("used_percentage").and_then(Value::as_f64),
        // resets_at 在 CC stdin 是 unix 秒(number)，snapshot 存 RFC3339 字符串（兼容
        // claude-hud externalUsagePath 与前端 new Date()）。也兼容已是字符串的情况。
        resets_at: reset_unix(v.get("resets_at")).and_then(|s| {
            chrono::DateTime::from_timestamp(s, 0).map(|dt| dt.to_rfc3339())
        }),
    }
}

/// resets_at → unix 秒。接受 number（秒）或 RFC3339 字符串。
fn reset_unix(v: Option<&Value>) -> Option<i64> {
    let v = v?;
    if let Some(n) = v.as_f64() {
        if n > 0.0 {
            return Some(n as i64);
        }
        return None;
    }
    let s = v.as_str()?;
    chrono::DateTime::parse_from_rfc3339(s)
        .ok()
        .map(|dt| dt.timestamp())
}

/// 上下文已用百分比：优先 native used_percentage(>0)，否则按 token/窗口大小回退
/// （复刻 claude-hud getContextPercent：fresh 会话 used_percentage=0 时用 current_usage 估算）。
fn context_percent(v: &Value) -> Option<f64> {
    let cw = v.get("context_window")?;
    if let Some(p) = cw.get("used_percentage").and_then(Value::as_f64) {
        if p > 0.0 {
            return Some(p.clamp(0.0, 100.0));
        }
    }
    let size = cw.get("context_window_size").and_then(Value::as_f64)?;
    if size <= 0.0 {
        return None;
    }
    let u = cw.get("current_usage");
    let tok = |k: &str| u.and_then(|u| u.get(k)).and_then(Value::as_f64).unwrap_or(0.0);
    let total = tok("input_tokens") + tok("cache_creation_input_tokens") + tok("cache_read_input_tokens");
    if total <= 0.0 {
        return Some(0.0);
    }
    Some(((total / size) * 100.0).clamp(0.0, 100.0))
}

fn render(v: &Value) -> String {
    let model = v
        .pointer("/model/display_name")
        .and_then(Value::as_str)
        .unwrap_or("?");
    let cwd = v.get("cwd").and_then(Value::as_str).unwrap_or("");
    let dir = std::path::Path::new(cwd)
        .file_name()
        .and_then(|x| x.to_str())
        .unwrap_or(cwd);

    let dir_seg = if dir.is_empty() {
        String::new()
    } else {
        format!(" | {}", dir)
    };
    let line1 = format!("[{}]{}{}", model, dir_seg, git_segment(cwd));

    let ctx = context_percent(v);
    let five = v.pointer("/rate_limits/five_hour/used_percentage").and_then(Value::as_f64);
    let five_reset = reset_unix(v.pointer("/rate_limits/five_hour/resets_at"));
    let week = v.pointer("/rate_limits/seven_day/used_percentage").and_then(Value::as_f64);
    let week_reset = reset_unix(v.pointer("/rate_limits/seven_day/resets_at"));

    let line2 = [
        seg("Context", ctx, None, ctx.map(context_color).unwrap_or(GREEN)),
        seg("Usage", five, five_reset, five.map(quota_color).unwrap_or(BRIGHT_BLUE)),
        seg("Weekly", week, week_reset, week.map(quota_color).unwrap_or(BRIGHT_BLUE)),
    ]
    .join(&format!(" {}|{} ", DIM, RESET));

    format!("{}\n{}", line1, line2)
}

fn seg(label: &str, pct: Option<f64>, reset: Option<i64>, color: &str) -> String {
    match pct {
        None => format!("{}{}{} —", DIM, label, RESET),
        Some(p) => {
            let mut s = format!(
                "{}{}{} {}{}{} {:.0}%",
                DIM,
                label,
                RESET,
                color,
                bar(p),
                RESET,
                p
            );
            if let Some(d) = reset.and_then(countdown) {
                s.push_str(&format!(" {}(resets in {}){}", DIM, d, RESET));
            }
            s
        }
    }
}

fn bar(pct: f64) -> String {
    let filled = ((pct.clamp(0.0, 100.0) / 100.0) * BAR_W as f64).round() as usize;
    let filled = filled.min(BAR_W);
    format!("{}{}", "█".repeat(filled), "░".repeat(BAR_W - filled))
}

fn countdown(resets_at_unix: i64) -> Option<String> {
    let secs = resets_at_unix - chrono::Utc::now().timestamp();
    if secs <= 0 {
        return None;
    }
    Some(format_dur(secs))
}

fn format_dur(secs: i64) -> String {
    if secs < 60 {
        return format!("{}s", secs);
    }
    let mins = secs / 60;
    if mins < 60 {
        return format!("{}m", mins);
    }
    let hours = mins / 60;
    let rem_m = mins % 60;
    if hours < 24 {
        return if rem_m > 0 {
            format!("{}h {}m", hours, rem_m)
        } else {
            format!("{}h", hours)
        };
    }
    let days = hours / 24;
    let rem_h = hours % 24;
    if rem_h > 0 {
        format!("{}d {}h", days, rem_h)
    } else {
        format!("{}d", days)
    }
}

fn git_segment(cwd: &str) -> String {
    if cwd.is_empty() {
        return String::new();
    }
    let branch = std::process::Command::new("git")
        .args(["-C", cwd, "rev-parse", "--abbrev-ref", "HEAD"])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let branch = match branch {
        Some(b) => b,
        None => return String::new(),
    };
    let dirty = std::process::Command::new("git")
        .args(["-C", cwd, "status", "--porcelain"])
        .output()
        .ok()
        .map(|o| !o.stdout.is_empty())
        .unwrap_or(false);
    format!(" git:({}{})", branch, if dirty { "*" } else { "" })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_snapshot_extracts_rate_limits() {
        // CC stdin: resets_at 是 unix 秒(number)
        let v: Value = serde_json::from_str(
            r#"{"rate_limits":{"five_hour":{"used_percentage":70,"resets_at":1781534640},"seven_day":{"used_percentage":28,"resets_at":1782230400}}}"#,
        )
        .unwrap();
        let s = build_snapshot(&v);
        let f = s.five_hour.unwrap();
        assert_eq!(f.used_percentage, Some(70.0));
        // resets_at 落盘为 RFC3339，可被 chrono 解析回相同 unix 秒
        let back = chrono::DateTime::parse_from_rfc3339(&f.resets_at.unwrap()).unwrap();
        assert_eq!(back.timestamp(), 1781534640);
        assert_eq!(s.seven_day.unwrap().used_percentage, Some(28.0));
    }

    #[test]
    fn reset_unix_accepts_number_and_string() {
        assert_eq!(reset_unix(Some(&serde_json::json!(1781534640))), Some(1781534640));
        assert_eq!(
            reset_unix(Some(&serde_json::json!("2026-06-15T14:44:00Z"))),
            Some(1781534640)
        );
        assert_eq!(reset_unix(Some(&serde_json::json!(0))), None);
        assert_eq!(reset_unix(None), None);
    }

    #[test]
    fn context_percent_falls_back_to_tokens() {
        // used_percentage=0 → 用 current_usage/context_window_size 估算
        let v: Value = serde_json::from_str(
            r#"{"context_window":{"used_percentage":0,"context_window_size":200000,"current_usage":{"input_tokens":10000,"cache_creation_input_tokens":5000,"cache_read_input_tokens":25000}}}"#,
        )
        .unwrap();
        assert_eq!(context_percent(&v), Some(20.0));
    }

    #[test]
    fn build_snapshot_extracts_context() {
        let v: Value = serde_json::from_str(
            r#"{"context_window":{"used_percentage":57}}"#,
        )
        .unwrap();
        assert_eq!(build_snapshot(&v).context, Some(57.0));
    }

    #[test]
    fn build_snapshot_handles_missing() {
        let s = build_snapshot(&Value::Null);
        assert!(s.five_hour.is_none());
        assert!(s.seven_day.is_none());
    }

    #[test]
    fn render_no_panic_on_empty() {
        let out = render(&Value::Null);
        assert!(out.contains("Context"));
        assert!(out.contains("Usage"));
        assert!(out.contains("Weekly"));
    }

    #[test]
    fn render_shows_percentages() {
        let v: Value = serde_json::from_str(
            r#"{"model":{"display_name":"Opus 4.8"},"context_window":{"used_percentage":22},"rate_limits":{"five_hour":{"used_percentage":70},"seven_day":{"used_percentage":28}}}"#,
        )
        .unwrap();
        let out = render(&v);
        assert!(out.contains("22%"));
        assert!(out.contains("70%"));
        assert!(out.contains("28%"));
        assert!(out.contains("Opus 4.8"));
    }

    #[test]
    fn format_dur_works() {
        assert_eq!(format_dur(30), "30s");
        assert_eq!(format_dur(44 * 60), "44m");
        assert_eq!(format_dur(2 * 3600 + 15 * 60), "2h 15m");
        assert_eq!(format_dur(4 * 86400 + 2 * 3600), "4d 2h");
    }

    #[test]
    fn bar_width_scales() {
        assert_eq!(bar(0.0).chars().filter(|c| *c == '█').count(), 0);
        assert_eq!(bar(50.0).chars().filter(|c| *c == '█').count(), 5);
        assert_eq!(bar(100.0).chars().filter(|c| *c == '█').count(), 10);
        assert_eq!(bar(200.0).chars().filter(|c| *c == '█').count(), 10);
    }
}
