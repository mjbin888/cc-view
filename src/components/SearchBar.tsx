// src/components/SearchBar.tsx
import { Input } from "@/components/ui/input";
import { Search, X } from "lucide-react";

interface SearchBarProps {
  query: string;
  onQueryChange: (value: string) => void;
}

export function SearchBar({ query, onQueryChange }: SearchBarProps) {
  return (
    <div className="relative mb-4">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="搜索端口 / 进程名 / 路径"
        className="pl-9 pr-9"
      />
      {query && (
        <button
          type="button"
          onClick={() => onQueryChange("")}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          aria-label="清除搜索"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
