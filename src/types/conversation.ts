// src/types/conversation.ts
export type Block =
  | { kind: "thinking"; text: string }
  | { kind: "text"; text: string }
  | { kind: "tool_use"; id: string; name: string; input: unknown }
  | { kind: "tool_result"; toolUseId: string; content: unknown }
  | { kind: "image"; source: unknown };

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

export interface NormEvent {
  uuid: string;
  role: "user" | "assistant" | "system";
  timestamp: string;
  blocks: Block[];
  model?: string;
  usage?: Usage;
  raw: string;
}

export interface SessionSummary {
  id: string;
  source: string;
  projectPath: string;
  title: string;
  messageCount: number;
  startedAt: string;
  lastActivityAt: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  models: string[];
}

export interface SessionDetail {
  summary: SessionSummary;
  events: NormEvent[];
}
