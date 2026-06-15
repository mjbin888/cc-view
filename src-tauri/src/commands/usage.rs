// 读取用量 snapshot 供前端 HUD 使用
use crate::snapshot::{read_snapshot, UsageSnapshot};

#[tauri::command]
pub fn read_usage_snapshot() -> Option<UsageSnapshot> {
    read_snapshot(chrono::Utc::now().timestamp())
}
