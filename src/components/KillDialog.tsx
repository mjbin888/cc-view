// src/components/KillDialog.tsx
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PortEntry } from "../types/port";

interface KillDialogProps {
  entry: PortEntry | null;
  onConfirm: (entry: PortEntry) => void;
  onCancel: () => void;
}

export function KillDialog({ entry, onConfirm, onCancel }: KillDialogProps) {
  return (
    <AlertDialog open={entry !== null}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>确认 Kill 进程？</AlertDialogTitle>
          <AlertDialogDescription>
            {entry && (
              <>
                进程 <strong>{entry.processName}</strong> (PID {entry.pid}) 正在占用端口{" "}
                <strong>{entry.port}</strong>。此操作不可撤销。
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>取消</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={!entry}
            onClick={() => entry && onConfirm(entry)}
          >
            Kill
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
