// src/components/RefreshBar.tsx
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

interface RefreshBarProps {
  autoRefresh: boolean;
  onAutoRefreshChange: (value: boolean) => void;
  onRefresh: () => void;
  isLoading: boolean;
}

export function RefreshBar({
  autoRefresh,
  onAutoRefreshChange,
  onRefresh,
  isLoading,
}: RefreshBarProps) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-muted-foreground">自动刷新</span>
      <Switch checked={autoRefresh} onCheckedChange={onAutoRefreshChange} />
      <Button
        variant="outline"
        size="sm"
        onClick={onRefresh}
        disabled={isLoading}
      >
        <RefreshCw className={`h-4 w-4 mr-1 ${isLoading ? "animate-spin" : ""}`} />
        刷新
      </Button>
    </div>
  );
}
