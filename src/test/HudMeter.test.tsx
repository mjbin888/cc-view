import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HudMeter } from "../components/HudMeter";

describe("HudMeter", () => {
  it("显示百分比，填充宽度对应 percent", () => {
    render(<HudMeter label="Usage" percent={70} />);
    expect(screen.getByText("70%")).toBeInTheDocument();
    expect(screen.getByTestId("hud-meter-fill")).toHaveStyle({ width: "70%" });
  });

  it("percent 为 null 显示 —，宽度 0", () => {
    render(<HudMeter label="Context" percent={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByTestId("hud-meter-fill")).toHaveStyle({ width: "0%" });
  });

  it("dim 时整段变灰", () => {
    const { container } = render(<HudMeter label="Weekly" percent={28} dim />);
    expect(container.firstChild).toHaveClass("opacity-60");
  });

  it("渲染 sub 副文本", () => {
    render(<HudMeter label="Usage" percent={70} sub="resets in 44m" />);
    expect(screen.getByText("(resets in 44m)")).toBeInTheDocument();
  });

  it("context 按阈值着色：绿/黄/红", () => {
    const { rerender } = render(<HudMeter label="Context" tone="context" percent={50} />);
    expect(screen.getByTestId("hud-meter-fill")).toHaveClass("bg-emerald-500");
    rerender(<HudMeter label="Context" tone="context" percent={72} />);
    expect(screen.getByTestId("hud-meter-fill")).toHaveClass("bg-amber-500");
    rerender(<HudMeter label="Context" tone="context" percent={90} />);
    expect(screen.getByTestId("hud-meter-fill")).toHaveClass("bg-red-500");
  });

  it("usage 配额按阈值着色：蓝/品红/红", () => {
    const { rerender } = render(<HudMeter label="Usage" tone="usage" percent={40} />);
    expect(screen.getByTestId("hud-meter-fill")).toHaveClass("bg-blue-500");
    rerender(<HudMeter label="Usage" tone="usage" percent={80} />);
    expect(screen.getByTestId("hud-meter-fill")).toHaveClass("bg-fuchsia-500");
    rerender(<HudMeter label="Usage" tone="usage" percent={95} />);
    expect(screen.getByTestId("hud-meter-fill")).toHaveClass("bg-red-500");
  });

  it("stale(dim) 保留阈值色，只整段降透明", () => {
    const { container } = render(<HudMeter label="Usage" tone="usage" percent={95} dim />);
    expect(screen.getByTestId("hud-meter-fill")).toHaveClass("bg-red-500");
    expect(container.firstChild).toHaveClass("opacity-60");
  });

  it("无数据(null)用中性灰", () => {
    render(<HudMeter label="Usage" tone="usage" percent={null} />);
    expect(screen.getByTestId("hud-meter-fill")).toHaveClass("bg-muted-foreground/40");
  });
});
