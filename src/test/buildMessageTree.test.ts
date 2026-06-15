import { describe, expect, it } from "vitest";
import { buildMessageTree } from "../lib/buildMessageTree";
import { NormEvent } from "../types/conversation";

function ev(p: Partial<NormEvent> & { uuid: string }): NormEvent {
  return {
    role: "user",
    timestamp: "",
    blocks: [],
    raw: "",
    ...p,
  };
}

describe("buildMessageTree", () => {
  it("线性链：root 单一，逐级单子节点", () => {
    const tree = buildMessageTree([
      ev({ uuid: "a" }),
      ev({ uuid: "b", parentUuid: "a" }),
      ev({ uuid: "c", parentUuid: "b" }),
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0].event.uuid).toBe("a");
    expect(tree[0].children[0].event.uuid).toBe("b");
    expect(tree[0].children[0].children[0].event.uuid).toBe("c");
  });

  it("分支：一个父节点多个子节点（rewind）", () => {
    const tree = buildMessageTree([
      ev({ uuid: "a" }),
      ev({ uuid: "b1", parentUuid: "a" }),
      ev({ uuid: "b2", parentUuid: "a" }),
    ]);
    expect(tree[0].children.map((c) => c.event.uuid)).toEqual(["b1", "b2"]);
  });

  it("孤儿（父不存在）视为 root", () => {
    const tree = buildMessageTree([
      ev({ uuid: "x", parentUuid: "missing" }),
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0].event.uuid).toBe("x");
  });

  it("sidechainRoot：旁支起点标记，旁支内部不再标记", () => {
    const tree = buildMessageTree([
      ev({ uuid: "a" }),
      ev({ uuid: "s1", parentUuid: "a", isSidechain: true }),
      ev({ uuid: "s2", parentUuid: "s1", isSidechain: true }),
    ]);
    const s1 = tree[0].children[0];
    expect(s1.event.uuid).toBe("s1");
    expect(s1.sidechainRoot).toBe(true);
    expect(s1.children[0].sidechainRoot).toBe(false);
  });

  it("保持原始顺序", () => {
    const tree = buildMessageTree([
      ev({ uuid: "a" }),
      ev({ uuid: "z", parentUuid: "a" }),
      ev({ uuid: "m", parentUuid: "a" }),
    ]);
    expect(tree[0].children.map((c) => c.event.uuid)).toEqual(["z", "m"]);
  });
});
