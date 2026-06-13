// src/components/PortTable.tsx
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
import { PortEntry } from "../types/port";

interface PortTableProps {
  entries: PortEntry[];
  onKill: (entry: PortEntry) => void;
}

function StateBadge({ state }: { state: string }) {
  const isListen = state === "LISTEN";
  return (
    <Badge variant={isListen ? "default" : "secondary"} className="text-xs">
      {state || "—"}
    </Badge>
  );
}

export function PortTable({ entries, onKill }: PortTableProps) {
  if (entries.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
        未发现监听端口
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-24">端口</TableHead>
          <TableHead className="w-20">协议</TableHead>
          <TableHead>进程名</TableHead>
          <TableHead className="w-28">PID</TableHead>
          <TableHead className="w-36">状态</TableHead>
          <TableHead className="w-20">操作</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => (
          <TableRow key={`${entry.port}-${entry.pid}-${entry.protocol}`}>
            <TableCell className="font-mono font-medium">{entry.port}</TableCell>
            <TableCell>
              <Badge variant="outline">{entry.protocol}</Badge>
            </TableCell>
            <TableCell className="font-mono">{entry.processName}</TableCell>
            <TableCell className="font-mono text-muted-foreground">{entry.pid}</TableCell>
            <TableCell>
              <StateBadge state={entry.state} />
            </TableCell>
            <TableCell>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => onKill(entry)}
              >
                Kill
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
