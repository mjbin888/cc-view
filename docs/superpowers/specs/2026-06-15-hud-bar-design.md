# CC Viewer 顶部 HUD 状态条 — 设计文档

日期：2026-06-15
状态：待评审

## 1. 背景与目标

参考 `claude-hud`（Claude Code 终端 statusline 插件）的展示效果，在 CC Viewer 桌面应用顶部加一条常驻 HUD 状态条，展示三段指标：

- **Context%** — 当前选中会话的上下文窗口填充度
- **Usage 5h%** — 账号 5 小时滚动用量配额 + 重置倒计时
- **Weekly%** — 账号 7 天滚动用量配额 + 重置倒计时

视觉参考（claude-hud 终端效果）：

```
[Opus 4.8] | port-manager git:(master*)
Context ▆▆ 22% | Usage ▆▆▆ 70% (resets in 44m) | Weekly ▆ 28% (resets in 4d 2h)
```

**核心约束：完全自包含，不依赖 claude-hud 或任何其他应用。**

## 2. 关键技术约束（必须先理解）

`rate_limits`（5h/weekly 用量）数据**只存在于 Claude Code 喂给 statusLine 命令的 stdin JSON 里**。Claude Code 不把它写到磁盘任何地方，会话 JSONL 里也没有。

stdin JSON 关键字段（来自 claude-hud README 字段规范）：

| 字段 | 含义 |
|---|---|
| `model.display_name` | 当前模型名 |
| `context_window.current_usage.input_tokens` | 当前 token 数 |
| `context_window.context_window_size` | 上下文窗口最大值 |
| `context_window.used_percentage` | 上下文已用百分比（原生，非估算） |
| `rate_limits.five_hour.used_percentage` / `.resets_at` | 5h 配额 % / 重置时间 |
| `rate_limits.seven_day.used_percentage` / `.resets_at` | 7d 配额 % / 重置时间 |
| `cwd` | 当前工作目录 |

**推论：** 想拿到 `rate_limits`，唯一本地途径是"成为 statusLine 消费者"。绕开 statusline 的唯一选择是调 Anthropic OAuth usage API（读 keychain 凭证 + 未公开端点，脆弱），**已否决**。

**结论：** 我们自己写一个 statusline 脚本，替掉 claude-hud。脚本双职责——既在终端渲染三段 bar（终端体验不丢），又把 rate_limits 写成 snapshot 文件供 CC Viewer 读取。零 claude-hud 依赖。

## 3. 数据来源（三段）

| 段 | 来源 | 计算方式 |
|---|---|---|
| **Context%** | 选中会话 JSONL（前端已有数据） | 最后一条 assistant 的 `usage`(input + cache_read + cache_creation) ÷ 上下文窗口。窗口按 model 映射，默认 200000，`[1m]` / 1M 会话取 1000000。无选中会话或非 Claude 源 → 显示 `—` |
| **Usage 5h%** | snapshot 文件 | 直读 `five_hour.used_percentage` + `resets_at` 倒计时 |
| **Weekly%** | snapshot 文件 | 直读 `seven_day.used_percentage` + `resets_at` 倒计时 |

注意：Context% 在 app 里指"选中会话"，与终端脚本里渲染的"当前活跃会话 context%"是两个不同口径，各自合理。

snapshot 文件路径：`~/.claude/cc-viewer-usage.json`
snapshot 格式（复用 claude-hud 的 `ExternalUsageSnapshot` 结构，附带好处：此文件还能反过来喂 claude-hud 的 `externalUsagePath` fallback）：

```json
{
  "updated_at": "2026-06-15T14:00:00Z",
  "five_hour": { "used_percentage": 70, "resets_at": "2026-06-15T14:44:00Z" },
  "seven_day": { "used_percentage": 28, "resets_at": "2026-06-19T16:00:00Z" }
}
```

## 4. 组件设计

### 4.1 statusline 脚本（Rust bin）

新文件 `src-tauri/src/bin/statusline.rs`，作为第二个 cargo bin target（`tauri build` 同时产出 app 与此 helper），选 Rust 原因：契合现有栈、复用 serde 依赖、无 node/python 运行时依赖、纯自包含。

职责：
1. 从 stdin 读 JSON（serde_json 宽松解析，字段缺失不报错）
2. 原子写 `~/.claude/cc-viewer-usage.json`（写 tmp 文件 + rename），内容为第 3 节 snapshot 格式
3. 渲染 ANSI 三段 bar 到 stdout，复刻第 1 节视觉：
   - line1：`[<model>] | <cwd basename> git:(<branch><dirty?*>)`
   - line2：`Context <bar> NN% | Usage <bar> NN% (resets in …) | Weekly <bar> NN% (resets in …)`
4. **健壮性：任何 parse / 写盘 / git 调用失败都不 panic**，降级为打印最简单一行（至少 model + cwd），保证终端 statusLine 永不崩。

snapshot 结构体抽到共享 module `src-tauri/src/commands/usage_snapshot.rs`（或 `src-tauri/src/snapshot.rs`），bin 与 app 的读命令共用同一 struct + 路径常量。

倒计时格式复用 `formatDuration` 风格（`44m` / `4d 2h`），Rust 侧单独实现一份小工具。

### 4.2 后端读命令（Rust）

新文件 `src-tauri/src/commands/usage.rs`（遵守"新功能新建文件，不改现有"规范）：
- `read_usage_snapshot() -> Option<UsageSnapshot>`：读 + 解析 `~/.claude/cc-viewer-usage.json`；带 freshness 判断（`updated_at` 超过约 10min 标记 `stale: true`）。复用 `dirs` crate。
- `lib.rs` 注册命令（这是对现有文件的必要最小改动：加一行 `invoke_handler` 注册）。

返回结构：
```rust
struct UsageSnapshot {
    five_hour: Option<RateWindow>,   // used_percentage, resets_at
    seven_day: Option<RateWindow>,
    updated_at: String,
    stale: bool,
}
```

### 4.3 前端

- `src/lib/contextUsage.ts` — 纯函数：`events → { usedTokens, windowSize, percent }`。含 `model → 窗口大小` 映射表。单测覆盖。
- `src/hooks/useUsageSnapshot.ts` — TanStack Query 轮询（约 30s）invoke `read_usage_snapshot`，复用现有 polling 模式。
- `src/components/HudMeter.tsx` — 单段：label + 迷你进度条 + 百分比 + 可选 reset 倒计时副文本。
- `src/components/HudBar.tsx` — 顶部全宽条，3 个 `HudMeter`。snapshot `stale` 时 Usage/Weekly 段变灰 + tooltip 提示"无近期 CC 会话 / 请按文档配置 statusLine"。
- `src/contexts/SelectedSessionContext.tsx` — 把选中会话 id（及其 events / model）提到 App 层，避免 prop drilling；`ConversationsView` 与 `HudBar` 共用。
- `App.tsx` — 在 `<main>` 上方挂 `HudBar`（全宽），用 `SelectedSessionContext.Provider` 包裹。Ports 视图下无选中会话 → Context 段显示 `—`。

倒计时：客户端按 `resets_at - now` 计算，挂一个 60s tick（`useNow`）或随轮询刷新。

## 5. 数据流

```
Claude Code 刷新 statusLine
  └─ 把 JSON 喂给 cc-viewer-statusline (stdin)
        ├─ 渲染三段 bar → 终端 stdout
        └─ 原子写 ~/.claude/cc-viewer-usage.json
                ↓
CC Viewer: useUsageSnapshot (TanStack Query, ~30s 轮询)
  └─ invoke read_usage_snapshot → 读 JSON + freshness
                ↓
HudBar: Usage/Weekly 段 ← snapshot
        Context 段 ← contextUsage(选中会话 events)  [SelectedSessionContext]
```

## 6. 安装（用户手动，带备份）

提供：
1. 编译出的 statusline binary 路径（dev: `target/debug/cc-viewer-statusline`；release: `target/release/cc-viewer-statusline`）
2. 确切的 `settings.json` `statusLine.command` 替换值
3. 备份步骤：先 `cp ~/.claude/settings.json ~/.claude/settings.json.bak-hud`

**app 不自动改 settings.json**（风险高，YAGNI）。安装后开一个 CC 会话验证终端 HUD 正常 + snapshot 文件生成。

## 7. 测试

- `contextUsage` 纯函数单测（vitest）：含 200k / 1M 窗口、缺 usage、多 model。
- `usage.rs` snapshot 解析单测（cargo）：正常 / stale / 文件缺失 / 字段缺失 fixture。
- `statusline.rs` 渲染单测（cargo）：给定 stdin JSON → 验证 snapshot 输出结构 + bar 字符串包含预期百分比；缺字段降级不 panic。
- `HudMeter` 渲染单测（vitest）：进度条宽度对应百分比、stale 变灰。

## 8. 范围外（YAGNI）

- 不在 app 内改 settings.json（writer 装机走文档 + 手动）。
- 不调 Anthropic OAuth usage API。
- 不依赖 claude-hud / ccusage / 任何外部应用或运行时（node/python）。
- 不做历史用量趋势图（仅当前快照）。
