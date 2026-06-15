import { Network, MessagesSquare } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";

export type ViewKey = "ports" | "conversations";

const items: { key: ViewKey; label: string; icon: typeof Network }[] = [
  { key: "ports", label: "端口", icon: Network },
  { key: "conversations", label: "会话", icon: MessagesSquare },
];

export function AppSidebar({
  view,
  onChange,
}: {
  view: ViewKey;
  onChange: (v: ViewKey) => void;
}) {
  return (
    <nav className="flex w-20 flex-col items-center gap-1 border-r bg-muted/30 py-3">
      {items.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`flex w-16 flex-col items-center gap-1 rounded-md py-2 text-xs transition-colors ${
            view === key
              ? "bg-primary/10 font-medium text-primary"
              : "text-muted-foreground hover:bg-accent/50"
          }`}
        >
          <Icon className="h-5 w-5" />
          {label}
        </button>
      ))}
      <div className="mt-auto w-16 px-0.5">
        <ThemeToggle />
      </div>
    </nav>
  );
}
