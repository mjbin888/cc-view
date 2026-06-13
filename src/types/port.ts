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
