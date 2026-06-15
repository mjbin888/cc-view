// src/components/SourceTabs.tsx
export type SourceKey = "claude-code" | "codex" | "opencode";

const TABS: { key: SourceKey; label: string }[] = [
  { key: "claude-code", label: "Claude Code" },
  { key: "codex", label: "Codex" },
  { key: "opencode", label: "OpenCode" },
];

interface Props {
  active: SourceKey;
  onChange: (key: SourceKey) => void;
}

/** 顶部分段控件：在 Claude Code / Codex / OpenCode 三源间切换。 */
export function SourceTabs({ active, onChange }: Props) {
  return (
    <div
      role="tablist"
      aria-label="会话来源"
      className="flex gap-1 rounded-lg bg-muted p-1"
    >
      {TABS.map((t) => {
        const isActive = t.key === active;
        return (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={isActive}
            onClick={() => onChange(t.key)}
            className={`flex-1 cursor-pointer rounded-md px-3 py-2 text-sm font-medium transition-colors duration-200 ${
              isActive
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
