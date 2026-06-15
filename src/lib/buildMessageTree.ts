// src/lib/buildMessageTree.ts
import { NormEvent } from "../types/conversation";

export interface TreeNode {
  event: NormEvent;
  /** sidechain 子树根：本节点是 subagent 旁支起点（自身 isSidechain，父非 sidechain 或不存在） */
  sidechainRoot: boolean;
  children: TreeNode[];
}

/**
 * 按 parentUuid 把扁平事件列表还原成树。
 * - root = parentUuid 为空，或父 uuid 不在集合内（孤儿）。
 * - children 保持原始文件顺序。
 * - 不在此处计算缩进；线性链 vs 分支由渲染层依据 children.length 决定。
 */
export function buildMessageTree(events: NormEvent[]): TreeNode[] {
  const byId = new Map<string, NormEvent>();
  for (const e of events) byId.set(e.uuid, e);

  const childrenOf = new Map<string | null, NormEvent[]>();
  for (const e of events) {
    const key =
      e.parentUuid && byId.has(e.parentUuid) ? e.parentUuid : null;
    const arr = childrenOf.get(key);
    if (arr) arr.push(e);
    else childrenOf.set(key, [e]);
  }

  const build = (e: NormEvent): TreeNode => {
    const parent = e.parentUuid ? byId.get(e.parentUuid) : undefined;
    return {
      event: e,
      sidechainRoot: !!e.isSidechain && !parent?.isSidechain,
      children: (childrenOf.get(e.uuid) ?? []).map(build),
    };
  };

  return (childrenOf.get(null) ?? []).map(build);
}
