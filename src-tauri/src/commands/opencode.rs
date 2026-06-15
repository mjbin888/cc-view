use super::conversations::{Block, NormEvent, SessionDetail, SessionSummary, TranscriptSource};
use rusqlite::Connection;
use serde_json::Value;
use std::path::{Path, PathBuf};

/// epoch 毫秒 → RFC3339 ISO 字符串（前端 formatTimestamp 期望 ISO）。0/负数 → 空串。
pub fn ms_to_iso(ms: i64) -> String {
    if ms <= 0 {
        return String::new();
    }
    chrono::DateTime::from_timestamp_millis(ms)
        .map(|dt| dt.to_rfc3339_opts(chrono::SecondsFormat::Millis, true))
        .unwrap_or_default()
}

/// 解析 part.data JSON → Block 列表。
/// text→Text，reasoning→Thinking，tool→[ToolUse, ToolResult]，
/// step-start/step-finish/file/patch→空（跳过）。
pub fn parse_part(data: &Value) -> Vec<Block> {
    match data.get("type").and_then(|t| t.as_str()).unwrap_or("") {
        "text" => vec![Block::Text {
            text: data.get("text").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        }],
        "reasoning" => vec![Block::Thinking {
            text: data.get("text").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        }],
        "tool" => {
            let id = data.get("callID").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let name = data.get("tool").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let state = data.get("state");
            let input = state
                .and_then(|s| s.get("input"))
                .cloned()
                .unwrap_or(Value::Null);
            let output = state
                .and_then(|s| s.get("output"))
                .cloned()
                .unwrap_or(Value::Null);
            let mut blocks = vec![Block::ToolUse { id: id.clone(), name, input }];
            // 仅在有 output 时附 ToolResult（运行中工具无 output）
            if !output.is_null() {
                blocks.push(Block::ToolResult { tool_use_id: id, content: output });
            }
            blocks
        }
        _ => Vec::new(), // step-start/step-finish/file/patch 等跳过
    }
}

/// 只读打开（immutable）防止 opencode 运行时 WAL 占用导致锁。
fn open_ro(path: &Path) -> Result<Connection, String> {
    let uri = format!("file:{}?mode=ro&immutable=1", path.display());
    Connection::open_with_flags(
        uri,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_URI,
    )
    .map_err(|e| e.to_string())
}

fn build_summary(
    id: &str,
    directory: &str,
    title: &str,
    model_json: &str,
    tokens_in: u64,
    tokens_out: u64,
    created_ms: i64,
    updated_ms: i64,
    message_count: usize,
) -> SessionSummary {
    // model 列是 {"id":"...","providerID":"..."} JSON
    let models = serde_json::from_str::<Value>(model_json)
        .ok()
        .and_then(|v| v.get("id").and_then(|x| x.as_str()).map(|s| s.to_string()))
        .map(|m| vec![m])
        .unwrap_or_default();
    SessionSummary {
        id: format!("opencode:{}", id),
        source: "opencode".to_string(),
        project_path: directory.to_string(),
        title: title.to_string(),
        message_count,
        started_at: ms_to_iso(created_ms),
        last_activity_at: ms_to_iso(updated_ms),
        total_input_tokens: tokens_in,
        total_output_tokens: tokens_out,
        models,
    }
}

pub fn read_opencode_db(path: &Path, session_id: &str) -> Result<SessionDetail, String> {
    let conn = open_ro(path)?;

    // 会话行
    let (directory, title, model_json, tokens_in, tokens_out, created_ms, updated_ms) = conn
        .query_row(
            "SELECT directory, title, model, tokens_input, tokens_output, time_created, time_updated
             FROM session WHERE id = ?1",
            [session_id],
            |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, Option<String>>(2)?.unwrap_or_default(),
                    r.get::<_, i64>(3)? as u64,
                    r.get::<_, i64>(4)? as u64,
                    r.get::<_, i64>(5)?,
                    r.get::<_, i64>(6)?,
                ))
            },
        )
        .map_err(|e| format!("session not found: {} ({})", session_id, e))?;

    // 消息（按时间）
    let mut msg_stmt = conn
        .prepare(
            "SELECT id, data FROM message WHERE session_id = ?1 ORDER BY time_created ASC",
        )
        .map_err(|e| e.to_string())?;
    let msg_rows = msg_stmt
        .query_map([session_id], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?;

    let mut events: Vec<NormEvent> = Vec::new();
    let mut models: Vec<String> = Vec::new();
    let mut parent: Option<String> = None;

    for row in msg_rows {
        let (msg_id, data_str) = row.map_err(|e| e.to_string())?;
        let mdata: Value = serde_json::from_str(&data_str).unwrap_or(Value::Null);
        let role = mdata.get("role").and_then(|v| v.as_str()).unwrap_or("user").to_string();
        let ts_ms = mdata
            .get("time")
            .and_then(|t| t.get("created"))
            .and_then(|v| v.as_i64())
            .unwrap_or(0);
        let model = mdata.get("modelID").and_then(|v| v.as_str()).map(|s| s.to_string());
        if let Some(m) = &model {
            if !models.contains(m) {
                models.push(m.clone());
            }
        }

        // 该消息的 parts（按时间）
        let mut part_stmt = conn
            .prepare(
                "SELECT data FROM part WHERE message_id = ?1 ORDER BY time_created ASC",
            )
            .map_err(|e| e.to_string())?;
        let part_rows = part_stmt
            .query_map([&msg_id], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        let mut blocks: Vec<Block> = Vec::new();
        for pr in part_rows {
            let pdata: Value = serde_json::from_str(&pr.map_err(|e| e.to_string())?)
                .unwrap_or(Value::Null);
            blocks.extend(parse_part(&pdata));
        }

        let uuid = format!("opencode-{}", msg_id);
        events.push(NormEvent {
            uuid: uuid.clone(),
            parent_uuid: parent.clone(),
            is_sidechain: false,
            role,
            timestamp: ms_to_iso(ts_ms),
            blocks,
            model,
            usage: None,
            raw: data_str,
        });
        parent = Some(uuid);
    }

    let mut summary = build_summary(
        session_id, &directory, &title, &model_json, tokens_in, tokens_out, created_ms,
        updated_ms, events.len(),
    );
    // session.model 为空时回退到消息里采集到的 model
    if summary.models.is_empty() {
        summary.models = models;
    } else {
        for m in models {
            if !summary.models.contains(&m) {
                summary.models.push(m);
            }
        }
    }
    Ok(SessionDetail { summary, events })
}

pub struct OpenCodeSource;

impl OpenCodeSource {
    fn db_path() -> Option<PathBuf> {
        dirs::home_dir().map(|h| {
            h.join(".local").join("share").join("opencode").join("opencode.db")
        })
    }
}

impl TranscriptSource for OpenCodeSource {
    fn list_sessions(&self) -> Result<Vec<SessionSummary>, String> {
        let path = match Self::db_path() {
            Some(p) if p.is_file() => p,
            _ => return Ok(Vec::new()),
        };
        let conn = open_ro(&path)?;
        let mut stmt = conn
            .prepare(
                "SELECT s.id, s.directory, s.title, s.model, s.tokens_input, s.tokens_output,
                        s.time_created, s.time_updated,
                        (SELECT COUNT(*) FROM message m WHERE m.session_id = s.id)
                 FROM session s ORDER BY s.time_updated DESC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                Ok(build_summary(
                    &r.get::<_, String>(0)?,
                    &r.get::<_, String>(1)?,
                    &r.get::<_, String>(2)?,
                    &r.get::<_, Option<String>>(3)?.unwrap_or_default(),
                    r.get::<_, i64>(4)? as u64,
                    r.get::<_, i64>(5)? as u64,
                    r.get::<_, i64>(6)?,
                    r.get::<_, i64>(7)?,
                    r.get::<_, i64>(8)? as usize,
                ))
            })
            .map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row.map_err(|e| e.to_string())?);
        }
        Ok(out)
    }

    fn read_session(&self, id: &str) -> Result<SessionDetail, String> {
        let session_id = id.strip_prefix("opencode:").unwrap_or(id);
        let path = Self::db_path().ok_or_else(|| "no home dir".to_string())?;
        if !path.is_file() {
            return Err(format!("session not found: {}", id));
        }
        read_opencode_db(&path, session_id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn ms_to_iso_converts_epoch_millis() {
        // 1781424641465 ms = 2026-06-08T...Z — assert parses back and is non-empty ISO
        let iso = ms_to_iso(1781424641465);
        assert!(iso.starts_with("2026-"), "got {}", iso);
        assert!(iso.contains('T'));
        assert_eq!(ms_to_iso(0), "");
    }

    #[test]
    fn parse_text_part() {
        let d = json!({"type":"text","text":"hello world"});
        assert_eq!(parse_part(&d), vec![Block::Text { text: "hello world".into() }]);
    }

    #[test]
    fn parse_reasoning_part() {
        let d = json!({"type":"reasoning","text":"thinking hard","time":{"start":1,"end":2}});
        assert_eq!(parse_part(&d), vec![Block::Thinking { text: "thinking hard".into() }]);
    }

    #[test]
    fn parse_tool_part_yields_use_and_result() {
        let d = json!({
            "type":"tool","tool":"webfetch","callID":"call_x",
            "state":{"status":"completed","input":{"url":"https://x"},"output":"body text"}
        });
        let blocks = parse_part(&d);
        assert_eq!(blocks.len(), 2);
        match &blocks[0] {
            Block::ToolUse { id, name, input } => {
                assert_eq!(id, "call_x");
                assert_eq!(name, "webfetch");
                assert_eq!(input.get("url").and_then(|v| v.as_str()), Some("https://x"));
            }
            other => panic!("expected ToolUse, got {:?}", other),
        }
        match &blocks[1] {
            Block::ToolResult { tool_use_id, content } => {
                assert_eq!(tool_use_id, "call_x");
                assert_eq!(content.as_str(), Some("body text"));
            }
            other => panic!("expected ToolResult, got {:?}", other),
        }
    }

    #[test]
    fn parse_step_and_file_parts_are_skipped() {
        assert!(parse_part(&json!({"type":"step-start"})).is_empty());
        assert!(parse_part(&json!({"type":"step-finish"})).is_empty());
        assert!(parse_part(&json!({"type":"file","filename":"x"})).is_empty());
        assert!(parse_part(&json!({"type":"patch"})).is_empty());
    }

    /// 建一个最小 opencode schema 的临时库并塞入一条会话。
    fn seed_db() -> (PathBuf, String) {
        let dir = std::env::temp_dir().join("opencode_test");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("oc_test.db");
        let _ = std::fs::remove_file(&path);
        let conn = Connection::open(&path).unwrap();
        conn.execute_batch(
            r#"
            CREATE TABLE session (id TEXT PRIMARY KEY, directory TEXT, title TEXT, model TEXT,
              tokens_input INTEGER, tokens_output INTEGER, time_created INTEGER, time_updated INTEGER);
            CREATE TABLE message (id TEXT PRIMARY KEY, session_id TEXT, time_created INTEGER, data TEXT);
            CREATE TABLE part (id TEXT PRIMARY KEY, message_id TEXT, session_id TEXT, time_created INTEGER, data TEXT);
            "#,
        ).unwrap();
        conn.execute(
            "INSERT INTO session VALUES (?,?,?,?,?,?,?,?)",
            rusqlite::params![
                "ses_1", "/Users/me/proj", "my title",
                r#"{"id":"deepseek-v4-pro","providerID":"deepseek"}"#,
                100i64, 20i64, 1781424641000i64, 1781424650000i64
            ],
        ).unwrap();
        conn.execute(
            "INSERT INTO message VALUES (?,?,?,?)",
            rusqlite::params!["msg_1", "ses_1", 1781424641000i64,
                r#"{"role":"user","time":{"created":1781424641000}}"#],
        ).unwrap();
        conn.execute(
            "INSERT INTO message VALUES (?,?,?,?)",
            rusqlite::params!["msg_2", "ses_1", 1781424645000i64,
                r#"{"role":"assistant","modelID":"deepseek-v4-pro","time":{"created":1781424645000}}"#],
        ).unwrap();
        conn.execute(
            "INSERT INTO part VALUES (?,?,?,?,?)",
            rusqlite::params!["prt_1", "msg_1", "ses_1", 1781424641000i64,
                r#"{"type":"text","text":"do the thing"}"#],
        ).unwrap();
        conn.execute(
            "INSERT INTO part VALUES (?,?,?,?,?)",
            rusqlite::params!["prt_2", "msg_2", "ses_1", 1781424645000i64,
                r#"{"type":"reasoning","text":"hmm"}"#],
        ).unwrap();
        conn.execute(
            "INSERT INTO part VALUES (?,?,?,?,?)",
            rusqlite::params!["prt_3", "msg_2", "ses_1", 1781424646000i64,
                r#"{"type":"text","text":"done"}"#],
        ).unwrap();
        (path, "ses_1".to_string())
    }

    #[test]
    fn read_opencode_db_assembles_session() {
        let (path, sid) = seed_db();
        let d = read_opencode_db(&path, &sid).expect("read ok");
        assert_eq!(d.summary.id, "opencode:ses_1");
        assert_eq!(d.summary.source, "opencode");
        assert_eq!(d.summary.project_path, "/Users/me/proj");
        assert_eq!(d.summary.title, "my title");
        assert_eq!(d.summary.total_input_tokens, 100);
        assert_eq!(d.summary.total_output_tokens, 20);
        assert!(d.summary.models.contains(&"deepseek-v4-pro".to_string()));
        // 2 messages → 2 events
        assert_eq!(d.events.len(), 2);
        assert_eq!(d.events[0].role, "user");
        assert_eq!(d.events[0].blocks, vec![Block::Text { text: "do the thing".into() }]);
        // assistant event: reasoning + text, in part time order
        assert_eq!(d.events[1].role, "assistant");
        assert_eq!(d.events[1].blocks.len(), 2);
        assert_eq!(d.events[1].blocks[0], Block::Thinking { text: "hmm".into() });
        assert_eq!(d.events[1].blocks[1], Block::Text { text: "done".into() });
        // synthetic chain: msg2 parent = msg1 uuid
        assert_eq!(d.events[0].parent_uuid, None);
        assert_eq!(d.events[1].parent_uuid.as_deref(), Some(d.events[0].uuid.as_str()));
        // ISO timestamps
        assert!(d.events[0].timestamp.starts_with("2026-"));
        std::fs::remove_file(&path).ok();
    }
}
