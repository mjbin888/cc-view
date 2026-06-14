// src/lib/highlightText.tsx
import type { ReactNode } from "react";

/**
 * 把 text 中匹配 term 的子串(大小写不敏感)包进 <mark> 高亮，其余原样返回。
 * term 为空时直接返回 [text]。
 */
export function highlightText(text: string, term: string): ReactNode[] {
  const t = term.trim();
  if (!t) return [text];
  const lower = text.toLowerCase();
  const needle = t.toLowerCase();
  const out: ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < text.length) {
    const idx = lower.indexOf(needle, i);
    if (idx === -1) {
      out.push(text.slice(i));
      break;
    }
    if (idx > i) out.push(text.slice(i, idx));
    out.push(
      <mark key={key++} className="rounded-sm bg-yellow-300 text-black">
        {text.slice(idx, idx + t.length)}
      </mark>
    );
    i = idx + t.length;
  }
  return out;
}
