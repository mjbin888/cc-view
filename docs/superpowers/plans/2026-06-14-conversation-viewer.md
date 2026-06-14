# 会话查看器（Conversation Viewer）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Port Manager 中新增"本地 CLI 会话查看器"视图，优先支持 Claude Code，可读时间线 + 原始 payload 切换 + token 统计，轮询自动刷新。

**Architecture:** Rust 后端用 `TranscriptSource` trait 抽象数据源（首版仅 `ClaudeCodeSource`，扫 `~/.claude/projects/*/*.jsonl`），把 JSONL 逐行解析成归一化模型并经 Tauri 命令暴露；前端新增 sidebar 在「端口」「会话」两视图间切换，会话视图为主从布局（左会话列表 + 右消息时间线），复用 TanStack Query 轮询。

**Tech Stack:** Tauri 2 + Rust（serde / serde_json / dirs）+ React 19 + TypeScript + TanStack Query v5 + TailwindCSS v4 + shadcn/ui + vitest。

> 文档/注释中文，代码与 commit message 英文（见 CLAUDE.md）。

---

## 文件结构

**Rust（src-tauri/src/）**
- Create `commands/conversations.rs` — 数据模型、JSONL 解析、`TranscriptSource` trait、`ClaudeCodeSource`、两个 Tauri 命令。
- Modify `commands/mod.rs` — `pub mod conversations;`
- Modify `lib.rs` — 注册 `list_sessions` / `read_session`
- Modify `Cargo.toml` — 加 `serde_json`、`dirs`（确认 `serde` 已在）

**前端（src/）**
- Create `types/conversation.ts` — TS 模型镜像
- Create `lib/aggregateUsage.ts` — 事件 → token 聚合（纯函数）
- Create `lib/groupSessionsByProject.ts` — 按项目分组（纯函数）
- Create `lib/filterSessions.ts` — 会话搜索过滤（纯函数）
- Create `hooks/useSessions.ts`、`hooks/useSession.ts`
- Create `components/SessionList.tsx`、`components/TokenStats.tsx`、`components/MessageTimeline.tsx`、`components/SessionDetail.tsx`、`components/AppSidebar.tsx`
- Create `views/PortsView.tsx`（搬运现有 App 主体）、`views/ConversationsView.tsx`
- Modify `App.tsx` — 改 layout shell + 视图切换
- Create 对应 vitest 测试于 `src/test/`
- Modify `CLAUDE.md` — 同步架构与命令

---

## Task 1: Rust 依赖与模块骨架

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/commands/conversations.rs`
- Modify: `src-tauri/src/commands/mod.rs`

- [ ] **Step 1: 确认并补依赖**

查看 `src-tauri/Cargo.toml` 的 `[dependencies]`，确保含（缺则补）：

```toml
serde = { version = "1", features = ["derive"] }
serde_json = "1"
dirs = "5"
```

- [ ] **Step 2: 创建模块文件，写数据模型**

Create `src-tauri/src/commands/conversations.rs`：

```rust
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
```

- [ ] **Step 3: 注册模块**

Modify `src-tauri/src/commands/mod.rs`，加一行：

```rust
pub mod conversations;
```

- [ ] **Step 4: 编译验证**

Run: `cd src-tauri && cargo build`
Expected: 编译通过（可能有 unused warning，正常）。

- [ ] **Step 5: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/commands/conversations.rs src-tauri/src/commands/mod.rs
git commit -m "feat(conversations): add rust module skeleton and data model"
```

---

## Task 2: 单行解析 `parse_event`（TDD）

**Files:**
- Modify: `src-tauri/src/commands/conversations.rs`

- [ ] **Step 1: 写失败测试**

在 `conversations.rs` 末尾追加：

```rust
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd src-tauri && cargo test parse_`
Expected: FAIL（`parse_event` 未定义）。

- [ ] **Step 3: 实现 `parse_event` 与 `parse_block`**

在 `conversations.rs`（tests 之前）加：

```rust
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
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd src-tauri && cargo test parse_`
Expected: PASS（3 个测试）。

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/conversations.rs
git commit -m "feat(conversations): parse jsonl line into normalized event"
```

---

## Task 3: 整会话解析 `read_session_file`（TDD）

**Files:**
- Modify: `src-tauri/src/commands/conversations.rs`

- [ ] **Step 1: 写失败测试**

在 `mod tests` 内追加：

```rust
    fn write_fixture(dir: &std::path::Path, name: &str, lines: &[&str]) -> std::path::PathBuf {
        let p = dir.join(name);
        std::fs::write(&p, lines.join("\n")).unwrap();
        p
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd src-tauri && cargo test read_session_file`
Expected: FAIL（`read_session_file` 未定义）。

- [ ] **Step 3: 实现 `read_session_file` 与标题辅助**

在 `conversations.rs`（parse_event 之后）加：

```rust
use std::path::Path;

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
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd src-tauri && cargo test read_session_file`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/conversations.rs
git commit -m "feat(conversations): parse full session file into detail"
```

---

## Task 4: 数据源 trait、目录扫描与 Tauri 命令（TDD + 接线）

**Files:**
- Modify: `src-tauri/src/commands/conversations.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: 写失败测试（轻量摘要 `summarize_session_file`）**

在 `mod tests` 内追加：

```rust
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
        // 列表侧不计算精确 token
        assert_eq!(s.total_input_tokens, 0);
        assert_eq!(s.total_output_tokens, 0);
        std::fs::remove_dir_all(&tmp).ok();
    }
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd src-tauri && cargo test summarize_session_file`
Expected: FAIL（未定义）。

- [ ] **Step 3: 实现 trait、`ClaudeCodeSource`、`summarize_session_file`、命令**

在 `conversations.rs`（tests 之前）加：

```rust
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
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd src-tauri && cargo test`
Expected: PASS（全部，含既有 ports 测试）。

- [ ] **Step 5: 注册命令**

Modify `src-tauri/src/lib.rs` 的 `invoke_handler`：

```rust
        .invoke_handler(tauri::generate_handler![
            commands::ports::list_ports,
            commands::ports::kill_port,
            commands::conversations::list_sessions,
            commands::conversations::read_session,
        ])
```

- [ ] **Step 6: 编译验证**

Run: `cd src-tauri && cargo build`
Expected: 通过。

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/commands/conversations.rs src-tauri/src/lib.rs
git commit -m "feat(conversations): add source trait, scan and tauri commands"
```

---

## Task 5: 前端类型模型

**Files:**
- Create: `src/types/conversation.ts`

- [ ] **Step 1: 写类型（无测试，纯声明）**

Create `src/types/conversation.ts`：

```typescript
// src/types/conversation.ts
export type Block =
  | { kind: "thinking"; text: string }
  | { kind: "text"; text: string }
  | { kind: "tool_use"; id: string; name: string; input: unknown }
  | { kind: "tool_result"; toolUseId: string; content: unknown }
  | { kind: "image"; source: unknown };

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

export interface NormEvent {
  uuid: string;
  role: "user" | "assistant" | "system";
  timestamp: string;
  blocks: Block[];
  model?: string;
  usage?: Usage;
  raw: string;
}

export interface SessionSummary {
  id: string;
  source: string;
  projectPath: string;
  title: string;
  messageCount: number;
  startedAt: string;
  lastActivityAt: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  models: string[];
}

export interface SessionDetail {
  summary: SessionSummary;
  events: NormEvent[];
}
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无新错误。

- [ ] **Step 3: Commit**

```bash
git add src/types/conversation.ts
git commit -m "feat(conversations): add frontend type model"
```

---

## Task 6: 纯函数 `aggregateUsage`（TDD）

**Files:**
- Create: `src/lib/aggregateUsage.ts`
- Create: `src/test/aggregateUsage.test.ts`

- [ ] **Step 1: 写失败测试**

Create `src/test/aggregateUsage.test.ts`：

```typescript
import { describe, it, expect } from "vitest";
import { aggregateUsage } from "../lib/aggregateUsage";
import { NormEvent } from "../types/conversation";

const ev = (model: string | undefined, u?: Partial<NormEvent["usage"]>): NormEvent => ({
  uuid: Math.random().toString(),
  role: "assistant",
  timestamp: "",
  blocks: [],
  model,
  usage: u
    ? { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, ...u }
    : undefined,
  raw: "",
});

describe("aggregateUsage", () => {
  it("returns zeros for empty input", () => {
    const r = aggregateUsage([]);
    expect(r.totalInput).toBe(0);
    expect(r.totalOutput).toBe(0);
    expect(r.byModel).toEqual({});
  });

  it("sums totals and groups by model", () => {
    const r = aggregateUsage([
      ev("claude-sonnet-4-6", { inputTokens: 10, outputTokens: 20, cacheReadTokens: 5 }),
      ev("claude-sonnet-4-6", { inputTokens: 3, outputTokens: 7 }),
      ev("claude-opus-4-8", { inputTokens: 100, outputTokens: 200, cacheCreationTokens: 50 }),
      ev(undefined),
    ]);
    expect(r.totalInput).toBe(113);
    expect(r.totalOutput).toBe(227);
    expect(r.totalCacheRead).toBe(5);
    expect(r.totalCacheCreation).toBe(50);
    expect(r.byModel["claude-sonnet-4-6"]).toEqual({ input: 13, output: 27 });
    expect(r.byModel["claude-opus-4-8"]).toEqual({ input: 100, output: 200 });
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test -- --run aggregateUsage`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现**

Create `src/lib/aggregateUsage.ts`：

```typescript
// src/lib/aggregateUsage.ts
import { NormEvent } from "../types/conversation";

export interface UsageAggregate {
  totalInput: number;
  totalOutput: number;
  totalCacheRead: number;
  totalCacheCreation: number;
  byModel: Record<string, { input: number; output: number }>;
}

export function aggregateUsage(events: NormEvent[]): UsageAggregate {
  const agg: UsageAggregate = {
    totalInput: 0,
    totalOutput: 0,
    totalCacheRead: 0,
    totalCacheCreation: 0,
    byModel: {},
  };
  for (const ev of events) {
    if (!ev.usage) continue;
    agg.totalInput += ev.usage.inputTokens;
    agg.totalOutput += ev.usage.outputTokens;
    agg.totalCacheRead += ev.usage.cacheReadTokens;
    agg.totalCacheCreation += ev.usage.cacheCreationTokens;
    const m = ev.model;
    if (m) {
      const cur = agg.byModel[m] ?? { input: 0, output: 0 };
      cur.input += ev.usage.inputTokens;
      cur.output += ev.usage.outputTokens;
      agg.byModel[m] = cur;
    }
  }
  return agg;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm run test -- --run aggregateUsage`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/lib/aggregateUsage.ts src/test/aggregateUsage.test.ts
git commit -m "feat(conversations): add aggregateUsage pure function"
```

---

## Task 7: 纯函数 `groupSessionsByProject` 与 `filterSessions`（TDD）

**Files:**
- Create: `src/lib/groupSessionsByProject.ts`、`src/lib/filterSessions.ts`
- Create: `src/test/groupSessionsByProject.test.ts`、`src/test/filterSessions.test.ts`

- [ ] **Step 1: 写失败测试**

Create `src/test/groupSessionsByProject.test.ts`：

```typescript
import { describe, it, expect } from "vitest";
import { groupSessionsByProject } from "../lib/groupSessionsByProject";
import { SessionSummary } from "../types/conversation";

const s = (id: string, projectPath: string): SessionSummary => ({
  id, source: "claude-code", projectPath, title: id,
  messageCount: 1, startedAt: "", lastActivityAt: "",
  totalInputTokens: 0, totalOutputTokens: 0, models: [],
});

describe("groupSessionsByProject", () => {
  it("groups by projectPath preserving order", () => {
    const g = groupSessionsByProject([s("a", "/p1"), s("b", "/p2"), s("c", "/p1")]);
    expect(g.map((x) => x.projectPath)).toEqual(["/p1", "/p2"]);
    expect(g[0].sessions.map((x) => x.id)).toEqual(["a", "c"]);
    expect(g[1].sessions.map((x) => x.id)).toEqual(["b"]);
  });

  it("uses placeholder for empty projectPath", () => {
    const g = groupSessionsByProject([s("a", "")]);
    expect(g[0].projectPath).toBe("(未知项目)");
  });
});
```

Create `src/test/filterSessions.test.ts`：

```typescript
import { describe, it, expect } from "vitest";
import { filterSessions } from "../lib/filterSessions";
import { SessionSummary } from "../types/conversation";

const s = (id: string, title: string, projectPath: string): SessionSummary => ({
  id, source: "claude-code", projectPath, title,
  messageCount: 1, startedAt: "", lastActivityAt: "",
  totalInputTokens: 0, totalOutputTokens: 0, models: [],
});

const items = [
  s("1", "fix auth bug", "/Users/me/api"),
  s("2", "add port viewer", "/Users/me/tools"),
];

describe("filterSessions", () => {
  it("returns all for empty query", () => {
    expect(filterSessions(items, "  ")).toHaveLength(2);
  });
  it("matches title case-insensitively", () => {
    expect(filterSessions(items, "AUTH").map((x) => x.id)).toEqual(["1"]);
  });
  it("matches project path", () => {
    expect(filterSessions(items, "tools").map((x) => x.id)).toEqual(["2"]);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test -- --run groupSessionsByProject filterSessions`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现**

Create `src/lib/groupSessionsByProject.ts`：

```typescript
// src/lib/groupSessionsByProject.ts
import { SessionSummary } from "../types/conversation";

export interface ProjectGroup {
  projectPath: string;
  sessions: SessionSummary[];
}

export function groupSessionsByProject(sessions: SessionSummary[]): ProjectGroup[] {
  const order: string[] = [];
  const map = new Map<string, SessionSummary[]>();
  for (const s of sessions) {
    const key = s.projectPath || "(未知项目)";
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)!.push(s);
  }
  return order.map((projectPath) => ({ projectPath, sessions: map.get(projectPath)! }));
}
```

Create `src/lib/filterSessions.ts`：

```typescript
// src/lib/filterSessions.ts
import { SessionSummary } from "../types/conversation";

export function filterSessions(sessions: SessionSummary[], query: string): SessionSummary[] {
  const q = query.trim().toLowerCase();
  if (!q) return sessions;
  return sessions.filter(
    (s) =>
      s.title.toLowerCase().includes(q) ||
      s.projectPath.toLowerCase().includes(q)
  );
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm run test -- --run groupSessionsByProject filterSessions`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/lib/groupSessionsByProject.ts src/lib/filterSessions.ts src/test/groupSessionsByProject.test.ts src/test/filterSessions.test.ts
git commit -m "feat(conversations): add group/filter session pure functions"
```

---

## Task 8: 数据 hook `useSessions` / `useSession`

**Files:**
- Create: `src/hooks/useSessions.ts`、`src/hooks/useSession.ts`

- [ ] **Step 1: 写 hook（参照 usePorts 风格）**

Create `src/hooks/useSessions.ts`：

```typescript
// src/hooks/useSessions.ts
import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { SessionSummary } from "../types/conversation";

export function useSessions() {
  return useQuery<SessionSummary[], Error>({
    queryKey: ["sessions"],
    queryFn: () => invoke<SessionSummary[]>("list_sessions"),
    refetchInterval: 5000,
    staleTime: 0,
    retry: 0,
  });
}
```

Create `src/hooks/useSession.ts`：

```typescript
// src/hooks/useSession.ts
import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { SessionDetail } from "../types/conversation";

export function useSession(id: string | null) {
  return useQuery<SessionDetail, Error>({
    queryKey: ["session", id],
    queryFn: () => invoke<SessionDetail>("read_session", { id }),
    enabled: !!id,
    refetchInterval: 5000,
    staleTime: 0,
    retry: 0,
  });
}
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无新错误。

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useSessions.ts src/hooks/useSession.ts
git commit -m "feat(conversations): add useSessions and useSession hooks"
```

---

## Task 9: `MessageTimeline` 组件（TDD 渲染）

**Files:**
- Create: `src/components/MessageTimeline.tsx`
- Create: `src/test/MessageTimeline.test.tsx`

- [ ] **Step 1: 写失败测试**

Create `src/test/MessageTimeline.test.tsx`：

```typescript
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MessageTimeline } from "../components/MessageTimeline";
import { NormEvent } from "../types/conversation";

const events: NormEvent[] = [
  { uuid: "u1", role: "user", timestamp: "2026-06-14T00:00:00Z",
    blocks: [{ kind: "text", text: "hello world" }], raw: '{"a":1}' },
  { uuid: "a1", role: "assistant", timestamp: "2026-06-14T00:00:02Z", model: "claude-sonnet-4-6",
    blocks: [
      { kind: "thinking", text: "secret thought" },
      { kind: "text", text: "the answer" },
      { kind: "tool_use", id: "t1", name: "Bash", input: { command: "ls" } },
    ], raw: '{"b":2}' },
];

describe("MessageTimeline", () => {
  it("renders user text and assistant text", () => {
    render(<MessageTimeline events={events} />);
    expect(screen.getByText("hello world")).toBeInTheDocument();
    expect(screen.getByText("the answer")).toBeInTheDocument();
  });

  it("renders tool name", () => {
    render(<MessageTimeline events={events} />);
    expect(screen.getByText(/Bash/)).toBeInTheDocument();
  });

  it("toggles raw view for an event", () => {
    render(<MessageTimeline events={events} />);
    expect(screen.queryByText(/"a":1/)).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /raw/i })[0]);
    expect(screen.getByText(/"a":1/)).toBeInTheDocument();
  });

  it("renders empty state", () => {
    render(<MessageTimeline events={[]} />);
    expect(screen.getByText("无消息")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test -- --run MessageTimeline`
Expected: FAIL（组件不存在）。

- [ ] **Step 3: 实现组件**

Create `src/components/MessageTimeline.tsx`：

```typescript
// src/components/MessageTimeline.tsx
import { useState } from "react";
import { Block, NormEvent } from "../types/conversation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case "text":
      return <p className="whitespace-pre-wrap text-sm">{block.text}</p>;
    case "thinking":
      return (
        <details className="text-sm text-muted-foreground">
          <summary className="cursor-pointer select-none">💭 thinking</summary>
          <p className="whitespace-pre-wrap mt-1">{block.text}</p>
        </details>
      );
    case "tool_use":
      return (
        <details className="text-sm">
          <summary className="cursor-pointer select-none">
            🔧 tool_use: <span className="font-mono">{block.name}</span>
          </summary>
          <pre className="mt-1 overflow-auto rounded bg-muted p-2 text-xs">
            {JSON.stringify(block.input, null, 2)}
          </pre>
        </details>
      );
    case "tool_result":
      return (
        <details className="text-sm">
          <summary className="cursor-pointer select-none">📤 tool_result</summary>
          <pre className="mt-1 overflow-auto rounded bg-muted p-2 text-xs">
            {typeof block.content === "string"
              ? block.content
              : JSON.stringify(block.content, null, 2)}
          </pre>
        </details>
      );
    case "image":
      return <p className="text-sm text-muted-foreground">🖼️ image</p>;
  }
}

function EventCard({ event }: { event: NormEvent }) {
  const [raw, setRaw] = useState(false);
  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant={event.role === "assistant" ? "default" : "secondary"}>
            {event.role}
          </Badge>
          {event.model && <span className="text-xs text-muted-foreground">{event.model}</span>}
          <span className="text-xs text-muted-foreground">{event.timestamp}</span>
        </div>
        <Button size="sm" variant="ghost" onClick={() => setRaw((v) => !v)}>
          {raw ? "Pretty" : "Raw"}
        </Button>
      </div>
      {raw ? (
        <pre className="overflow-auto rounded bg-muted p-2 text-xs">{event.raw}</pre>
      ) : (
        <div className="space-y-2">
          {event.blocks.map((b, i) => (
            <BlockView key={i} block={b} />
          ))}
        </div>
      )}
    </div>
  );
}

export function MessageTimeline({ events }: { events: NormEvent[] }) {
  if (events.length === 0) {
    return <div className="p-6 text-center text-muted-foreground">无消息</div>;
  }
  return (
    <div className="space-y-3">
      {events.map((e) => (
        <EventCard key={e.uuid} event={e} />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm run test -- --run MessageTimeline`
Expected: PASS（4 个测试）。

> 注：测试点击 "Raw" 按钮按 name `/raw/i`，按钮初始文案为 "Raw"，符合。

- [ ] **Step 5: Commit**

```bash
git add src/components/MessageTimeline.tsx src/test/MessageTimeline.test.tsx
git commit -m "feat(conversations): add MessageTimeline with pretty/raw toggle"
```

---

## Task 10: `TokenStats`、`SessionList`、`SessionDetail` 组件

**Files:**
- Create: `src/components/TokenStats.tsx`、`src/components/SessionList.tsx`、`src/components/SessionDetail.tsx`
- Create: `src/test/SessionList.test.tsx`

- [ ] **Step 1: 写 `SessionList` 失败测试**

Create `src/test/SessionList.test.tsx`：

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SessionList } from "../components/SessionList";
import { SessionSummary } from "../types/conversation";

const s = (id: string, title: string, projectPath: string): SessionSummary => ({
  id, source: "claude-code", projectPath, title,
  messageCount: 3, startedAt: "", lastActivityAt: "2026-06-14T00:00:00Z",
  totalInputTokens: 0, totalOutputTokens: 0, models: [],
});

const sessions = [s("1", "fix auth", "/p/api"), s("2", "add viewer", "/p/tools")];

describe("SessionList", () => {
  it("renders grouped sessions", () => {
    render(<SessionList sessions={sessions} selectedId={null} onSelect={() => {}} query="" onQueryChange={() => {}} />);
    expect(screen.getByText("fix auth")).toBeInTheDocument();
    expect(screen.getByText("/p/tools")).toBeInTheDocument();
  });

  it("calls onSelect when a session is clicked", () => {
    const onSelect = vi.fn();
    render(<SessionList sessions={sessions} selectedId={null} onSelect={onSelect} query="" onQueryChange={() => {}} />);
    fireEvent.click(screen.getByText("fix auth"));
    expect(onSelect).toHaveBeenCalledWith("1");
  });

  it("shows empty state", () => {
    render(<SessionList sessions={[]} selectedId={null} onSelect={() => {}} query="" onQueryChange={() => {}} />);
    expect(screen.getByText("无会话")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test -- --run SessionList`
Expected: FAIL（组件不存在）。

- [ ] **Step 3: 实现 `TokenStats`**

Create `src/components/TokenStats.tsx`：

```typescript
// src/components/TokenStats.tsx
import { NormEvent } from "../types/conversation";
import { aggregateUsage } from "../lib/aggregateUsage";
import { Badge } from "@/components/ui/badge";

export function TokenStats({ events }: { events: NormEvent[] }) {
  const a = aggregateUsage(events);
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <Badge variant="outline">in {a.totalInput.toLocaleString()}</Badge>
      <Badge variant="outline">out {a.totalOutput.toLocaleString()}</Badge>
      <Badge variant="outline">cache r {a.totalCacheRead.toLocaleString()}</Badge>
      <Badge variant="outline">cache w {a.totalCacheCreation.toLocaleString()}</Badge>
      {Object.entries(a.byModel).map(([m, v]) => (
        <span key={m} className="text-muted-foreground">
          {m}: {v.input.toLocaleString()}/{v.output.toLocaleString()}
        </span>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: 实现 `SessionList`**

Create `src/components/SessionList.tsx`：

```typescript
// src/components/SessionList.tsx
import { SessionSummary } from "../types/conversation";
import { groupSessionsByProject } from "../lib/groupSessionsByProject";
import { filterSessions } from "../lib/filterSessions";
import { Input } from "@/components/ui/input";

interface Props {
  sessions: SessionSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  query: string;
  onQueryChange: (q: string) => void;
}

export function SessionList({ sessions, selectedId, onSelect, query, onQueryChange }: Props) {
  const groups = groupSessionsByProject(filterSessions(sessions, query));
  return (
    <div className="flex h-full flex-col">
      <div className="p-2">
        <Input
          placeholder="搜索会话（标题/项目）"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
        />
      </div>
      <div className="flex-1 overflow-auto">
        {groups.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground">无会话</div>
        ) : (
          groups.map((g) => (
            <div key={g.projectPath} className="mb-3">
              <div className="px-3 py-1 text-xs font-medium text-muted-foreground truncate">
                {g.projectPath}
              </div>
              {g.sessions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => onSelect(s.id)}
                  className={`block w-full px-3 py-2 text-left text-sm hover:bg-accent ${
                    selectedId === s.id ? "bg-accent" : ""
                  }`}
                >
                  <div className="truncate">{s.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {s.messageCount} msgs · {s.lastActivityAt}
                  </div>
                </button>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: 实现 `SessionDetail`**

Create `src/components/SessionDetail.tsx`：

```typescript
// src/components/SessionDetail.tsx
import { SessionDetail as SessionDetailData } from "../types/conversation";
import { MessageTimeline } from "./MessageTimeline";
import { TokenStats } from "./TokenStats";

interface Props {
  detail: SessionDetailData | undefined;
  isLoading: boolean;
  hasSelection: boolean;
}

export function SessionDetail({ detail, isLoading, hasSelection }: Props) {
  if (!hasSelection) {
    return <div className="p-6 text-center text-muted-foreground">选择左侧会话查看消息</div>;
  }
  if (isLoading && !detail) {
    return <div className="p-6 text-center text-muted-foreground">加载中…</div>;
  }
  if (!detail) {
    return <div className="p-6 text-center text-muted-foreground">无法加载会话</div>;
  }
  return (
    <div className="flex h-full flex-col">
      <div className="border-b p-3 space-y-2">
        <h2 className="truncate text-lg font-semibold">{detail.summary.title}</h2>
        <p className="truncate text-xs text-muted-foreground">{detail.summary.projectPath}</p>
        <TokenStats events={detail.events} />
      </div>
      <div className="flex-1 overflow-auto p-3">
        <MessageTimeline events={detail.events} />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: 跑测试确认通过**

Run: `npm run test -- --run SessionList`
Expected: PASS（3 个测试）。

- [ ] **Step 7: Commit**

```bash
git add src/components/TokenStats.tsx src/components/SessionList.tsx src/components/SessionDetail.tsx src/test/SessionList.test.tsx
git commit -m "feat(conversations): add TokenStats, SessionList, SessionDetail"
```

---

## Task 11: `ConversationsView` 组装

**Files:**
- Create: `src/views/ConversationsView.tsx`

- [ ] **Step 1: 实现视图（组合 hook + 组件）**

Create `src/views/ConversationsView.tsx`：

```typescript
// src/views/ConversationsView.tsx
import { useState } from "react";
import { useSessions } from "../hooks/useSessions";
import { useSession } from "../hooks/useSession";
import { SessionList } from "../components/SessionList";
import { SessionDetail } from "../components/SessionDetail";

export function ConversationsView() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const { data: sessions = [], isError } = useSessions();
  const { data: detail, isLoading } = useSession(selectedId);

  return (
    <div className="flex h-screen">
      <div className="w-80 border-r">
        {isError ? (
          <div className="p-6 text-center text-destructive text-sm">无法读取会话目录</div>
        ) : (
          <SessionList
            sessions={sessions}
            selectedId={selectedId}
            onSelect={setSelectedId}
            query={query}
            onQueryChange={setQuery}
          />
        )}
      </div>
      <div className="flex-1">
        <SessionDetail detail={detail} isLoading={isLoading} hasSelection={!!selectedId} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无新错误。

- [ ] **Step 3: Commit**

```bash
git add src/views/ConversationsView.tsx
git commit -m "feat(conversations): assemble ConversationsView"
```

---

## Task 12: 抽出 `PortsView` + 新增 `AppSidebar` + 改造 `App.tsx`

**Files:**
- Create: `src/views/PortsView.tsx`
- Create: `src/components/AppSidebar.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: 抽出 `PortsView`（搬运现有 App 主体，行为不变）**

Create `src/views/PortsView.tsx`，把当前 `App.tsx` 内的端口逻辑整体搬入（去掉最外层 `min-h-screen` 包裹，改为内容容器）：

```typescript
// src/views/PortsView.tsx
import { useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { usePorts } from "../hooks/usePorts";
import { PortTable } from "../components/PortTable";
import { RefreshBar } from "../components/RefreshBar";
import { KillDialog } from "../components/KillDialog";
import { SearchBar } from "../components/SearchBar";
import { filterPorts } from "../lib/filterPorts";
import { groupPorts } from "../lib/groupPorts";
import { PortEntry } from "../types/port";

export function PortsView() {
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [query, setQuery] = useState("");
  const [pendingKill, setPendingKill] = useState<PortEntry | null>(null);
  const queryClient = useQueryClient();

  const { data: ports = [], isFetching, isError } = usePorts(autoRefresh);

  const groups = useMemo(() => groupPorts(filterPorts(ports, query)), [ports, query]);

  const emptyMessage =
    query.trim() && ports.length > 0 ? "无匹配结果" : "未发现监听端口";

  function handleRefresh() {
    queryClient.invalidateQueries({ queryKey: ["ports"] });
  }

  async function handleKillConfirm(entry: PortEntry) {
    try {
      await invoke("kill_port", { pid: entry.pid });
      setPendingKill(null);
      toast.success(`已 Kill ${entry.processName} (PID ${entry.pid})`);
      handleRefresh();
    } catch (err) {
      toast.error(`Kill 失败: ${err}`);
    }
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Port Manager</h1>
        <RefreshBar
          autoRefresh={autoRefresh}
          onAutoRefreshChange={setAutoRefresh}
          onRefresh={handleRefresh}
          isLoading={isFetching}
        />
      </div>
      <SearchBar query={query} onQueryChange={setQuery} />
      {isError && (
        <div className="mb-4 rounded-md border border-destructive bg-destructive/10 px-4 py-2 text-sm text-destructive">
          无法获取端口列表，请检查应用权限
        </div>
      )}
      <div className="rounded-lg border">
        <PortTable groups={groups} onKill={setPendingKill} emptyMessage={emptyMessage} />
      </div>

      <KillDialog
        entry={pendingKill}
        onConfirm={handleKillConfirm}
        onCancel={() => setPendingKill(null)}
      />
    </div>
  );
}
```

- [ ] **Step 2: 新增 `AppSidebar`**

Create `src/components/AppSidebar.tsx`：

```typescript
// src/components/AppSidebar.tsx
import { Network, MessagesSquare } from "lucide-react";

export type ViewKey = "ports" | "conversations";

const items: { key: ViewKey; label: string; icon: typeof Network }[] = [
  { key: "ports", label: "端口", icon: Network },
  { key: "conversations", label: "会话", icon: MessagesSquare },
];

export function AppSidebar({
  view,
  onChange,
}: {
  view: ViewKey;
  onChange: (v: ViewKey) => void;
}) {
  return (
    <nav className="flex w-20 flex-col items-center gap-1 border-r bg-muted/30 py-3">
      {items.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`flex w-16 flex-col items-center gap-1 rounded-md py-2 text-xs ${
            view === key ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/50"
          }`}
        >
          <Icon className="h-5 w-5" />
          {label}
        </button>
      ))}
    </nav>
  );
}
```

> 注：`lucide-react` 已是依赖（见 CLAUDE.md 核心依赖）。

- [ ] **Step 3: 改造 `App.tsx` 为 layout shell**

替换 `src/App.tsx` 全部内容：

```typescript
import { useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { AppSidebar, ViewKey } from "./components/AppSidebar";
import { PortsView } from "./views/PortsView";
import { ConversationsView } from "./views/ConversationsView";

export default function App() {
  const [view, setView] = useState<ViewKey>("ports");

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <AppSidebar view={view} onChange={setView} />
      <main className="flex-1 overflow-auto">
        {view === "ports" ? <PortsView /> : <ConversationsView />}
      </main>
      <Toaster />
    </div>
  );
}
```

- [ ] **Step 4: 类型检查 + 全部测试**

Run: `npx tsc --noEmit && npm run test -- --run`
Expected: 通过；既有 PortTable / filterPorts / groupPorts / formatDuration 测试不受影响。

- [ ] **Step 5: 手动冒烟（可选但建议）**

Run: `npm run tauri dev`
Expected: 左侧出现「端口 / 会话」导航；端口视图行为不变；会话视图列出本地 Claude Code 会话，点击显示时间线 + token 统计 + Raw 切换。

- [ ] **Step 6: Commit**

```bash
git add src/views/PortsView.tsx src/components/AppSidebar.tsx src/App.tsx
git commit -m "feat(conversations): add sidebar nav and wire ports/conversations views"
```

---

## Task 13: 更新 CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: 更新技术架构树**

在 `CLAUDE.md` 的「技术架构」目录树中加入新文件：
- `src-tauri/src/commands/conversations.rs`（list_sessions、read_session + 解析 + 单元测试）
- `src/views/PortsView.tsx`、`src/views/ConversationsView.tsx`
- `src/components/AppSidebar.tsx`、`SessionList.tsx`、`SessionDetail.tsx`、`MessageTimeline.tsx`、`TokenStats.tsx`
- `src/hooks/useSessions.ts`、`src/hooks/useSession.ts`
- `src/lib/aggregateUsage.ts`、`groupSessionsByProject.ts`、`filterSessions.ts`
- `src/types/conversation.ts`

并新增一段 v4 增强说明：

```
v4 增强：新增「会话查看器」视图（sidebar 切换）；读取本地 Claude Code 会话（~/.claude/projects/*/*.jsonl），归一化为时间线；支持 thinking/工具折叠、Pretty/Raw 切换、token 统计；后端 TranscriptSource trait 预留 Codex/OpenCode。
```

- [ ] **Step 2: 更新数据流段落**

在「数据流」后追加会话查看器数据流（取自 plan 的数据流图）。

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for conversation viewer (v4)"
```

---

## 完成标准

- `cd src-tauri && cargo test` 全绿（含 conversations 解析测试）。
- `npm run test -- --run` 全绿（含 aggregateUsage / group / filter / MessageTimeline / SessionList）。
- `npm run tauri dev` 中 sidebar 可切换，会话视图能列出并查看本地 Claude Code 会话。
- 端口视图行为与改造前一致。
- CLAUDE.md 已同步。
