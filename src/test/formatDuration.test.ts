import { describe, it, expect } from "vitest";
import { formatDuration } from "../lib/formatDuration";

describe("formatDuration", () => {
  it("0 seconds", () => expect(formatDuration(0)).toBe("0s"));
  it("< 60s", () => expect(formatDuration(45)).toBe("45s"));
  it("59s", () => expect(formatDuration(59)).toBe("59s"));
  it("exactly 60s → 1m", () => expect(formatDuration(60)).toBe("1m"));
  it("minutes only", () => expect(formatDuration(720)).toBe("12m"));
  it("59m", () => expect(formatDuration(3540)).toBe("59m"));
  it("exactly 1h", () => expect(formatDuration(3600)).toBe("1h"));
  it("hours + minutes", () => expect(formatDuration(8100)).toBe("2h 15m"));
  it("hours no minutes", () => expect(formatDuration(7200)).toBe("2h"));
  it("exactly 24h", () => expect(formatDuration(86400)).toBe("1d"));
  it("days + hours", () => expect(formatDuration(273600)).toBe("3d 4h"));
  it("days no hours", () => expect(formatDuration(172800)).toBe("2d"));
});
