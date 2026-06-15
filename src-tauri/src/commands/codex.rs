use super::conversations::{Block, NormEvent, SessionDetail, SessionSummary, TranscriptSource, Usage};
use serde_json::Value;
use std::path::Path;

fn synth_uuid(seq: usize) -> String {
    format!("codex-{}", seq)
}

/// content[] 中的 input_text/output_text → 合并为 Text block（每项一块）。
fn content_text_blocks(payload: &Value) -> Vec<Block> {
    let mut out = Vec::new();
    if let Some(arr) = payload.get("content").and_then(|c| c.as_array()) {
        for item in arr {
            let t = item.get("type").and_then(|v| v.as_str()).unwrap_or("");
            if t == "input_text" || t == "output_text" || t == "text" {
                let text = item.get("text").and_then(|v| v.as_str()).unwrap_or("").to_string();
                out.push(Block::Text { text });
            }
        }
    }
    out
}

/// 解析单行 Codex rollout JSONL。仅 response_item 的 message/reasoning/function_call/
/// function_call_output 返回 Some；session_meta/event_msg/turn_context 等返回 None。
/// Codex 无 uuid，故由调用方传入顺序 seq 与父链 parent 以合成树结构。
pub fn parse_codex_line(line: &str, seq: usize, parent: Option<String>) -> Option<NormEvent> {
    let v: Value = serde_json::from_str(line).ok()?;
    if v.get("type")?.as_str()? != "response_item" {
        return None;
    }
    let p = v.get("payload")?;
    let timestamp = v.get("timestamp").and_then(|x| x.as_str()).unwrap_or("").to_string();

    let (role, blocks): (String, Vec<Block>) = match p.get("type")?.as_str()? {
        "message" => {
            let raw_role = p.get("role").and_then(|r| r.as_str()).unwrap_or("user");
            let role = match raw_role {
                "developer" | "system" => "system",
                "assistant" => "assistant",
                _ => "user",
            };
            (role.to_string(), content_text_blocks(p))
        }
        "reasoning" => {
            let summary_texts: Vec<String> = p
                .get("summary")
                .and_then(|s| s.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|x| x.get("text").and_then(|t| t.as_str()).map(|s| s.to_string()))
                        .collect()
                })
                .unwrap_or_default();
            let block = if summary_texts.is_empty() {
                Block::RedactedThinking // 仅 encrypted_content，无明文
            } else {
                Block::Thinking { text: summary_texts.join("\n") }
            };
            ("assistant".to_string(), vec![block])
        }
        "function_call" => {
            let id = p.get("call_id").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let name = p.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
            // arguments 是 JSON 字符串，解析为对象供前端展示
            let input = p
                .get("arguments")
                .and_then(|v| v.as_str())
                .and_then(|s| serde_json::from_str::<Value>(s).ok())
                .unwrap_or(Value::Null);
            ("assistant".to_string(), vec![Block::ToolUse { id, name, input }])
        }
        "function_call_output" => {
            let tool_use_id = p.get("call_id").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let content = p.get("output").cloned().unwrap_or(Value::Null);
            ("user".to_string(), vec![Block::ToolResult { tool_use_id, content }])
        }
        _ => return None,
    };

    Some(NormEvent {
        uuid: synth_uuid(seq),
        parent_uuid: parent,
        is_sidechain: false,
        role,
        timestamp,
        blocks,
        model: None,
        usage: None,
        raw: line.to_string(),
    })
}

/// 扫描所有 token_count 事件，返回末条 total_token_usage 作为会话总计。
pub fn extract_total_usage(lines: &[&str]) -> Usage {
    let mut last = Usage::default();
    for line in lines {
        let v: Value = match serde_json::from_str(line) {
            Ok(v) => v,
            Err(_) => continue,
        };
        let p = match v.get("payload") {
            Some(p) => p,
            None => continue,
        };
        if p.get("type").and_then(|t| t.as_str()) != Some("token_count") {
            continue;
        }
        if let Some(info) = p.get("info").and_then(|i| i.get("total_token_usage")) {
            let g = |k: &str| info.get(k).and_then(|x| x.as_u64()).unwrap_or(0);
            last = Usage {
                input_tokens: g("input_tokens"),
                output_tokens: g("output_tokens"),
                cache_creation_tokens: 0,
                cache_read_tokens: g("cached_input_tokens"),
            };
        }
    }
    last
}

/// session_meta 首行取 id / cwd / model。
fn read_meta(lines: &[&str]) -> (String, String, Option<String>) {
    for line in lines {
        if let Ok(v) = serde_json::from_str::<Value>(line) {
            if v.get("type").and_then(|t| t.as_str()) == Some("session_meta") {
                let p = v.get("payload");
                let id = p
                    .and_then(|p| p.get("id"))
                    .and_then(|x| x.as_str())
                    .unwrap_or("unknown")
                    .to_string();
                let cwd = p
                    .and_then(|p| p.get("cwd"))
                    .and_then(|x| x.as_str())
                    .unwrap_or("")
                    .to_string();
                let model = p
                    .and_then(|p| p.get("model"))
                    .and_then(|x| x.as_str())
                    .map(|s| s.to_string());
                return (id, cwd, model);
            }
        }
    }
    ("unknown".to_string(), String::new(), None)
}

/// 首条真实 user 文本作为标题：跳过 '<' 开头的包装内容；截断 80 字符。
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

fn parse_events(lines: &[&str]) -> Vec<NormEvent> {
    let mut events = Vec::new();
    let mut seq = 0usize;
    let mut parent: Option<String> = None;
    for line in lines {
        if let Some(ev) = parse_codex_line(line, seq, parent.clone()) {
            parent = Some(ev.uuid.clone());
            events.push(ev);
            seq += 1;
        }
    }
    events
}

pub fn read_codex_file(path: &Path) -> Result<SessionDetail, String> {
    let content = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let lines: Vec<&str> = content.lines().collect();
    let (id, cwd, model) = read_meta(&lines);
    let events = parse_events(&lines);
    let usage = extract_total_usage(&lines);

    let started_at = events.first().map(|e| e.timestamp.clone()).unwrap_or_default();
    let last_activity_at = events.last().map(|e| e.timestamp.clone()).unwrap_or_default();
    let models = model.map(|m| vec![m]).unwrap_or_default();

    let summary = SessionSummary {
        id: format!("codex:{}", id),
        source: "codex".to_string(),
        project_path: cwd,
        title: derive_title(&events),
        message_count: events.len(),
        started_at,
        last_activity_at,
        total_input_tokens: usage.input_tokens,
        total_output_tokens: usage.output_tokens,
        models,
    };
    Ok(SessionDetail { summary, events })
}

/// 轻量摘要：解析 meta + 事件取 title / startedAt，token 留 0。
pub fn summarize_codex_file(path: &Path) -> Result<SessionSummary, String> {
    let content = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let lines: Vec<&str> = content.lines().collect();
    let (id, cwd, _model) = read_meta(&lines);
    let events = parse_events(&lines);
    let started_at = events.first().map(|e| e.timestamp.clone()).unwrap_or_default();
    let last_activity_at = events.last().map(|e| e.timestamp.clone()).unwrap_or_default();
    Ok(SessionSummary {
        id: format!("codex:{}", id),
        source: "codex".to_string(),
        project_path: cwd,
        title: derive_title(&events),
        message_count: events.len(),
        started_at,
        last_activity_at,
        total_input_tokens: 0,
        total_output_tokens: 0,
        models: Vec::new(),
    })
}

pub struct CodexSource;

impl CodexSource {
    fn root() -> Option<std::path::PathBuf> {
        dirs::home_dir().map(|h| h.join(".codex").join("sessions"))
    }

    /// 递归收集 sessions/**/rollout-*.jsonl。
    fn collect_files(dir: &Path, out: &mut Vec<std::path::PathBuf>) {
        let entries = match std::fs::read_dir(dir) {
            Ok(e) => e,
            Err(_) => return,
        };
        for e in entries.flatten() {
            let p = e.path();
            if p.is_dir() {
                Self::collect_files(&p, out);
            } else if p.extension().and_then(|x| x.to_str()) == Some("jsonl") {
                if let Some(name) = p.file_name().and_then(|n| n.to_str()) {
                    if name.starts_with("rollout-") {
                        out.push(p);
                    }
                }
            }
        }
    }
}

impl TranscriptSource for CodexSource {
    fn list_sessions(&self) -> Result<Vec<SessionSummary>, String> {
        let root = match Self::root() {
            Some(r) if r.is_dir() => r,
            _ => return Ok(Vec::new()),
        };
        let mut files = Vec::new();
        Self::collect_files(&root, &mut files);
        let mut out = Vec::new();
        for f in &files {
            if let Ok(s) = summarize_codex_file(f) {
                out.push(s);
            }
        }
        out.sort_by(|a, b| b.last_activity_at.cmp(&a.last_activity_at));
        Ok(out)
    }

    fn read_session(&self, id: &str) -> Result<SessionDetail, String> {
        let session_id = id.strip_prefix("codex:").unwrap_or(id);
        let root = Self::root().ok_or_else(|| "no home dir".to_string())?;
        if !root.is_dir() {
            return Err(format!("session not found: {}", id));
        }
        let mut files = Vec::new();
        Self::collect_files(&root, &mut files);
        // 文件名形如 rollout-<ts>-<uuid>.jsonl，按 uuid 后缀匹配
        for f in &files {
            if let Some(name) = f.file_stem().and_then(|n| n.to_str()) {
                if name.ends_with(session_id) {
                    return read_codex_file(f);
                }
            }
        }
        Err(format!("session not found: {}", id))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const META: &str = r#"{"timestamp":"2026-06-10T02:47:50.000Z","type":"session_meta","payload":{"id":"019daa7f-uuid","cwd":"/Users/me/proj","cli_version":"0.121.0","model_provider":"openai"}}"#;
    const USER_MSG: &str = r#"{"timestamp":"2026-06-10T02:47:55.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"do the thing"}]}}"#;
    const ENV_MSG: &str = r#"{"timestamp":"2026-06-10T02:47:54.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"<environment_context>\n  <cwd>/x</cwd>\n</environment_context>"}]}}"#;
    const ASSISTANT_MSG: &str = r#"{"timestamp":"2026-06-10T02:47:59.000Z","type":"response_item","payload":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"sure"}],"phase":"commentary"}}"#;
    const REASONING_ENC: &str = r#"{"timestamp":"2026-06-10T02:47:55.097Z","type":"response_item","payload":{"type":"reasoning","summary":[],"encrypted_content":"gAAAA"}}"#;
    const REASONING_TXT: &str = r#"{"timestamp":"2026-06-10T02:47:55.097Z","type":"response_item","payload":{"type":"reasoning","summary":[{"type":"summary_text","text":"plan it"}]}}"#;
    const FN_CALL: &str = r#"{"timestamp":"2026-06-10T02:47:59.935Z","type":"response_item","payload":{"type":"function_call","name":"exec_command","arguments":"{\"cmd\":\"pwd\"}","call_id":"call_abc"}}"#;
    const FN_OUTPUT: &str = r#"{"timestamp":"2026-06-10T02:48:00.008Z","type":"response_item","payload":{"type":"function_call_output","call_id":"call_abc","output":"/Users/me/proj\n"}}"#;
    const TOKEN_COUNT: &str = r#"{"timestamp":"2026-06-10T02:48:00.000Z","type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":22489,"cached_input_tokens":2432,"output_tokens":283,"reasoning_output_tokens":56,"total_tokens":22772}}}}"#;

    #[test]
    fn meta_and_token_events_are_skipped_as_events() {
        assert!(parse_codex_line(META, 0, None).is_none());
        assert!(parse_codex_line(TOKEN_COUNT, 0, None).is_none());
        assert!(parse_codex_line("broken", 0, None).is_none());
    }

    #[test]
    fn user_message_becomes_text_event_with_synthetic_chain() {
        let ev = parse_codex_line(USER_MSG, 2, Some("codex-1".into())).expect("event");
        assert_eq!(ev.role, "user");
        assert_eq!(ev.uuid, "codex-2");
        assert_eq!(ev.parent_uuid.as_deref(), Some("codex-1"));
        assert_eq!(ev.timestamp, "2026-06-10T02:47:55.000Z");
        assert_eq!(ev.blocks, vec![Block::Text { text: "do the thing".into() }]);
    }

    #[test]
    fn assistant_output_text_becomes_assistant_event() {
        let ev = parse_codex_line(ASSISTANT_MSG, 0, None).expect("event");
        assert_eq!(ev.role, "assistant");
        assert_eq!(ev.parent_uuid, None);
        assert_eq!(ev.blocks, vec![Block::Text { text: "sure".into() }]);
    }

    #[test]
    fn reasoning_encrypted_becomes_redacted_thinking() {
        let ev = parse_codex_line(REASONING_ENC, 0, None).expect("event");
        assert_eq!(ev.role, "assistant");
        assert_eq!(ev.blocks, vec![Block::RedactedThinking]);
    }

    #[test]
    fn reasoning_summary_becomes_thinking_text() {
        let ev = parse_codex_line(REASONING_TXT, 0, None).expect("event");
        assert_eq!(ev.blocks, vec![Block::Thinking { text: "plan it".into() }]);
    }

    #[test]
    fn function_call_becomes_tool_use() {
        let ev = parse_codex_line(FN_CALL, 0, None).expect("event");
        assert_eq!(ev.role, "assistant");
        match &ev.blocks[0] {
            Block::ToolUse { id, name, input } => {
                assert_eq!(id, "call_abc");
                assert_eq!(name, "exec_command");
                assert_eq!(input.get("cmd").and_then(|v| v.as_str()), Some("pwd"));
            }
            other => panic!("expected ToolUse, got {:?}", other),
        }
    }

    #[test]
    fn function_call_output_becomes_tool_result_user_role() {
        let ev = parse_codex_line(FN_OUTPUT, 0, None).expect("event");
        assert_eq!(ev.role, "user");
        match &ev.blocks[0] {
            Block::ToolResult { tool_use_id, content } => {
                assert_eq!(tool_use_id, "call_abc");
                assert_eq!(content.as_str(), Some("/Users/me/proj\n"));
            }
            other => panic!("expected ToolResult, got {:?}", other),
        }
    }

    #[test]
    fn extract_total_usage_takes_last_token_count() {
        let lines = vec![TOKEN_COUNT];
        let u = extract_total_usage(&lines);
        assert_eq!(u.input_tokens, 22489);
        assert_eq!(u.output_tokens, 283);
        assert_eq!(u.cache_read_tokens, 2432);
    }

    fn write_fixture(name: &str, lines: &[&str]) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join("codex_test");
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.join(name);
        std::fs::write(&p, lines.join("\n")).unwrap();
        p
    }

    #[test]
    fn read_codex_file_normalizes_session() {
        let path = write_fixture(
            "rollout-2026-06-10T02-47-50-019daa7f-uuid.jsonl",
            &[META, ENV_MSG, USER_MSG, REASONING_ENC, ASSISTANT_MSG, FN_CALL, FN_OUTPUT, TOKEN_COUNT],
        );
        let d = read_codex_file(&path).expect("read ok");
        assert_eq!(d.summary.source, "codex");
        assert_eq!(d.summary.id, "codex:019daa7f-uuid");
        assert_eq!(d.summary.project_path, "/Users/me/proj");
        // title skips <environment_context> wrapped first message
        assert_eq!(d.summary.title, "do the thing");
        // 6 response_item events (env, user, reasoning, assistant, fn_call, fn_output); meta+token skipped
        assert_eq!(d.events.len(), 6);
        assert_eq!(d.summary.total_input_tokens, 22489);
        assert_eq!(d.summary.total_output_tokens, 283);
        // linear chain: first parent None, rest point to previous
        assert_eq!(d.events[0].parent_uuid, None);
        assert_eq!(d.events[1].parent_uuid.as_deref(), Some(d.events[0].uuid.as_str()));
    }

    #[test]
    fn summarize_codex_file_is_lightweight() {
        let path = write_fixture(
            "rollout-2026-06-10T02-47-50-abc-sum.jsonl",
            &[META, ENV_MSG, USER_MSG, ASSISTANT_MSG, TOKEN_COUNT],
        );
        let s = summarize_codex_file(&path).expect("summary");
        assert_eq!(s.id, "codex:019daa7f-uuid");
        assert_eq!(s.source, "codex");
        assert_eq!(s.project_path, "/Users/me/proj");
        assert_eq!(s.title, "do the thing");
        assert_eq!(s.total_input_tokens, 0);
    }
}
