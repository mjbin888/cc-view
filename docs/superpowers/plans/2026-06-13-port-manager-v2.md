# Port Manager v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add port search, executable-path display, user-process-priority sorting, and same-PID tree grouping to Port Manager; fix the IPv4/IPv6 duplicate-row bug.

**Architecture:** Rust backend gains two `PortEntry` fields (`exe_path`, `is_user_process`), deduplicates by `(port, pid, protocol)`, and sorts user-processes first. Frontend adds two pure functions (`filterPorts`, `groupPorts`), a `SearchBar`, and rewrites `PortTable` to render multi-port PIDs as collapsible tree nodes.

**Tech Stack:** Tauri 2.x, Rust (netstat2 0.11, sysinfo 0.39), React 19, TypeScript, shadcn/ui, TanStack Query v5, vitest

**Working directory:** `/Users/pciswork/mywork/AI/my-tools/port-manager`

**Note:** `cargo` may not be on PATH in fresh shells. Prefix Rust commands with `source "$HOME/.cargo/env" &&` if `cargo` is not found.

---

## File Map

| File | Responsibility |
|------|---------------|
| `src-tauri/src/commands/ports.rs` | Add exe_path/is_user_process, dedup, user-first sort, new tests |
| `src/types/port.ts` | Add exePath, isUserProcess fields |
| `src/lib/filterPorts.ts` | NEW — pure search filter |
| `src/lib/groupPorts.ts` | NEW — pure PID grouping |
| `src/components/SearchBar.tsx` | NEW — search input with clear button |
| `src/components/PortTable.tsx` | Rewrite — path column + collapsible tree |
| `src/App.tsx` | Wire query state, SearchBar, filter+group pipeline |
| `src/test/filterPorts.test.ts` | NEW |
| `src/test/groupPorts.test.ts` | NEW |
| `src/test/PortTable.test.tsx` | Extend for path column + tree |
| `CLAUDE.md` | Update architecture section |

---

## Task 1: Backend — add fields, dedup, user-first sort

**Files:**
- Modify: `src-tauri/src/commands/ports.rs`

- [ ] **Step 1: Write failing tests**

Replace the entire `#[cfg(test)] mod tests { ... }` block at the bottom of `src-tauri/src/commands/ports.rs` with:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_list_ports_returns_ok() {
        let result = get_ports_internal();
        assert!(result.is_ok(), "get_ports_internal failed: {:?}", result.err());
    }

    #[test]
    fn test_list_ports_entries_have_valid_ports() {
        let entries = get_ports_internal().unwrap();
        for entry in &entries {
            assert!(entry.port > 0, "port should be > 0");
            assert!(
                entry.protocol == "TCP" || entry.protocol == "UDP",
                "protocol must be TCP or UDP"
            );
        }
    }

    #[test]
    fn test_kill_nonexistent_pid_returns_err() {
        let result = kill_port_internal(0);
        assert!(result.is_err(), "killing PID 0 should return Err");
    }

    #[test]
    fn test_list_ports_no_duplicate_keys() {
        let entries = get_ports_internal().unwrap();
        let mut seen = std::collections::HashSet::new();
        for e in &entries {
            let key = (e.port, e.pid, e.protocol.clone());
            assert!(
                seen.insert(key),
                "duplicate (port,pid,protocol) found: {} {} {}",
                e.port, e.pid, e.protocol
            );
        }
    }

    #[test]
    fn test_entries_carry_new_fields() {
        // Compiles only if PortEntry has exe_path and is_user_process.
        let entries = get_ports_internal().unwrap();
        for e in &entries {
            let _ = &e.exe_path;
            let _ = e.is_user_process;
        }
    }

    #[test]
    fn test_user_processes_sorted_first() {
        let entries = get_ports_internal().unwrap();
        // Once a system process appears, no user process may follow it.
        let mut seen_system = false;
        for e in &entries {
            if !e.is_user_process {
                seen_system = true;
            } else {
                assert!(
                    !seen_system,
                    "user process appeared after a system process — sort is wrong"
                );
            }
        }
    }
}
```

- [ ] **Step 2: Run tests to confirm they fail to compile**

```bash
cd src-tauri && cargo test commands::ports 2>&1 | head -30
```

Expected: COMPILE ERROR — `no field exe_path on type PortEntry` (the struct doesn't have the new fields yet).

- [ ] **Step 3: Add the two new struct fields**

Replace the `PortEntry` struct (lines 5-13) with:

```rust
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PortEntry {
    pub port: u16,
    pub protocol: String,
    pub pid: u32,
    #[serde(rename = "processName")]
    pub process_name: String,
    #[serde(rename = "exePath")]
    pub exe_path: String,
    #[serde(rename = "isUserProcess")]
    pub is_user_process: bool,
    pub state: String,
}
```

- [ ] **Step 4: Rewrite get_ports_internal**

Replace the entire `get_ports_internal` function (the `pub fn get_ports_internal() -> Result<Vec<PortEntry>, String> { ... }` block) with:

```rust
pub fn get_ports_internal() -> Result<Vec<PortEntry>, String> {
    let af_flags = AddressFamilyFlags::IPV4 | AddressFamilyFlags::IPV6;
    let proto_flags = ProtocolFlags::TCP | ProtocolFlags::UDP;

    let sockets = get_sockets_info(af_flags, proto_flags).map_err(|e| e.to_string())?;

    let sys = System::new_all();

    // Current user's uid — basis for is_user_process comparison.
    let current_uid = sysinfo::get_current_pid()
        .ok()
        .and_then(|pid| sys.process(pid))
        .and_then(|p| p.user_id())
        .cloned();

    let mut seen: std::collections::HashSet<(u16, u32, String)> = std::collections::HashSet::new();
    let mut entries: Vec<PortEntry> = Vec::new();

    for si in sockets {
        let pid = match si.associated_pids.first() {
            Some(p) => *p,
            None => continue,
        };

        let (port, protocol, state) = match &si.protocol_socket_info {
            ProtocolSocketInfo::Tcp(tcp) => {
                (tcp.local_port, "TCP".to_string(), format!("{}", tcp.state))
            }
            ProtocolSocketInfo::Udp(udp) => {
                (udp.local_port, "UDP".to_string(), "N/A".to_string())
            }
        };

        // skip unbound sockets with port 0
        if port == 0 {
            continue;
        }

        // dedup IPv4/IPv6 collapse on identical (port, pid, protocol)
        let key = (port, pid, protocol.clone());
        if !seen.insert(key) {
            continue;
        }

        let process = sys.process(Pid::from_u32(pid));

        let process_name = process
            .map(|p| p.name().to_string_lossy().into_owned())
            .unwrap_or_else(|| "unknown".to_string());

        let exe_path = process
            .and_then(|p| p.exe())
            .map(|path| path.to_string_lossy().into_owned())
            .unwrap_or_default();

        let is_user_process = match (&current_uid, process.and_then(|p| p.user_id())) {
            (Some(cur), Some(uid)) => cur == uid,
            _ => false,
        };

        entries.push(PortEntry {
            port,
            protocol,
            pid,
            process_name,
            exe_path,
            is_user_process,
            state,
        });
    }

    // user processes first, then LISTEN first, then by port number
    entries.sort_by(|a, b| {
        b.is_user_process
            .cmp(&a.is_user_process)
            .then_with(|| {
                b.state
                    .starts_with("LISTEN")
                    .cmp(&a.state.starts_with("LISTEN"))
            })
            .then_with(|| a.port.cmp(&b.port))
    });

    Ok(entries)
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
cd src-tauri && cargo test commands::ports 2>&1 | tail -15
```

Expected: 6 tests pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/pciswork/mywork/AI/my-tools/port-manager
git add src-tauri/src/commands/ports.rs
git commit -m "feat: add exe path, user-process flag, dedup, user-first sort"
```

---

## Task 2: TypeScript PortEntry type

**Files:**
- Modify: `src/types/port.ts`

- [ ] **Step 1: Update interface**

Replace the full contents of `src/types/port.ts` with:

```typescript
// src/types/port.ts
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

- [ ] **Step 2: Commit**

```bash
git add src/types/port.ts
git commit -m "feat: add exePath and isUserProcess to PortEntry type"
```

---

## Task 3: filterPorts pure function

**Files:**
- Create: `src/lib/filterPorts.ts`
- Create: `src/test/filterPorts.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/test/filterPorts.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { filterPorts } from "../lib/filterPorts";
import { PortEntry } from "../types/port";

const entries: PortEntry[] = [
  { port: 3000, protocol: "TCP", pid: 1, processName: "node", exePath: "/usr/bin/node", isUserProcess: true, state: "LISTEN" },
  { port: 5432, protocol: "TCP", pid: 2, processName: "postgres", exePath: "/opt/pg/bin/postgres", isUserProcess: false, state: "LISTEN" },
  { port: 8080, protocol: "TCP", pid: 3, processName: "java", exePath: "/Library/Java/bin/java", isUserProcess: true, state: "LISTEN" },
];

describe("filterPorts", () => {
  it("returns all entries for empty query", () => {
    expect(filterPorts(entries, "")).toHaveLength(3);
    expect(filterPorts(entries, "   ")).toHaveLength(3);
  });

  it("matches by port number substring", () => {
    const r = filterPorts(entries, "3000");
    expect(r).toHaveLength(1);
    expect(r[0].port).toBe(3000);
  });

  it("matches by process name case-insensitively", () => {
    const r = filterPorts(entries, "POSTGRES");
    expect(r).toHaveLength(1);
    expect(r[0].processName).toBe("postgres");
  });

  it("matches by exe path", () => {
    const r = filterPorts(entries, "/library/java");
    expect(r).toHaveLength(1);
    expect(r[0].processName).toBe("java");
  });

  it("returns empty array when nothing matches", () => {
    expect(filterPorts(entries, "zzz")).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm run test -- --run filterPorts 2>&1 | tail -10
```

Expected: FAIL — cannot find module `../lib/filterPorts`.

- [ ] **Step 3: Implement filterPorts**

Create `src/lib/filterPorts.ts`:

```typescript
// src/lib/filterPorts.ts
import { PortEntry } from "../types/port";

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

- [ ] **Step 4: Run test to confirm it passes**

```bash
npm run test -- --run filterPorts 2>&1 | tail -10
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/filterPorts.ts src/test/filterPorts.test.ts
git commit -m "feat: add filterPorts pure function with tests"
```

---

## Task 4: groupPorts pure function

**Files:**
- Create: `src/lib/groupPorts.ts`
- Create: `src/test/groupPorts.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/test/groupPorts.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { groupPorts } from "../lib/groupPorts";
import { PortEntry } from "../types/port";

const entries: PortEntry[] = [
  { port: 5000, protocol: "TCP", pid: 1229, processName: "ControlCenter", exePath: "/System/CC", isUserProcess: false, state: "LISTEN" },
  { port: 7000, protocol: "TCP", pid: 1229, processName: "ControlCenter", exePath: "/System/CC", isUserProcess: false, state: "LISTEN" },
  { port: 3000, protocol: "TCP", pid: 42, processName: "node", exePath: "/usr/bin/node", isUserProcess: true, state: "LISTEN" },
];

describe("groupPorts", () => {
  it("aggregates same-PID entries into one group", () => {
    const groups = groupPorts(entries);
    const cc = groups.find((g) => g.pid === 1229);
    expect(cc).toBeDefined();
    expect(cc!.entries).toHaveLength(2);
    expect(cc!.processName).toBe("ControlCenter");
  });

  it("keeps single-port PID as its own group of one", () => {
    const groups = groupPorts(entries);
    const node = groups.find((g) => g.pid === 42);
    expect(node).toBeDefined();
    expect(node!.entries).toHaveLength(1);
  });

  it("produces one group per distinct PID", () => {
    const groups = groupPorts(entries);
    expect(groups).toHaveLength(2);
  });

  it("preserves first-seen order of groups", () => {
    const groups = groupPorts(entries);
    expect(groups[0].pid).toBe(1229);
    expect(groups[1].pid).toBe(42);
  });

  it("returns empty array for empty input", () => {
    expect(groupPorts([])).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm run test -- --run groupPorts 2>&1 | tail -10
```

Expected: FAIL — cannot find module `../lib/groupPorts`.

- [ ] **Step 3: Implement groupPorts**

Create `src/lib/groupPorts.ts`:

```typescript
// src/lib/groupPorts.ts
import { PortEntry } from "../types/port";

export interface PortGroup {
  pid: number;
  processName: string;
  exePath: string;
  isUserProcess: boolean;
  entries: PortEntry[];
}

export function groupPorts(entries: PortEntry[]): PortGroup[] {
  const map = new Map<number, PortGroup>();
  for (const e of entries) {
    const existing = map.get(e.pid);
    if (existing) {
      existing.entries.push(e);
    } else {
      map.set(e.pid, {
        pid: e.pid,
        processName: e.processName,
        exePath: e.exePath,
        isUserProcess: e.isUserProcess,
        entries: [e],
      });
    }
  }
  return Array.from(map.values());
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npm run test -- --run groupPorts 2>&1 | tail -10
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/groupPorts.ts src/test/groupPorts.test.ts
git commit -m "feat: add groupPorts pure function with tests"
```

---

## Task 5: SearchBar component

**Files:**
- Create: `src/components/SearchBar.tsx`

Check first whether shadcn `input` exists:

- [ ] **Step 1: Ensure shadcn Input is installed**

```bash
ls src/components/ui/input.tsx 2>/dev/null || npx shadcn@latest add input
```

If it prints a path, the component exists. If not, the `add` command installs it (answer yes to prompts).

- [ ] **Step 2: Create SearchBar**

Create `src/components/SearchBar.tsx`:

```tsx
// src/components/SearchBar.tsx
import { Input } from "@/components/ui/input";
import { Search, X } from "lucide-react";

interface SearchBarProps {
  query: string;
  onQueryChange: (value: string) => void;
}

export function SearchBar({ query, onQueryChange }: SearchBarProps) {
  return (
    <div className="relative mb-4">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="搜索端口 / 进程名 / 路径"
        className="pl-9 pr-9"
      />
      {query && (
        <button
          type="button"
          onClick={() => onQueryChange("")}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          aria-label="清除搜索"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

```bash
npm run build 2>&1 | tail -8
```

Expected: build succeeds (SearchBar not yet used — TypeScript may warn about unused import only if imported elsewhere; standalone file compiles fine).

- [ ] **Step 4: Commit**

```bash
git add src/components/SearchBar.tsx src/components/ui/input.tsx components.json 2>/dev/null; git add -A
git commit -m "feat: add SearchBar component"
```

---

## Task 6: Rewrite PortTable with path column + tree

**Files:**
- Modify: `src/components/PortTable.tsx`
- Modify: `src/test/PortTable.test.tsx`

- [ ] **Step 1: Rewrite the test file**

Replace the full contents of `src/test/PortTable.test.tsx` with:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PortTable } from "../components/PortTable";
import { PortGroup } from "../lib/groupPorts";

const singlePortGroup: PortGroup = {
  pid: 42,
  processName: "node",
  exePath: "/usr/bin/node",
  isUserProcess: true,
  entries: [
    { port: 3000, protocol: "TCP", pid: 42, processName: "node", exePath: "/usr/bin/node", isUserProcess: true, state: "LISTEN" },
  ],
};

const multiPortGroup: PortGroup = {
  pid: 1229,
  processName: "ControlCenter",
  exePath: "/System/CC",
  isUserProcess: false,
  entries: [
    { port: 5000, protocol: "TCP", pid: 1229, processName: "ControlCenter", exePath: "/System/CC", isUserProcess: false, state: "LISTEN" },
    { port: 7000, protocol: "TCP", pid: 1229, processName: "ControlCenter", exePath: "/System/CC", isUserProcess: false, state: "LISTEN" },
  ],
};

describe("PortTable", () => {
  it("renders a single-port group as a normal row with path", () => {
    render(<PortTable groups={[singlePortGroup]} onKill={vi.fn()} />);
    expect(screen.getByText("3000")).toBeInTheDocument();
    expect(screen.getByText("node")).toBeInTheDocument();
    expect(screen.getByText("/usr/bin/node")).toBeInTheDocument();
  });

  it("shows default empty state when no groups", () => {
    render(<PortTable groups={[]} onKill={vi.fn()} />);
    expect(screen.getByText("未发现监听端口")).toBeInTheDocument();
  });

  it("shows custom empty message when provided", () => {
    render(<PortTable groups={[]} onKill={vi.fn()} emptyMessage="无匹配结果" />);
    expect(screen.getByText("无匹配结果")).toBeInTheDocument();
  });

  it("calls onKill with the entry when a single-port Kill is clicked", async () => {
    const onKill = vi.fn();
    const user = userEvent.setup();
    render(<PortTable groups={[singlePortGroup]} onKill={onKill} />);
    await user.click(screen.getByText("Kill"));
    expect(onKill).toHaveBeenCalledWith(singlePortGroup.entries[0]);
  });

  it("renders multi-port group child rows expanded by default", () => {
    render(<PortTable groups={[multiPortGroup]} onKill={vi.fn()} />);
    expect(screen.getByText("5000")).toBeInTheDocument();
    expect(screen.getByText("7000")).toBeInTheDocument();
    // parent shows port count badge
    expect(screen.getByText("2 个端口")).toBeInTheDocument();
  });

  it("collapses and expands a multi-port group on header click", async () => {
    const user = userEvent.setup();
    render(<PortTable groups={[multiPortGroup]} onKill={vi.fn()} />);
    // expanded by default — child visible
    expect(screen.getByText("5000")).toBeInTheDocument();
    // click parent header to collapse
    await user.click(screen.getByText("2 个端口"));
    expect(screen.queryByText("5000")).not.toBeInTheDocument();
    // click again to expand
    await user.click(screen.getByText("2 个端口"));
    expect(screen.getByText("5000")).toBeInTheDocument();
  });

  it("calls onKill with the correct child entry from a multi-port group", async () => {
    const onKill = vi.fn();
    const user = userEvent.setup();
    render(<PortTable groups={[multiPortGroup]} onKill={onKill} />);
    const killButtons = screen.getAllByText("Kill");
    await user.click(killButtons[0]);
    expect(onKill).toHaveBeenCalledWith(multiPortGroup.entries[0]);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm run test -- --run PortTable 2>&1 | tail -15
```

Expected: FAIL — PortTable still uses the old `entries` prop / no tree behavior.

- [ ] **Step 3: Rewrite PortTable**

Replace the full contents of `src/components/PortTable.tsx` with:

```tsx
// src/components/PortTable.tsx
import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight } from "lucide-react";
import { PortEntry } from "../types/port";
import { PortGroup } from "../lib/groupPorts";

interface PortTableProps {
  groups: PortGroup[];
  onKill: (entry: PortEntry) => void;
  emptyMessage?: string;
}

function StateBadge({ state }: { state: string }) {
  const isListen = state === "LISTEN";
  return (
    <Badge variant={isListen ? "default" : "secondary"} className="text-xs">
      {state || "—"}
    </Badge>
  );
}

function PathCell({ exePath }: { exePath: string }) {
  return (
    <span
      className="block truncate max-w-[260px] text-muted-foreground"
      title={exePath}
    >
      {exePath || "—"}
    </span>
  );
}

export function PortTable({ groups, onKill, emptyMessage }: PortTableProps) {
  // multi-port groups are expanded by default
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  if (groups.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
        {emptyMessage ?? "未发现监听端口"}
      </div>
    );
  }

  function toggle(pid: number) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(pid)) {
        next.delete(pid);
      } else {
        next.add(pid);
      }
      return next;
    });
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-24">端口</TableHead>
          <TableHead className="w-20">协议</TableHead>
          <TableHead>进程名</TableHead>
          <TableHead>路径</TableHead>
          <TableHead className="w-24">PID</TableHead>
          <TableHead className="w-32">状态</TableHead>
          <TableHead className="w-20">操作</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {groups.map((group) => {
          if (group.entries.length === 1) {
            const entry = group.entries[0];
            return (
              <TableRow key={`single-${group.pid}-${entry.port}-${entry.protocol}`}>
                <TableCell className="font-mono font-medium">{entry.port}</TableCell>
                <TableCell>
                  <Badge variant="outline">{entry.protocol}</Badge>
                </TableCell>
                <TableCell className="font-mono">{entry.processName}</TableCell>
                <TableCell className="font-mono text-xs">
                  <PathCell exePath={entry.exePath} />
                </TableCell>
                <TableCell className="font-mono text-muted-foreground">{entry.pid}</TableCell>
                <TableCell>
                  <StateBadge state={entry.state} />
                </TableCell>
                <TableCell>
                  <Button variant="destructive" size="sm" onClick={() => onKill(entry)}>
                    Kill
                  </Button>
                </TableCell>
              </TableRow>
            );
          }

          const isCollapsed = collapsed.has(group.pid);
          return (
            <>
              <TableRow
                key={`group-${group.pid}`}
                className="cursor-pointer bg-muted/30 hover:bg-muted/50"
                onClick={() => toggle(group.pid)}
              >
                <TableCell colSpan={2}>
                  <div className="flex items-center gap-1 font-medium">
                    {isCollapsed ? (
                      <ChevronRight className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                    <Badge variant="secondary" className="text-xs">
                      {group.entries.length} 个端口
                    </Badge>
                  </div>
                </TableCell>
                <TableCell className="font-mono">{group.processName}</TableCell>
                <TableCell className="font-mono text-xs">
                  <PathCell exePath={group.exePath} />
                </TableCell>
                <TableCell className="font-mono text-muted-foreground">{group.pid}</TableCell>
                <TableCell />
                <TableCell />
              </TableRow>
              {!isCollapsed &&
                group.entries.map((entry) => (
                  <TableRow key={`child-${group.pid}-${entry.port}-${entry.protocol}`}>
                    <TableCell className="font-mono font-medium pl-8">{entry.port}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{entry.protocol}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">↳</TableCell>
                    <TableCell />
                    <TableCell />
                    <TableCell>
                      <StateBadge state={entry.state} />
                    </TableCell>
                    <TableCell>
                      <Button variant="destructive" size="sm" onClick={() => onKill(entry)}>
                        Kill
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
            </>
          );
        })}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npm run test -- --run PortTable 2>&1 | tail -15
```

Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/PortTable.tsx src/test/PortTable.test.tsx
git commit -m "feat: rewrite PortTable with path column and PID tree grouping"
```

---

## Task 7: Wire up App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Replace App.tsx**

Replace the full contents of `src/App.tsx` with:

```tsx
import { useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { useQueryClient } from "@tanstack/react-query";
import { usePorts } from "./hooks/usePorts";
import { PortTable } from "./components/PortTable";
import { RefreshBar } from "./components/RefreshBar";
import { KillDialog } from "./components/KillDialog";
import { SearchBar } from "./components/SearchBar";
import { filterPorts } from "./lib/filterPorts";
import { groupPorts } from "./lib/groupPorts";
import { PortEntry } from "./types/port";

export default function App() {
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [query, setQuery] = useState("");
  const [pendingKill, setPendingKill] = useState<PortEntry | null>(null);
  const queryClient = useQueryClient();

  const { data: ports = [], isFetching, isError } = usePorts(autoRefresh);

  const groups = useMemo(
    () => groupPorts(filterPorts(ports, query)),
    [ports, query]
  );

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
    <div className="min-h-screen bg-background text-foreground">
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
      </div>

      <KillDialog
        entry={pendingKill}
        onConfirm={handleKillConfirm}
        onCancel={() => setPendingKill(null)}
      />
      <Toaster />
    </div>
  );
}
```

- [ ] **Step 2: Build + full test run**

```bash
npm run build 2>&1 | tail -8
npm run test -- --run 2>&1 | tail -10
```

Expected: build succeeds; all frontend tests pass (filterPorts 5 + groupPorts 5 + PortTable 7).

- [ ] **Step 3: Manual smoke test (optional but recommended)**

```bash
npm run tauri dev
```

Verify: search filters live; path column shows; user processes on top; ControlCenter-style multi-port PIDs collapse into one expandable node with no duplicate rows.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: wire search, filtering, and PID grouping into App"
```

---

## Task 8: Update CLAUDE.md + final verification

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the architecture tree**

In `CLAUDE.md`, find the `## 技术架构` code block. Update the `src/` subtree to include the new files. Replace the `src/` portion of the tree with:

```
├── src/
│   ├── components/
│   │   ├── PortTable.tsx       # 端口列表（路径列 + PID 树形分组）
│   │   ├── KillDialog.tsx      # Kill 确认弹窗
│   │   ├── RefreshBar.tsx      # 自动刷新开关 + 手动刷新按钮
│   │   └── SearchBar.tsx       # 搜索框（端口/进程名/路径）
│   ├── hooks/
│   │   └── usePorts.ts         # TanStack Query 轮询 hook
│   ├── lib/
│   │   ├── filterPorts.ts      # 搜索过滤纯函数
│   │   ├── groupPorts.ts       # 按 PID 分组纯函数
│   │   └── utils.ts            # shadcn cn 工具
│   ├── types/
│   │   └── port.ts             # PortEntry 接口（含 exePath、isUserProcess）
│   ├── test/                   # vitest 测试
│   ├── App.tsx                 # 根组件：搜索 + 过滤 + 分组 + kill
│   └── main.tsx                # QueryClientProvider 入口
```

- [ ] **Step 2: Add a v2 note under 技术架构**

After the architecture tree's closing ``` fence, add this line:

```markdown
v2 增强：端口搜索、可执行路径列、用户进程优先排序、同 PID 多端口树形聚合、IPv4/IPv6 去重。
```

- [ ] **Step 3: Run the complete test suite**

```bash
npm run test -- --run 2>&1 | tail -8
cd src-tauri && cargo test 2>&1 | tail -8
```

Expected: frontend 17 tests pass; Rust 6 tests pass.

- [ ] **Step 4: Commit**

```bash
cd /Users/pciswork/mywork/AI/my-tools/port-manager
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md architecture for v2 features"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** search (Task 3 + 5 + 7) ✓, exe path (Task 1 + 2 + 6) ✓, user-process priority sort (Task 1) ✓, tree grouping (Task 4 + 6) ✓, IPv4/IPv6 dedup (Task 1) ✓, empty-state distinction (Task 6 + 7) ✓, CLAUDE.md update (Task 8) ✓
- [x] **No placeholders:** every code step contains full code; no TBD/TODO
- [x] **Type consistency:** `PortEntry` fields `exePath`/`isUserProcess` consistent across Rust serde rename (Task 1), TS type (Task 2), and all consumers; `PortGroup` interface defined in Task 4 (`groupPorts.ts`) and imported by PortTable (Task 6) and used in App (Task 7); `PortTable` prop changed from `entries` to `groups` consistently in Task 6 test + impl + Task 7 caller
- [x] **Backend API verified:** `process.exe() -> Option<&Path>`, `process.user_id() -> Option<&Uid>` (Uid: Clone+PartialEq), `get_current_pid() -> Result<Pid, _>` — all sysinfo 0.39
