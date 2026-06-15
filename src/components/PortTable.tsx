// src/components/PortTable.tsx
import { Fragment, useState } from "react";
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
import { formatDuration } from "../lib/formatDuration";

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

export function PortTable({ groups, onKill, emptyMessage }: PortTableProps) {
  // multi-port groups are expanded by default; this set tracks collapsed ones
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
          <TableHead className="w-24">时长</TableHead>
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
                  <PathCell cwd={entry.cwd} exePath={entry.exePath} cmd={entry.cmd} />
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {entry.runTimeSecs > 0 ? formatDuration(entry.runTimeSecs) : "—"}
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
            <Fragment key={`frag-${group.pid}`}>
              <TableRow
                className="cursor-pointer bg-muted/30 hover:bg-muted/50"
                role="button"
                tabIndex={0}
                onClick={() => toggle(group.pid)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggle(group.pid);
                  }
                }}
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
                  <PathCell cwd={group.cwd} exePath={group.exePath} cmd={group.cmd} />
                </TableCell>
                <TableCell />
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
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {entry.runTimeSecs > 0 ? formatDuration(entry.runTimeSecs) : "—"}
                    </TableCell>
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
            </Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
}
