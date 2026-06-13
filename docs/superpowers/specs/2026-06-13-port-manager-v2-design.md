# Port Manager v2 — 功能增强设计

**日期：** 2026-06-13
**状态：** 已确认

## 概览

在现有 Port Manager 基础上增加四项能力：端口搜索、可执行路径展示、用户进程优先排序、同进程多端口树形聚合。同时修复截图发现的 IPv4/IPv6 重复行 bug。

## 目标

1. **搜索**：按关键字实时过滤端口列表（匹配端口号 / 进程名 / 路径）。
2. **路径展示**：新增"路径"列显示完整可执行路径，避免同名进程误杀。
3. **用户进程优先**：用户启动的进程排在系统进程之前（全部展示，不过滤）。
4. **树形聚合**：同一 PID 占多个端口时聚合为可展开父节点。
5. **去重修复**：同 `(port, pid, protocol)` 的 IPv4/IPv6 条目合并为一条。

## 数据模型变更

### Rust `PortEntry`（`src-tauri/src/commands/ports.rs`）

新增两字段：
```rust
#[serde(rename = "exePath")]
pub exe_path: String,        // 完整可执行路径，取不到则空串
#[serde(rename = "isUserProcess")]
pub is_user_process: bool,   // 当前用户启动的进程为 true
```

### TypeScript `PortEntry`（`src/types/port.ts`）
```typescript
export interface PortEntry {
  port: number;
  protocol: "TCP" | "UDP";
  pid: number;
  processName: string;
  exePath: string;
  isUserProcess: boolean;
  state: string;
}
```

## 后端实现（`ports.rs`）

### 可执行路径
用 `sysinfo` 的 `process.exe()` 取完整路径：
```rust
let exe_path = sys
    .process(Pid::from_u32(pid))
    .and_then(|p| p.exe())
    .map(|path| path.to_string_lossy().into_owned())
    .unwrap_or_default();
```

### 用户进程判断（跨平台）
取当前进程自身的 uid 作为基准，对比每个进程的 uid：
```rust
let current_uid = sysinfo::get_current_pid()
    .ok()
    .and_then(|pid| sys.process(pid))
    .and_then(|p| p.user_id())
    .cloned();

// 每个进程：
let is_user_process = match (&current_uid, proc_user_id) {
    (Some(cur), Some(uid)) => cur == uid,
    _ => false,  // 取不到归为系统进程
};
```
macOS/Linux 用 uid 精确匹配；Windows 上 sysinfo 仍提供 user_id，取不到则退化为系统进程。

### 去重
按 `(port, pid, protocol)` 去重，IPv4/IPv6 同键合并：
```rust
use std::collections::HashSet;
let mut seen: HashSet<(u16, u32, String)> = HashSet::new();
// 在 filter_map 内，构造 entry 前检查：
let key = (port, pid, protocol.clone());
if seen.contains(&key) {
    return None;
}
seen.insert(key);
```
注意：`filter_map` 闭包需可变捕获 `seen`，改用 `for` 循环 + `Vec::push` 或在闭包前用 `let mut seen`。实现时改为显式循环以便 mutable borrow。

### 排序
三级排序：用户进程优先 → LISTEN 优先 → 端口号升序。
```rust
entries.sort_by(|a, b| {
    b.is_user_process.cmp(&a.is_user_process)
        .then_with(|| b.state.starts_with("LISTEN").cmp(&a.state.starts_with("LISTEN")))
        .then_with(|| a.port.cmp(&b.port))
});
```

## 前端实现

### 搜索框
- shadcn `Input` 组件，放在标题/RefreshBar 行下方、表格上方。
- 受控 state `query`（`App.tsx`），占位文案"搜索端口 / 进程名 / 路径"。
- 带清除按钮（query 非空时显示 X 图标）。

### 过滤纯函数（`src/lib/filterPorts.ts`）
```typescript
export function filterPorts(entries: PortEntry[], query: string): PortEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter(
    (e) =>
      String(e.port).includes(q) ||
      e.processName.toLowerCase().includes(q) ||
      e.exePath.toLowerCase().includes(q)
  );
}
```

### 分组纯函数（`src/lib/groupPorts.ts`）
```typescript
export interface PortGroup {
  pid: number;
  processName: string;
  exePath: string;
  isUserProcess: boolean;
  entries: PortEntry[];
}
export function groupPorts(entries: PortEntry[]): PortGroup[];
```
按 PID 聚合。保持输入顺序（输入已由后端排序）。组的展示顺序 = 组内首个 entry 的出现顺序。

### 数据流
`ports`（已排序）→ `filterPorts(query)` → `groupPorts` → `PortTable` 渲染。

### PortTable 渲染规则
表头新增"路径"列：端口 / 协议 / 进程名 / 路径 / PID / 状态 / 操作。

- **单端口组**（`entries.length === 1`）→ 普通行，含 Kill 按钮。
- **多端口组**（`entries.length > 1`）→
  - 父行：展开/折叠图标（lucide `ChevronRight`/`ChevronDown`）+ 进程名 + 路径 + PID + "N 个端口"徽标。**无 Kill 按钮**。整行可点击切换展开。
  - 子行：缩进，显示 端口 / 协议 / 状态 / 各自 Kill。进程名、路径、PID 列留空或弱化（父行已显示）。
- 多端口组**默认展开**。展开状态 `expanded: Set<number>`（pid 集合）存于 PortTable 内部 state，初始包含所有多端口 PID。

### 路径列样式
长路径截断：`className="truncate max-w-[260px]"` + `title={exePath}` 实现 hover 显全文。

### 空状态
区分两种：
- `ports.length === 0` → "未发现监听端口"
- 过滤后为空但有 query → "无匹配结果"

## 测试

### Rust（`ports.rs`）
- `test_dedup_removes_duplicate_ipv4_ipv6`：构造去重逻辑验证（提取去重为可测的辅助函数 `dedup_entries(Vec<PortEntry>) -> Vec<PortEntry>`，或测试 get_ports_internal 返回无重复键）。
- `test_entries_have_exe_path_field`：验证返回的 entry 含 exe_path 字段（可能为空，但结构存在）。
- 保留现有 3 个测试。

### 前端（vitest）
- `filterPorts.test.ts`：空 query 返回全部；按端口号匹配；按进程名匹配；按路径匹配；不区分大小写。
- `groupPorts.test.ts`：多端口同 PID 聚合为一组；单端口不与他人聚合；组内 entries 数正确。
- `PortTable.test.tsx`：新增路径列渲染；多端口父行展开/折叠切换；子行 Kill 回调传正确 entry；单端口行 Kill 回调。

## 文件清单

| 文件 | 变更 |
|------|------|
| `src-tauri/src/commands/ports.rs` | 加 exe_path/is_user_process 字段、去重、排序、新测试 |
| `src/types/port.ts` | 加 exePath/isUserProcess |
| `src/lib/filterPorts.ts` | 新建：搜索过滤纯函数 |
| `src/lib/groupPorts.ts` | 新建：PID 分组纯函数 |
| `src/components/SearchBar.tsx` | 新建：搜索输入框 |
| `src/components/PortTable.tsx` | 重写：路径列 + 树形展开 |
| `src/App.tsx` | 接入 query state、SearchBar、过滤+分组数据流 |
| `src/test/filterPorts.test.ts` | 新建 |
| `src/test/groupPorts.test.ts` | 新建 |
| `src/test/PortTable.test.tsx` | 扩展 |

## 完成后

更新 `CLAUDE.md` 的技术架构部分（新增 lib/ 目录、SearchBar 组件、PortEntry 字段）。
