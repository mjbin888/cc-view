import { describe, expect, it } from "vitest";
import { formatTimestamp } from "../lib/formatTimestamp";

describe("formatTimestamp", () => {
  it("格式化为 yyyy-MM-dd HH:mm", () => {
    // 用带时区偏移的输入断言本地输出位数，避免依赖运行机器时区
    const out = formatTimestamp("2026-06-15T02:26:53.383Z");
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });

  it("空字符串原样返回", () => {
    expect(formatTimestamp("")).toBe("");
  });

  it("非法时间原样返回", () => {
    expect(formatTimestamp("not-a-date")).toBe("not-a-date");
  });
});
