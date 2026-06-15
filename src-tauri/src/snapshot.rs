// 用量 snapshot 共享模块：statusline bin（writer）与 usage 命令（reader）共用
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// snapshot 文件名，落在 ~/.claude/ 下
pub const SNAPSHOT_FILE: &str = "cc-viewer-usage.json";
/// updated_at 超过此秒数视为陈旧（无近期 CC 会话）
pub const FRESHNESS_SECS: i64 = 600;

fn is_false(b: &bool) -> bool {
    !*b
}

#[derive(Serialize, Deserialize, Debug, Clone, Default, PartialEq)]
pub struct RateWindow {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub used_percentage: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub resets_at: Option<String>,
}

/// 文件格式兼容 claude-hud 的 ExternalUsageSnapshot，故此文件也可喂其 externalUsagePath
#[derive(Serialize, Deserialize, Debug, Clone, Default, PartialEq)]
pub struct UsageSnapshot {
    pub updated_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub five_hour: Option<RateWindow>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub seven_day: Option<RateWindow>,
    /// 当前活跃会话上下文已用百分比（来自 stdin context_window.used_percentage）
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub context: Option<f64>,
    /// 读取时计算，false 时不写入文件（保持文件与 claude-hud 格式一致）
    #[serde(default, skip_serializing_if = "is_false")]
    pub stale: bool,
}

pub fn snapshot_path() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".claude").join(SNAPSHOT_FILE))
}

/// 原子写：写临时文件再 rename，避免读到半截 JSON
pub fn write_snapshot(snap: &UsageSnapshot) -> std::io::Result<()> {
    let path = snapshot_path()
        .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::NotFound, "no home dir"))?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let tmp = path.with_extension("json.tmp");
    let json = serde_json::to_string_pretty(snap)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
    std::fs::write(&tmp, json)?;
    std::fs::rename(&tmp, &path)?;
    Ok(())
}

/// 解析 + 计算 stale。now_unix 为当前 unix 秒，参数化便于测试。
pub fn parse_snapshot(raw: &str, now_unix: i64) -> Option<UsageSnapshot> {
    let mut snap: UsageSnapshot = serde_json::from_str(raw).ok()?;
    snap.stale = is_stale(&snap.updated_at, now_unix);
    Some(snap)
}

fn is_stale(updated_at: &str, now_unix: i64) -> bool {
    match chrono::DateTime::parse_from_rfc3339(updated_at) {
        Ok(dt) => now_unix - dt.timestamp() > FRESHNESS_SECS,
        Err(_) => true,
    }
}

pub fn read_snapshot(now_unix: i64) -> Option<UsageSnapshot> {
    let raw = std::fs::read_to_string(snapshot_path()?).ok()?;
    parse_snapshot(&raw, now_unix)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ts(s: &str) -> i64 {
        chrono::DateTime::parse_from_rfc3339(s).unwrap().timestamp()
    }

    #[test]
    fn fresh_not_stale() {
        let raw = r#"{"updated_at":"2026-06-15T14:00:00Z","five_hour":{"used_percentage":70,"resets_at":"2026-06-15T14:44:00Z"}}"#;
        let s = parse_snapshot(raw, ts("2026-06-15T14:01:00Z")).unwrap();
        assert!(!s.stale);
        assert_eq!(s.five_hour.unwrap().used_percentage, Some(70.0));
    }

    #[test]
    fn old_is_stale() {
        let raw = r#"{"updated_at":"2026-06-15T10:00:00Z"}"#;
        assert!(parse_snapshot(raw, ts("2026-06-15T14:00:00Z")).unwrap().stale);
    }

    #[test]
    fn bad_timestamp_is_stale() {
        let raw = r#"{"updated_at":"not-a-date"}"#;
        assert!(parse_snapshot(raw, 0).unwrap().stale);
    }

    #[test]
    fn garbage_returns_none() {
        assert!(parse_snapshot("{not json", 0).is_none());
    }

    #[test]
    fn write_skips_stale_field_when_false() {
        let snap = UsageSnapshot {
            updated_at: "2026-06-15T14:00:00Z".into(),
            five_hour: Some(RateWindow {
                used_percentage: Some(70.0),
                resets_at: Some("2026-06-15T14:44:00Z".into()),
            }),
            seven_day: None,
            context: None,
            stale: false,
        };
        let json = serde_json::to_string(&snap).unwrap();
        assert!(!json.contains("stale"));
        assert!(!json.contains("seven_day"));
    }
}
