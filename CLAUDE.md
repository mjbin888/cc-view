# Port Manager — Claude 协作规范

## 文档语言

所有由 superpowers、skills 或 Claude 生成的文档（spec、plan、设计文档、注释文档等）**必须使用中文**。代码、变量名、commit message 保持英文。

## 功能完成后必须更新

每完成一个功能模块后，同步更新本文件中的以下两个部分：
1. **技术架构**
2. **项目启动命令**

有任何结构变动（新增模块、依赖变更、目录调整）立即同步，不得滞后。

---

## 技术架构

```
port-manager/
├── src-tauri/
│   ├── src/
│   │   ├── commands/
│   │   │   ├── ports.rs           # list_ports、kill_port Tauri 命令 + 单元测试
│   │   │   ├── conversations.rs   # 归一化类型 + ClaudeCodeSource + 多源派发命令（list_sessions/read_session 聚合 3 源、按 id 前缀路由）+ 单元测试
│   │   │   ├── codex.rs           # CodexSource：解析 ~/.codex/sessions/**/rollout-*.jsonl + 单元测试
│   │   │   └── opencode.rs        # OpenCodeSource：读取 ~/.local/share/opencode/opencode.db（SQLite）+ 单元测试
│   │   └── lib.rs                 # 注册 Tauri 命令
│   └── Cargo.toml                 # 依赖：netstat2、sysinfo、serde、serde_json、dirs、rusqlite(bundled)、chrono
├── src/
│   ├── views/
│   │   ├── PortsView.tsx          # 端口视图
│   │   └── ConversationsView.tsx  # 会话查看器视图，主从布局
│   ├── components/
│   │   ├── AppSidebar.tsx         # 端口/会话 sidebar 导航
│   │   ├── SourceTabs.tsx         # 会话来源分段控件（Claude Code / Codex / OpenCode 切换）
│   │   ├── ThemeToggle.tsx        # light/dark/system 三态主题切换（侧栏底部）
│   │   ├── PortTable.tsx          # 端口列表（路径列 + PID 树形分组）
│   │   ├── KillDialog.tsx         # Kill 确认弹窗
│   │   ├── RefreshBar.tsx         # 自动刷新开关 + 手动刷新按钮
│   │   ├── SearchBar.tsx          # 搜索框（端口/进程名/路径）
│   │   ├── SessionList.tsx        # 会话列表，按项目分组
│   │   ├── SessionDetail.tsx      # 会话详情
│   │   ├── MessageTimeline.tsx    # 消息时间线，thinking/工具折叠 + Pretty/Raw 切换
│   │   └── TokenStats.tsx         # token 统计
│   ├── contexts/
│   │   └── ThemeProvider.tsx      # light/dark/system 主题 context（持久化 + 跟随系统）
│   ├── hooks/
│   │   ├── usePorts.ts            # TanStack Query 轮询 hook
│   │   ├── useSessions.ts         # 会话列表轮询
│   │   └── useSession.ts          # 选中会话轮询
│   ├── lib/
│   │   ├── filterPorts.ts         # 搜索过滤纯函数（含 cwd/cmd 字段）
│   │   ├── formatDuration.ts      # 运行时长格式化（45s / 12m / 2h 15m / 3d 4h）
│   │   ├── groupPorts.ts          # 按 PID 分组纯函数
│   │   ├── utils.ts               # shadcn cn 工具
│   │   ├── aggregateUsage.ts      # token 聚合
│   │   ├── groupSessionsByProject.ts  # 按项目分组
│   │   ├── filterSessions.ts      # 会话搜索过滤
│   │   ├── buildMessageTree.ts    # 按 parentUuid 还原消息树（分支/旁支）
│   │   └── formatTimestamp.ts     # ISO → 本地 yyyy-MM-dd HH:mm
│   ├── types/
│   │   ├── port.ts                # PortEntry 接口（含 cwd、cmd、runTimeSecs）
│   │   └── conversation.ts        # 会话/事件/Block 类型
│   ├── test/                      # vitest 测试
│   ├── App.tsx                    # layout shell：sidebar + 视图切换
│   └── main.tsx                   # QueryClientProvider 入口
└── CLAUDE.md                      # 本文件
```

v10 增强：**顶部常驻 HUD 状态条**（镜像 CLI claude-hud），三段全部来自当前活跃 CC 会话：Context% | Usage 5h% | Weekly%。三段数据（含 context）只能从 Claude Code 喂给 statusLine 的 stdin 拿到 → 自带 statusline bin（替代 claude-hud，零外部依赖）。`default-run = "tauri-app"` 解决双 bin 下 `cargo run`/`tauri dev` 歧义。新增：`src-tauri/src/snapshot.rs`（UsageSnapshot 共享类型：five_hour/seven_day/context + 原子写/读 + freshness 10min，文件格式兼容 claude-hud externalUsagePath）、`src-tauri/src/commands/usage.rs`（`read_usage_snapshot` 命令）、`src-tauri/src/bin/cc-viewer-statusline.rs`（读 stdin → 抽 context_window.used_percentage + rate_limits → 原子写 `~/.claude/cc-viewer-usage.json` + 终端渲染三段 ANSI bar，永不 panic）。前端：`hooks/useUsageSnapshot.ts`（30s 轮询）、`components/HudMeter.tsx`、`components/HudBar.tsx`（三段读 snapshot，stale 变灰）。`App.tsx` 改纵向布局，HudBar 全宽置顶。注：HUD 反映**实时 CC 状态**，与 CC Viewer 当前选中/浏览的会话无关（选中会话的 token 明细见详情面板 TokenStats）。

v2 增强：端口搜索、可执行路径列、用户进程优先排序、同 PID 多端口树形聚合、IPv4/IPv6 去重。

v3 增强：路径列改为工作目录（cwd），cmd 作为 tooltip；新增运行时长列（runTimeSecs）；搜索范围覆盖 cwd/cmd。

v9 增强：**应用更名 `Port Manager` → `CC Viewer`**（`tauri.conf.json` productName+window title、`index.html` title；identifier 不动以保数据目录）；默认视图改会话。**cc-switch 风扁平重设计**：`index.css` 主色换蓝 `oklch(0.62 0.19 250)`（原近黑）、radius 0.5rem、dark 主题抬亮+微蓝、隐藏滚动条、蓝色 focus-visible ring。**主题系统**：`lib/theme.ts`（纯函数 resolveTheme/readStoredTheme/applyResolved）+ `contexts/ThemeProvider.tsx`（light/dark/system，localStorage 持久化，system 监听 prefers-color-scheme）+ `components/ThemeToggle.tsx`（侧栏底部三态切换）。**codex 大会话卡顿修复**：`useSession` 停历史会话轮询（`refetchInterval:false`+`staleTime:Infinity`，原 5s 重拉重渲染是主因）；`MessageTimeline` 用 `useMemo` 缓存建树、`memo` 包 EventCard、`LazyDetails` 折叠态不挂载 body（大 codex tool_result 不再常驻 DOM）。EventCard 边框淡化+留白。

v8 增强：会话查看器左栏顶部加来源分段控件 `SourceTabs`（Claude Code / Codex / OpenCode），蓝色 pill 高亮当前页，150–300ms transition；`ConversationsView` 按 `source` 字段过滤会话，切换来源时清空选中。移除 v7 的列表内来源徽章（标签页已表达来源，徽章冗余）。设计遵循 ui-ux-pro-max：`nav-state-active`（当前态明显高亮）、`state-transition`、`touch-target` 与语义 token 一致性。

v7 增强：会话查看器接入 **Codex** 与 **OpenCode** 两源。`conversations.rs` 的 `list_sessions` 聚合 Claude/Codex/OpenCode 三源并按 `lastActivityAt` 排序，`read_session` 按 `id` 前缀（`codex:`/`opencode:`/默认 `claude-code`）路由。Codex 读 `~/.codex/sessions/**/rollout-*.jsonl`（`response_item` 的 message/reasoning/function_call/function_call_output → Block；`token_count` 末条 → 总 token），无 uuid 故合成 `codex-N` 线性父链。OpenCode 读 SQLite `opencode.db`（`session`/`message`/`part` 表，只读 `mode=ro&immutable=1` 防 WAL 锁；epoch 毫秒经 `chrono` 转 ISO；`part.type` text/reasoning/tool → Block，tool 拆 ToolUse+ToolResult），合成 `opencode-<msgId>` 父链。前端 `SessionList` 对非 claude-code 会话显示来源徽章；类型/时间线层零改（源无关归一化）。新增依赖：`rusqlite`(bundled)、`chrono`。

v6 增强：会话列表选中态高亮（左侧主色竖条 + bg-accent + 加粗，参考 cc-switch）；全部时间戳统一为本地 `yyyy-MM-dd HH:mm`（`formatTimestamp`）；详情头部加「展开/折叠全部」单按钮（控制 thinking/tool/旁支折叠，seq 自增 key 强制覆盖个别手动态）；新增 `redacted_thinking` block（后端识别，前端显示「🔒 已加密思考（不可见）」占位）。

v5 增强：`NormEvent` 新增 `parentUuid`（指向父事件 uuid，根节点为空）与 `isSidechain`（subagent 旁支标记）字段；`MessageTimeline` 由扁平列表改为按 `parentUuid` 还原树形渲染（`lib/buildMessageTree.ts`），仅在分支点（rewind/编辑）缩进、线性链保持平铺，subagent 旁支整棵折叠。

v4 增强：新增「会话查看器」视图（sidebar 切换 端口/会话）；读取本地 Claude Code 会话（~/.claude/projects/*/*.jsonl），归一化为消息时间线；支持 thinking/工具调用折叠、Pretty/Raw 原始 payload 切换、token 统计（含按 model 分组）；轮询自动刷新（5s）；后端 TranscriptSource trait 预留 Codex/OpenCode 接入。

### 数据流

```
Rust list_ports
  └─ netstat2 读取系统 socket 表
  └─ sysinfo 解析 PID → 进程名
      ↓
Frontend usePorts (TanStack Query, 3s 轮询)
      ↓
PortTable 展示 → Kill 按钮
      ↓
KillDialog 确认 → invoke kill_port(pid)
      ↓
Toast 提示 → 刷新列表
```

```
Rust list_sessions (扫 ~/.claude/projects/*/*.jsonl)
      ↓
useSessions (TanStack Query, 5s 轮询)
      ↓
SessionList (按项目分组 + 搜索) → 选中会话
      ↓
useSession(id) → Rust read_session (JSONL 逐行 → 归一化 NormEvent)
      ↓
SessionDetail → TokenStats + MessageTimeline (Pretty/Raw 切换)
```

### 核心依赖

| 层级 | 依赖 |
|------|------|
| Rust | netstat2 0.11, sysinfo 0.39, serde 1, serde_json, dirs, rusqlite 0.31 (bundled), chrono 0.4 |
| 前端框架 | React 19, TypeScript, Vite 7 |
| UI | TailwindCSS, shadcn/ui, lucide-react |
| 状态 | TanStack Query v5 |
| 测试 | vitest, @testing-library/react |
| 桌面 | Tauri 2.x |

---

## 项目启动命令

```bash
# 进入项目目录
cd /Users/pciswork/mywork/AI/my-tools/port-manager

# 安装前端依赖（首次）
npm install

# 开发模式（热更新）
npm run tauri dev

# 前端单元测试
npm run test -- --run

# Rust 单元测试
cd src-tauri && cargo test

# 生产构建
npm run tauri build

# 编译 statusline helper（HUD 用量数据源）
cd src-tauri && cargo build --release --bin cc-viewer-statusline
# 产物：src-tauri/target/release/cc-viewer-statusline
```

### HUD statusline 安装（手动，替代 claude-hud）

`Usage 5h% / Weekly%` 数据只能从 Claude Code 喂给 statusLine 的 stdin 拿到，故需把自带 helper 设为 statusLine：

```bash
# 1. 备份现有 settings.json
cp ~/.claude/settings.json ~/.claude/settings.json.bak-hud

# 2. 把 ~/.claude/settings.json 的 statusLine 改为（路径用上面 cargo build 的产物绝对路径）：
#    "statusLine": {
#      "type": "command",
#      "command": "/绝对路径/port-manager/src-tauri/target/release/cc-viewer-statusline"
#    }

# 3. 开一个 Claude Code 会话验证：终端出现三段 bar，且生成 ~/.claude/cc-viewer-usage.json
```

CC Viewer 顶部 HUD 轮询读该 snapshot；无近期 CC 会话（snapshot 陈旧）时 Usage/Weekly 段变灰。

---

## 扩展规范

- 新功能模块在 `src-tauri/src/commands/` 下新建文件，不改现有文件
- 前端新功能组件放 `src/components/`，hook 放 `src/hooks/`
- 左侧 sidebar 导航预留给后期功能集成（参考 cc-switch 布局）
