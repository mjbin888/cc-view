# 会话查看器（Conversation Viewer）设计文档

> 日期：2026-06-14
> 模块：在 Port Manager 中新增"本地 CLI 会话查看器"，优先支持 Claude Code，预留 Codex / OpenCode。

## 1. 背景与目标

Port Manager 当前为单视图（端口列表）。CLAUDE.md 已预留"左侧 sidebar 导航给后期功能集成"。

本模块新增一个独立视图，用于**浏览本地 Claude Code 等 CLI 工具的请求交互消息**。定位为**完整浏览器**：

- 可读时间线：会话列表 → 消息时间线，thinking / 工具调用 / 回复折叠展示。
- 原始 payload：每条事件可切换 Pretty / Raw（原始 JSON 行）。
- Token 统计：总 input / output / cache，按 model 分组。

### 决策摘要

| 维度 | 决策 |
|------|------|
| 核心目的 | 完整浏览器（可读时间线 + 原始 payload + token 统计） |
| 数据刷新 | 轮询自动刷新（复用 TanStack Query，约 5s） |
| 多工具支持 | 先只做 Claude Code，后端用 adapter trait 抽象，预留 Codex / OpenCode |

## 2. 数据源（Claude Code）

- 路径：`~/.claude/projects/<编码项目路径>/<sessionId>.jsonl`
- 每行是一个事件 JSON，`type` 字段区分：
  - 消息类事件：`user`、`assistant`、`system`
  - 非消息类（解析时跳过）：`mode`、`file-history-snapshot`、`queue-operation`、`last-prompt`、`attachment`
- 消息事件结构：
  - 顶层：`uuid`、`parentUuid`、`sessionId`、`cwd`、`gitBranch`、`timestamp`、`version`、`type`
  - `message.role` + `message.content`
  - `message.content` 为 block 数组，block `type` ∈ `thinking` / `text` / `tool_use` / `tool_result` / `image`
  - assistant 消息含 `message.model` 与 `message.usage`（input_tokens / output_tokens / cache_creation_input_tokens / cache_read_input_tokens 等）

### Block 结构

| type | 关键字段 |
|------|---------|
| thinking | `thinking`（文本）, `signature` |
| text | `text` |
| tool_use | `id`, `name`, `input` |
| tool_result | `tool_use_id`, `content` |
| image | `source` |

### 注意点

- **项目真实路径**取首行 `cwd` 字段，不从目录名反解（目录名把 `/` 编码为 `-`，遇路径含 `-` 时有歧义）。
- **标题**取第一条真实 user 文本：过滤掉 `<local-command-caveat>` / `<command-*>` / `isMeta` 等包装内容后截断。

## 3. 架构

### 3.1 Sidebar 改造（前端结构）

- 引入轻量视图切换，不引入路由库：`App.tsx` 用 `useState<'ports' | 'conversations'>` 管理当前视图。
- 新增 `components/AppSidebar.tsx`：竖向导航（图标 + 文案），点击切换视图。
- `App.tsx` 改为 layout shell：`flex` 布局，sidebar 固定宽度 + 主区 `flex-1`。
- 现有端口逻辑原样抽到 `views/PortsView.tsx`，**行为不变**（保留现有测试）。
- 新增 `views/ConversationsView.tsx`。

### 3.2 Rust 后端

新增 `src-tauri/src/commands/conversations.rs`：

```rust
trait TranscriptSource {
    fn list_sessions(&self) -> Result<Vec<SessionSummary>, String>;
    fn read_session(&self, id: &str) -> Result<SessionDetail, String>;
}

struct ClaudeCodeSource; // 扫 ~/.claude/projects/*/*.jsonl
```

Tauri 命令：
- `list_sessions() -> Vec<SessionSummary>`
- `read_session(id: String) -> SessionDetail`

会话 `id` 形如 `claude-code:<sessionId>`（或文件相对路径），保证全局唯一并可定位文件。在 `lib.rs` 注册两个命令。

### 3.3 归一化数据模型

```text
SessionSummary {
  id: string                 // "claude-code:<sessionId>"
  source: "claude-code"
  projectPath: string        // 来自首行 cwd
  title: string              // 首条真实 user 文本，截断
  messageCount: number
  startedAt: string          // ISO，首事件时间
  lastActivityAt: string     // 末事件时间
  totalInputTokens: number
  totalOutputTokens: number
  models: string[]           // 去重
}

SessionDetail {
  summary: SessionSummary
  events: NormEvent[]
}

NormEvent {
  uuid: string
  role: "user" | "assistant" | "system"
  timestamp: string
  blocks: Block[]
  model?: string
  usage?: Usage              // input/output/cacheCreation/cacheRead
  raw: string               // 原始 JSON 行，供 Raw 视图
}

Block =
  | { kind: "thinking", text }
  | { kind: "text", text }
  | { kind: "tool_use", id, name, input }
  | { kind: "tool_result", toolUseId, content }
  | { kind: "image", source }
```

### 3.4 前端组件与 hook

- `types/conversation.ts`：镜像上述模型。
- `hooks/useSessions.ts`：轮询 `list_sessions`（约 5s）。
- `hooks/useSession.ts`：轮询 `read_session(id)`，仅在选中会话时 `enabled`。
- `views/ConversationsView.tsx`：主从布局
  - 左 `components/SessionList.tsx`：按 `projectPath` 分组，显示标题 / 时间 / 消息数（不含精确 token，见 §5）；复用搜索框过滤。
  - 右 `components/SessionDetail.tsx`：
    - 顶部 `components/TokenStats.tsx`：总 input / output / cache + 按 model 分组。
    - `components/MessageTimeline.tsx`：渲染 `events`，按 role 标识；thinking / tool 默认折叠；每条事件 **Pretty / Raw 切换**。
- 复用现有 shadcn 组件（badge / button / input）。

## 4. 数据流

```text
Rust list_sessions（扫 ~/.claude/projects）
  → useSessions（poll 5s）→ SessionList
     选中会话 → useSession(id)（poll 5s, enabled）
       → Rust read_session（逐行解析 JSONL → 归一化）
         → MessageTimeline（Pretty/Raw）+ TokenStats
```

## 5. 性能

- `list_sessions` 摘要尽量轻：用 `stat` 取 mtime（→ `lastActivityAt`），文件只读首行取 `cwd` / `startedAt` / `title`，行数用快速计数得 `messageCount`（粗略）。**列表侧不计算精确 token**，`SessionSummary.totalInputTokens` / `totalOutputTokens` / `models` 在列表场景留默认（0 / 空），仅在 `read_session` 全量解析时填准确值。
- 因此 `SessionList` 只展示标题 / 时间 / 消息数；token 与 model 统计在右侧 detail 的 `TokenStats` 展示。
- `read_session` 才做全量逐行解析，精确计算 token、models、各事件。
- 轮询只针对当前选中会话 + 会话列表，不并发解析全部会话。

## 6. 错误处理

- `~/.claude/projects` 不存在或为空 → 返回空列表，前端显示空态文案，不报错。
- 单行 JSON 解析失败 → 跳过该行，继续解析整个会话，不中断。
- 文件读取失败 → 命令返回 `Err`，前端 Toast 提示（复用现有错误提示模式）。

## 7. 测试

### Rust（cargo test）
- fixture JSONL：包含全部 block 类型 + 一行损坏 JSON → 断言归一化结果正确且跳过损坏行。
- `cwd` 提取正确。
- 标题提取：跳过 command-caveat / meta 包装。
- 空目录 → 空列表。

### 前端（vitest）
- 归一化数据 → MessageTimeline 渲染正确（各 block 类型）。
- Pretty / Raw 切换。
- token 统计纯函数。
- 空态渲染。
- 现有 PortsView 测试不受影响。

## 8. 范围边界（YAGNI）

- 本期**不做**：Codex / OpenCode 实现（仅保留 trait 接入位）、文件 watch 实时 tail、跨项目全局 SQLite 索引/搜索、消息导出。
- 这些为后续迭代候选。
