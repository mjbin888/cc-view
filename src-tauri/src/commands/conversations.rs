use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::Path;

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(tag = "kind")]
pub enum Block {
    #[serde(rename = "thinking")]
    Thinking { text: String },
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "tool_use")]
    ToolUse { id: String, name: String, input: Value },
    #[serde(rename = "tool_result")]
    ToolResult {
        #[serde(rename = "toolUseId")]
        tool_use_id: String,
        content: Value,
    },
    #[serde(rename = "image")]
    Image { source: Value },
}

#[derive(Serialize, Deserialize, Debug, Clone, Default, PartialEq)]
pub struct Usage {
    #[serde(rename = "inputTokens")]
    pub input_tokens: u64,
    #[serde(rename = "outputTokens")]
    pub output_tokens: u64,
    #[serde(rename = "cacheCreationTokens")]
    pub cache_creation_tokens: u64,
    #[serde(rename = "cacheReadTokens")]
    pub cache_read_tokens: u64,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct NormEvent {
    pub uuid: String,
    pub role: String,
    pub timestamp: String,
    pub blocks: Vec<Block>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<Usage>,
    pub raw: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct SessionSummary {
    pub id: String,
    pub source: String,
    #[serde(rename = "projectPath")]
    pub project_path: String,
    pub title: String,
    #[serde(rename = "messageCount")]
    pub message_count: usize,
    #[serde(rename = "startedAt")]
    pub started_at: String,
    #[serde(rename = "lastActivityAt")]
    pub last_activity_at: String,
    #[serde(rename = "totalInputTokens")]
    pub total_input_tokens: u64,
    #[serde(rename = "totalOutputTokens")]
    pub total_output_tokens: u64,
    pub models: Vec<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct SessionDetail {
    pub summary: SessionSummary,
    pub events: Vec<NormEvent>,
}

fn parse_block(b: &Value) -> Option<Block> {
    match b.get("type")?.as_str()? {
        "thinking" => Some(Block::Thinking {
            text: b.get("thinking").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        }),
        "text" => Some(Block::Text {
            text: b.get("text").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        }),
        "tool_use" => Some(Block::ToolUse {
            id: b.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            name: b.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            input: b.get("input").cloned().unwrap_or(Value::Null),
        }),
        "tool_result" => Some(Block::ToolResult {
            tool_use_id: b.get("tool_use_id").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            content: b.get("content").cloned().unwrap_or(Value::Null),
        }),
        "image" => Some(Block::Image {
            source: b.get("source").cloned().unwrap_or(Value::Null),
        }),
        _ => None,
    }
}

fn parse_usage(v: &Value) -> Option<Usage> {
    let u = v.as_object()?;
    let g = |k: &str| u.get(k).and_then(|x| x.as_u64()).unwrap_or(0);
    Some(Usage {
        input_tokens: g("input_tokens"),
        output_tokens: g("output_tokens"),
        cache_creation_tokens: g("cache_creation_input_tokens"),
        cache_read_tokens: g("cache_read_input_tokens"),
    })
}

/// 解析一行 JSONL。仅 user/assistant/system 事件返回 Some，其余（含损坏行）返回 None。
pub fn parse_event(line: &str) -> Option<NormEvent> {
    let v: Value = serde_json::from_str(line).ok()?;
    let t = v.get("type")?.as_str()?;
    if !matches!(t, "user" | "assistant" | "system") {
        return None;
    }
    let msg = v.get("message");
    let role = msg
        .and_then(|m| m.get("role"))
        .and_then(|r| r.as_str())
        .unwrap_or(t)
        .to_string();

    let blocks = match msg.and_then(|m| m.get("content")) {
        Some(Value::String(s)) => vec![Block::Text { text: s.clone() }],
        Some(Value::Array(arr)) => arr.iter().filter_map(parse_block).collect(),
        _ => Vec::new(),
    };

    let model = msg
        .and_then(|m| m.get("model"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let usage = msg.and_then(|m| m.get("usage")).and_then(parse_usage);

    Some(NormEvent {
        uuid: v.get("uuid").and_then(|x| x.as_str()).unwrap_or("").to_string(),
        role,
        timestamp: v.get("timestamp").and_then(|x| x.as_str()).unwrap_or("").to_string(),
        blocks,
        model,
        usage,
        raw: line.to_string(),
    })
}

/// 取首条"真实" user 文本作为标题：跳过以 '<' 开头的命令包装内容；截断 80 字符。
fn derive_title(events: &[NormEvent]) -> String {
    for ev in events {
        if ev.role != "user" {
            continue;
        }
        for b in &ev.blocks {
            if let Block::Text { text } = b {
                let t = text.trim();
                if !t.is_empty() && !t.starts_with('<') {
                    return t.chars().take(80).collect();
                }
            }
        }
    }
    "(无标题)".to_string()
}

/// 从原始行里取首个出现的 cwd（NormEvent 不含 cwd）。
fn derive_project_path(lines: &[&str]) -> String {
    for line in lines {
        if let Ok(v) = serde_json::from_str::<Value>(line) {
            if let Some(cwd) = v.get("cwd").and_then(|x| x.as_str()) {
                return cwd.to_string();
            }
        }
    }
    String::new()
}

pub fn read_session_file(path: &Path) -> Result<SessionDetail, String> {
    let content = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let lines: Vec<&str> = content.lines().collect();
    let events: Vec<NormEvent> = lines.iter().filter_map(|l| parse_event(l)).collect();

    let session_id = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("unknown")
        .to_string();

    let mut total_input = 0u64;
    let mut total_output = 0u64;
    let mut models: Vec<String> = Vec::new();
    for ev in &events {
        if let Some(u) = &ev.usage {
            total_input += u.input_tokens;
            total_output += u.output_tokens;
        }
        if let Some(m) = &ev.model {
            if !models.contains(m) {
                models.push(m.clone());
            }
        }
    }

    let started_at = events.first().map(|e| e.timestamp.clone()).unwrap_or_default();
    let last_activity_at = events.last().map(|e| e.timestamp.clone()).unwrap_or_default();

    let summary = SessionSummary {
        id: format!("claude-code:{}", session_id),
        source: "claude-code".to_string(),
        project_path: derive_project_path(&lines),
        title: derive_title(&events),
        message_count: events.len(),
        started_at,
        last_activity_at,
        total_input_tokens: total_input,
        total_output_tokens: total_output,
        models,
    };

    Ok(SessionDetail { summary, events })
}

/// 轻量摘要：解析行以取 title / startedAt / projectPath，token 留 0（详见 spec §5）。
pub fn summarize_session_file(path: &Path) -> Result<SessionSummary, String> {
    let content = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let lines: Vec<&str> = content.lines().collect();
    let events: Vec<NormEvent> = lines.iter().filter_map(|l| parse_event(l)).collect();
    let session_id = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("unknown")
        .to_string();
    let started_at = events.first().map(|e| e.timestamp.clone()).unwrap_or_default();
    let last_activity_at = events.last().map(|e| e.timestamp.clone()).unwrap_or_default();
    Ok(SessionSummary {
        id: format!("claude-code:{}", session_id),
        source: "claude-code".to_string(),
        project_path: derive_project_path(&lines),
        title: derive_title(&events),
        message_count: events.len(),
        started_at,
        last_activity_at,
        total_input_tokens: 0,
        total_output_tokens: 0,
        models: Vec::new(),
    })
}

pub trait TranscriptSource {
    fn list_sessions(&self) -> Result<Vec<SessionSummary>, String>;
    fn read_session(&self, id: &str) -> Result<SessionDetail, String>;
}

pub struct ClaudeCodeSource;

impl ClaudeCodeSource {
    fn root() -> Option<std::path::PathBuf> {
        dirs::home_dir().map(|h| h.join(".claude").join("projects"))
    }
}

impl TranscriptSource for ClaudeCodeSource {
    fn list_sessions(&self) -> Result<Vec<SessionSummary>, String> {
        let root = match Self::root() {
            Some(r) if r.is_dir() => r,
            _ => return Ok(Vec::new()), // 目录不存在 → 空列表，非错误
        };
        let mut out = Vec::new();
        for proj in std::fs::read_dir(&root).map_err(|e| e.to_string())?.flatten() {
            let pdir = proj.path();
            if !pdir.is_dir() {
                continue;
            }
            for f in std::fs::read_dir(&pdir).map_err(|e| e.to_string())?.flatten() {
                let fp = f.path();
                if fp.extension().and_then(|e| e.to_str()) == Some("jsonl") {
                    if let Ok(s) = summarize_session_file(&fp) {
                        out.push(s);
                    }
                }
            }
        }
        // 最近活跃在前
        out.sort_by(|a, b| b.last_activity_at.cmp(&a.last_activity_at));
        Ok(out)
    }

    fn read_session(&self, id: &str) -> Result<SessionDetail, String> {
        let session_id = id.strip_prefix("claude-code:").unwrap_or(id);
        let root = Self::root().ok_or_else(|| "no home dir".to_string())?;
        if !root.is_dir() {
            return Err(format!("session not found: {}", id));
        }
        for proj in std::fs::read_dir(&root).map_err(|e| e.to_string())?.flatten() {
            let candidate = proj.path().join(format!("{}.jsonl", session_id));
            if candidate.is_file() {
                return read_session_file(&candidate);
            }
        }
        Err(format!("session not found: {}", id))
    }
}

#[tauri::command]
pub fn list_sessions() -> Result<Vec<SessionSummary>, String> {
    ClaudeCodeSource.list_sessions()
}

#[tauri::command]
pub fn read_session(id: String) -> Result<SessionDetail, String> {
    ClaudeCodeSource.read_session(&id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_assistant_event_with_blocks_and_usage() {
        let line = r#"{"type":"assistant","uuid":"u1","timestamp":"2026-06-14T00:00:00Z","message":{"role":"assistant","model":"claude-sonnet-4-6","content":[{"type":"thinking","thinking":"hmm","signature":"s"},{"type":"text","text":"hi"},{"type":"tool_use","id":"t1","name":"Bash","input":{"command":"ls"}}],"usage":{"input_tokens":3,"output_tokens":124,"cache_creation_input_tokens":8821,"cache_read_input_tokens":11784}}}"#;
        let ev = parse_event(line).expect("should parse");
        assert_eq!(ev.uuid, "u1");
        assert_eq!(ev.role, "assistant");
        assert_eq!(ev.model.as_deref(), Some("claude-sonnet-4-6"));
        assert_eq!(ev.blocks.len(), 3);
        assert_eq!(ev.blocks[0], Block::Thinking { text: "hmm".into() });
        let u = ev.usage.expect("usage");
        assert_eq!(u.input_tokens, 3);
        assert_eq!(u.output_tokens, 124);
        assert_eq!(u.cache_creation_tokens, 8821);
        assert_eq!(u.cache_read_tokens, 11784);
        assert!(!ev.raw.is_empty());
    }

    #[test]
    fn parse_user_string_content_becomes_text_block() {
        let line = r#"{"type":"user","uuid":"u2","timestamp":"2026-06-14T00:00:01Z","message":{"role":"user","content":"hello"}}"#;
        let ev = parse_event(line).expect("should parse");
        assert_eq!(ev.role, "user");
        assert_eq!(ev.blocks, vec![Block::Text { text: "hello".into() }]);
        assert!(ev.usage.is_none());
    }

    #[test]
    fn parse_non_message_returns_none() {
        let line = r#"{"type":"file-history-snapshot","messageId":"m"}"#;
        assert!(parse_event(line).is_none());
        assert!(parse_event("not json").is_none());
    }

    fn write_fixture(dir: &std::path::Path, name: &str, lines: &[&str]) -> std::path::PathBuf {
        let p = dir.join(name);
        std::fs::write(&p, lines.join("\n")).unwrap();
        p
    }

    #[test]
    fn summarize_session_file_is_lightweight() {
        let tmp = std::env::temp_dir().join("conv_test_sum");
        std::fs::create_dir_all(&tmp).unwrap();
        let path = write_fixture(
            &tmp,
            "sess-xyz.jsonl",
            &[
                r#"{"type":"user","uuid":"u1","cwd":"/Users/me/p2","timestamp":"2026-06-14T01:00:00Z","message":{"role":"user","content":"hello there"}}"#,
                r#"{"type":"assistant","uuid":"a1","timestamp":"2026-06-14T01:00:05Z","message":{"role":"assistant","content":[{"type":"text","text":"hi"}]}}"#,
            ],
        );
        let s = summarize_session_file(&path).expect("summary ok");
        assert_eq!(s.id, "claude-code:sess-xyz");
        assert_eq!(s.project_path, "/Users/me/p2");
        assert_eq!(s.title, "hello there");
        assert_eq!(s.started_at, "2026-06-14T01:00:00Z");
        assert_eq!(s.total_input_tokens, 0);
        assert_eq!(s.total_output_tokens, 0);
        assert!(s.models.is_empty());
        std::fs::remove_dir_all(&tmp).ok();
    }

    #[test]
    fn read_session_file_normalizes_and_summarizes() {
        let tmp = std::env::temp_dir().join("conv_test_read");
        std::fs::create_dir_all(&tmp).unwrap();
        let path = write_fixture(
            &tmp,
            "sess-abc.jsonl",
            &[
                r#"{"type":"mode","sessionId":"sess-abc"}"#,
                r#"{"type":"user","uuid":"u1","cwd":"/Users/me/proj","timestamp":"2026-06-14T00:00:00Z","message":{"role":"user","content":"<local-command-caveat>skip me"}}"#,
                r#"{"type":"user","uuid":"u2","cwd":"/Users/me/proj","timestamp":"2026-06-14T00:00:01Z","message":{"role":"user","content":"real first prompt"}}"#,
                "broken json line",
                r#"{"type":"assistant","uuid":"a1","timestamp":"2026-06-14T00:00:02Z","message":{"role":"assistant","model":"claude-sonnet-4-6","content":[{"type":"text","text":"ok"}],"usage":{"input_tokens":10,"output_tokens":20,"cache_creation_input_tokens":0,"cache_read_input_tokens":5}}}"#,
            ],
        );

        let d = read_session_file(&path).expect("read ok");
        assert_eq!(d.events.len(), 3); // 2 user + 1 assistant，跳过 mode 与损坏行
        assert_eq!(d.summary.id, "claude-code:sess-abc");
        assert_eq!(d.summary.source, "claude-code");
        assert_eq!(d.summary.project_path, "/Users/me/proj");
        assert_eq!(d.summary.title, "real first prompt"); // 跳过 <local-command 包装
        assert_eq!(d.summary.message_count, 3);
        assert_eq!(d.summary.started_at, "2026-06-14T00:00:00Z");
        assert_eq!(d.summary.last_activity_at, "2026-06-14T00:00:02Z");
        assert_eq!(d.summary.total_input_tokens, 10);
        assert_eq!(d.summary.total_output_tokens, 20);
        assert_eq!(d.summary.models, vec!["claude-sonnet-4-6".to_string()]);

        std::fs::remove_dir_all(&tmp).ok();
    }
}
