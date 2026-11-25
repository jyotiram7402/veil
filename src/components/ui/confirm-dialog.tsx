"use client";

import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type ConfirmOptions = {
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  destructive?: boolean;
};

export function useConfirm() {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback(
    (next: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        resolver.current?.(false);
        resolver.current = resolve;
        setOptions(next);
        setOpen(true);
      }),
    [],
  );

  const settle = useCallback((ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOpen(false);
  }, []);

  const dialog = (
    <Dialog open={open} onOpenChange={(next) => !next && settle(false)}>
      <DialogContent
        role="alertdialog"
        className="w-[calc(100%-1.5rem)] max-w-sm gap-0 rounded-[1.75rem] p-6"
      >
        {options && (
          <>
            <DialogHeader className="pr-8">
              <DialogTitle className="text-lg font-bold leading-snug tracking-normal">
                {options.title}
              </DialogTitle>
              <DialogDescription asChild>
                <div className="space-y-2 pt-1 text-sm leading-relaxed">{options.body}</div>
              </DialogDescription>
            </DialogHeader>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="ghost" onClick={() => settle(false)}>
                Cancel
              </Button>
              <Button
                variant={options.destructive ? "destructive" : "default"}
                onClick={() => settle(true)}
              >
                {options.confirmLabel}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );

  return { confirm, dialog };
}
