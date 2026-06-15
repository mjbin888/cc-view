// src/components/ThemeToggle.tsx
import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme } from "../contexts/ThemeProvider";
import { Theme } from "../lib/theme";

const OPTIONS: { key: Theme; label: string; Icon: typeof Sun }[] = [
  { key: "light", label: "浅色", Icon: Sun },
  { key: "dark", label: "深色", Icon: Moon },
  { key: "system", label: "跟随系统", Icon: Monitor },
];

/** 三态主题切换分段控件，放侧栏底部。 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="flex gap-1 rounded-lg bg-muted p-1" role="group" aria-label="主题">
      {OPTIONS.map(({ key, label, Icon }) => {
        const active = theme === key;
        return (
          <button
            key={key}
            type="button"
            aria-label={label}
            aria-pressed={active}
            title={label}
            onClick={() => setTheme(key)}
            className={`flex flex-1 items-center justify-center rounded-md py-1.5 transition-colors ${
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" />
          </button>
        );
      })}
    </div>
  );
}
