use serde::{Deserialize, Serialize};
use serde_json::Value;

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
}
