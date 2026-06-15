# Port Manager v3 设计文档

## 概述

v3 新增两个功能：

1. **工作目录 + 启动命令**：将"路径"列从二进制可执行路径（如 `.nvm/.../node`）改为进程工作目录（如 `/Users/foo/myproject`），并将完整启动命令（如 `node vite.js`）作为 tooltip 显示。
2. **运行时长列**：新增"时长"列，展示进程已运行时间，格式为人类可读（如 `45s`、`12m`、`2h 15m`、`3d 4h`）。

---

## 背景

用户发现端口 1420 的路径列显示 `/Users/pciswork/.nvm/versions/node/v22.../bin/node`，这是 Node.js 二进制的安装路径，而非实际项目目录，无法帮助识别是哪个项目在运行该端口。

`sysinfo` 提供三个相关字段：
- `process.exe()` → 二进制路径（v2 已有，不够有用）
- `process.cwd()` → 进程工作目录（项目根目录，v3 主显）
- `process.cmd()` → 启动命令参数列表（`argv`，v3 辅显）
- `process.run_time()` → 进程已运行秒数（v3 新列）

---

## 功能 1：工作目录 + 启动命令

### 后端变更（`ports.rs`）

`PortEntry` 新增两个字段：

```rust
pub cwd: String,   // process.cwd().to_string_lossy()，空则为 ""
pub cmd: String,   // process.cmd() join(" ")，空则为 ""
```

获取逻辑：

```rust
let cwd = process
    .and_then(|p| p.cwd())
    .map(|path| path.to_string_lossy().into_owned())
    .unwrap_or_default();

let cmd = process
    .map(|p| p.cmd()
        .iter()
        .map(|s| s.to_string_lossy())
        .collect::<Vec<_>>()
        .join(" "))
    .unwrap_or_default();
```

保留原有 `exe_path` 字段不删除（数据层完整性），但前端不再作为主显列。

### 前端类型变更（`port.ts`）

```typescript
export interface PortEntry {
  port: number;
  protocol: "TCP" | "UDP";
  pid: number;
  processName: string;
  exePath: string;       // 保留，不主显
  cwd: string;           // 新增：工作目录（主显）
  cmd: string;           // 新增：启动命令（tooltip）
  isUserProcess: boolean;
  state: string;
  runTimeSecs: number;   // 新增（见功能 2）
}
```

### 前端展示变更（`PortTable.tsx`）

- 列名"路径"保持，内容改为 `cwd`（`cwd` 空时 fallback 到 `exePath`）
- 单元格 `title` 属性改为显示 `cmd`（鼠标悬停时展示完整启动命令）
- `PathCell` 组件签名变更：接收 `cwd`、`exePath`、`cmd` 三个 prop

```tsx
function PathCell({ cwd, exePath, cmd }: { cwd: string; exePath: string; cmd: string }) {
  const display = cwd || exePath || "—";
  return (
    <span
      className="block truncate max-w-[260px] text-muted-foreground"
      title={cmd || display}
    >
      {display}
    </span>
  );
}
```

### 搜索过滤变更（`filterPorts.ts`）

搜索范围增加 `cwd` 和 `cmd` 字段：

```typescript
return entries.filter(e =>
  String(e.port).includes(q) ||
  e.processName.toLowerCase().includes(q) ||
  e.exePath.toLowerCase().includes(q) ||
  e.cwd.toLowerCase().includes(q) ||
  e.cmd.toLowerCase().includes(q)
);
```

### `groupPorts.ts` 变更

`PortGroup` 新增 `cwd` 和 `cmd` 字段，与 `PortEntry` 保持一致：

```typescript
export interface PortGroup {
  pid: number;
  processName: string;
  exePath: string;
  cwd: string;
  cmd: string;
  isUserProcess: boolean;
  entries: PortEntry[];
}
```

---

## 功能 2：运行时长列

### 后端变更（`ports.rs`）

`PortEntry` 新增字段：

```rust
#[serde(rename = "runTimeSecs")]
pub run_time_secs: u64,  // process.run_time()，进程不存在则为 0
```

获取逻辑：

```rust
let run_time_secs = process
    .map(|p| p.run_time())
    .unwrap_or(0);
```

### 前端纯函数（`src/lib/formatDuration.ts`）

```typescript
export function formatDuration(secs: number): string {
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hours < 24) return remMins > 0 ? `${hours}h ${remMins}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
}
```

输出示例：

| 秒数 | 显示 |
|------|------|
| 45 | `45s` |
| 720 | `12m` |
| 8100 | `2h 15m` |
| 7200 | `2h` |
| 273600 | `3d 4h` |
| 0 | `0s` |

### 前端展示（`PortTable.tsx`）

列顺序（共 8 列）：

| 端口 | 协议 | 进程名 | 路径（cwd） | 时长 | PID | 状态 | 操作 |
|------|------|--------|-------------|------|-----|------|------|

- 时长列宽：`w-24`
- 显示值：`formatDuration(entry.runTimeSecs)`，`runTimeSecs` 为 0 时显示 `—`
- 多端口父行：`colSpan` 由 2 调整，时长列显示空单元格（子行各自显示对应值）

---

## 数据流

```
Rust get_ports_internal
  └─ process.cwd()     → cwd
  └─ process.cmd()     → cmd (join " ")
  └─ process.run_time() → run_time_secs
      ↓
Frontend PortEntry (含 cwd, cmd, runTimeSecs)
      ↓
filterPorts (搜索范围含 cwd + cmd)
      ↓
groupPorts (PortGroup 含 cwd, cmd)
      ↓
PortTable
  └─ PathCell: 主显 cwd，tooltip 显示 cmd
  └─ 时长列: formatDuration(runTimeSecs)
```

---

## 测试计划

### Rust 单元测试（`ports.rs`）

新增断言：
- `entry.cwd` 字段可访问（类型验证）
- `entry.cmd` 字段可访问（类型验证）
- `entry.run_time_secs` 字段类型为 `u64`

### 前端单元测试

**`formatDuration.test.ts`（新建）**：覆盖所有档位
- `0s` 边界
- `<60s`
- `<60m`
- 整点小时（无分钟）
- 小时+分钟
- 整天（无小时）
- 天+小时

**`filterPorts.test.ts`（更新）**：
- 按 `cwd` 搜索命中
- 按 `cmd` 搜索命中
- mock 数据补充 `cwd`、`cmd`、`runTimeSecs` 字段

**`groupPorts.test.ts`（更新）**：
- `PortGroup` 含 `cwd`、`cmd` 字段

**`PortTable.test.tsx`（更新）**：
- "路径"列显示 `cwd` 而非 `exePath`
- `cwd` 为空时 fallback 到 `exePath`
- `title` 属性显示 `cmd`
- "时长"列渲染（`formatDuration` 输出）
- mock 数据补充所有新字段

---

## 不在本次范围内

- 时长列排序（点击排序）
- 自动刷新时时长实时递增（每次刷新由后端重新读取）
- `cmd` 以独立列展示（仅 tooltip）
- `exePath` 列重新显示

---

## CLAUDE.md 更新

完成后同步更新：
- 技术架构：`lib/formatDuration.ts` 新文件
- `PortEntry` 接口字段变更说明
- 核心依赖表中 sysinfo 版本注释（实际为 0.39，非文档中的 0.30）
