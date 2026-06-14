import { Network, MessagesSquare } from "lucide-react";

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
          className={`flex w-16 flex-col items-center gap-1 rounded-md py-2 text-xs ${
            view === key ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/50"
          }`}
        >
          <Icon className="h-5 w-5" />
          {label}
        </button>
      ))}
    </nav>
  );
}
