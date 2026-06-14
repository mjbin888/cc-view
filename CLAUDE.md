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
│   │   │   └── conversations.rs   # list_sessions、read_session Tauri 命令 + JSONL 解析 + 单元测试
│   │   └── lib.rs                 # 注册 Tauri 命令
│   └── Cargo.toml                 # 依赖：netstat2、sysinfo、serde、serde_json、dirs
├── src/
│   ├── views/
│   │   ├── PortsView.tsx          # 端口视图
│   │   └── ConversationsView.tsx  # 会话查看器视图，主从布局
│   ├── components/
│   │   ├── AppSidebar.tsx         # 端口/会话 sidebar 导航
│   │   ├── PortTable.tsx          # 端口列表（路径列 + PID 树形分组）
│   │   ├── KillDialog.tsx         # Kill 确认弹窗
│   │   ├── RefreshBar.tsx         # 自动刷新开关 + 手动刷新按钮
│   │   ├── SearchBar.tsx          # 搜索框（端口/进程名/路径）
│   │   ├── SessionList.tsx        # 会话列表，按项目分组
│   │   ├── SessionDetail.tsx      # 会话详情
│   │   ├── MessageTimeline.tsx    # 消息时间线，thinking/工具折叠 + Pretty/Raw 切换
│   │   └── TokenStats.tsx         # token 统计
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
│   │   └── filterSessions.ts      # 会话搜索过滤
│   ├── types/
│   │   ├── port.ts                # PortEntry 接口（含 cwd、cmd、runTimeSecs）
│   │   └── conversation.ts        # 会话/事件/Block 类型
│   ├── test/                      # vitest 测试
│   ├── App.tsx                    # layout shell：sidebar + 视图切换
│   └── main.tsx                   # QueryClientProvider 入口
└── CLAUDE.md                      # 本文件
```

v2 增强：端口搜索、可执行路径列、用户进程优先排序、同 PID 多端口树形聚合、IPv4/IPv6 去重。

v3 增强：路径列改为工作目录（cwd），cmd 作为 tooltip；新增运行时长列（runTimeSecs）；搜索范围覆盖 cwd/cmd。

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
| Rust | netstat2 0.11, sysinfo 0.39, serde 1, serde_json, dirs |
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
```

---

## 扩展规范

- 新功能模块在 `src-tauri/src/commands/` 下新建文件，不改现有文件
- 前端新功能组件放 `src/components/`，hook 放 `src/hooks/`
- 左侧 sidebar 导航预留给后期功能集成（参考 cc-switch 布局）
