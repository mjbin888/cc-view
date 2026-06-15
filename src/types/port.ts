// src/types/port.ts
export interface PortEntry {
  port: number;
  protocol: "TCP" | "UDP";
  pid: number;
  processName: string;
  exePath: string;
  cwd: string;
  cmd: string;
  isUserProcess: boolean;
  state: string;
  runTimeSecs: number;
}
