"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing, Share, SquarePlus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { APP_NAME } from "@/lib/constants";
import {
  disablePush,
  enablePush,
  onApplePhone,
  pushEndpoint,
  refreshPush,
  syncPush,
} from "@/lib/push-client";
import { apiErrorMessage, cn } from "@/lib/utils";
import { useCallStore } from "@/store/call-store";
import { usePushStore, type PushHelp } from "@/store/push-store";

const PROMPT_KEY = "blackfoxx-notify-prompt";

function hidePrompt() {
  usePushStore.getState().setPromptHidden(true);
  try {
    window.localStorage.setItem(PROMPT_KEY, "hidden");
  } catch {}
}

async function turnOn() {
  const store = usePushStore.getState();
  if (store.busy) return;
  store.setBusy(true);
  try {
    const result = await enablePush();
    if (result === "on") toast.success("Notifications are on");
    else if (result === "blocked") store.setHelp("blocked");
    else if (result === "unavailable") {
      toast.error("Notifications aren't available yet. Try again later.");
    } else if (result === "failed") {
      toast.error("Couldn't turn on notifications. Try again.");
    }
  } finally {
    store.setBusy(false);
  }
}

async function turnOff() {
  const store = usePushStore.getState();
  if (store.busy) return;
  store.setBusy(true);
  try {
    await disablePush();
    hidePrompt();
    toast("Notifications are off");
  } finally {
    store.setBusy(false);
  }
}

const TEST_RESULTS: Record<string, { ok: boolean; text: string }> = {
  sent: {
    ok: true,
    text: "Test sent. It should appear within a few seconds. If it doesn't, notifications are off for Chrome or for this site in the phone's settings.",
  },
  failed: {
    ok: false,
    text: "The push service didn't take the test. The reason is in Vercel's logs, in a line starting with [push].",
  },
  "not-registered": {
    ok: false,
    text: "This phone isn't registered for notifications any more. Turn them off and on again.",
  },
  "not-set-up": {
    ok: false,
    text: "Notifications aren't set up on the server yet. Run supabase/v12.sql.",
  },
};

async function sendTest() {
  const endpoint = pushEndpoint();
  if (!endpoint) {
    toast.error("This phone isn't registered for notifications. Turn them off and on again.");
    return;
  }
  try {
    const res = await fetch("/api/push/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint }),
    });
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      toast.error(apiErrorMessage(body, "Couldn't send a test. Try again."));
      return;
    }
    const shown = TEST_RESULTS[(body as { result?: string } | null)?.result ?? ""] ?? TEST_RESULTS.failed!;
    if (shown.ok) toast.success(shown.text, { duration: 8000 });
    else toast.error(shown.text, { duration: 10000 });
  } catch {
    toast.error("No connection. Check your internet and try again.");
  }
}

export function NotificationsMenuItem() {
  const status = usePushStore((s) => s.status);
  const busy = usePushStore((s) => s.busy);
  const setHelp = usePushStore((s) => s.setHelp);

  if (status === null || status === "unsupported") return null;

  if (status === "on") {
    return (
      <>
        <DropdownMenuItem className="px-3 py-2.5" disabled={busy} onClick={() => void sendTest()}>
          <BellRing className="h-4 w-4" /> Send a test notification
        </DropdownMenuItem>
        <DropdownMenuItem className="px-3 py-2.5" disabled={busy} onClick={() => void turnOff()}>
          <BellOff className="h-4 w-4" /> Turn off notifications
        </DropdownMenuItem>
      </>
    );
  }
  if (status === "off") {
    return (
      <DropdownMenuItem className="px-3 py-2.5" disabled={busy} onClick={() => void turnOn()}>
        <Bell className="h-4 w-4" /> Turn on notifications
      </DropdownMenuItem>
    );
  }
  return (
    <DropdownMenuItem className="px-3 py-2.5" onClick={() => setHelp(status)}>
      {status === "blocked" ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
      {status === "blocked" ? "Notifications blocked" : "Get notifications"}
    </DropdownMenuItem>
  );
}

function Step({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-muted text-sm font-bold [&_svg]:size-5"
      >
        {icon}
      </span>
      <span className="min-w-0 text-[15px] leading-snug">{children}</span>
    </li>
  );
}

function NotificationsHelp() {
  const open = usePushStore((s) => s.help);
  const setHelp = usePushStore((s) => s.setHelp);
  const [view, setView] = useState<{ help: PushHelp; apple: boolean } | null>(null);
  if (open && view?.help !== open) setView({ help: open, apple: onApplePhone() });
  const help = open ?? view?.help ?? "install";
  const apple = view?.apple ?? false;

  return (
    <Dialog open={open !== null} onOpenChange={(next) => !next && setHelp(null)}>
      <DialogContent className="max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1.5rem)] max-w-sm gap-0 overflow-y-auto rounded-[1.75rem] p-0">
        <DialogHeader className="px-6 pb-4 pr-12 pt-7">
          <DialogTitle className="text-xl font-extrabold leading-tight tracking-tight">
            {help === "blocked" ? "Notifications are blocked" : `Add ${APP_NAME} to your Home Screen`}
          </DialogTitle>
          <DialogDescription>
            {help === "blocked"
              ? `This ${apple ? "device" : "browser"} was told not to show notifications from ${APP_NAME}. To allow them:`
              : "On an iPhone or iPad, notifications only reach apps that are on the Home Screen."}
          </DialogDescription>
        </DialogHeader>

        <ol className="space-y-3 px-6">
          {help === "blocked" && apple && (
            <>
              <Step icon="1">Open the Settings app and go to Notifications.</Step>
              <Step icon="2">
                Choose {APP_NAME} and switch on <b className="font-semibold">Allow Notifications</b>.
              </Step>
              <Step icon="3">Come back here and turn notifications on.</Step>
            </>
          )}
          {help === "blocked" && !apple && (
            <>
              <Step icon="1">Open the site settings: the icon at the left of the address bar.</Step>
              <Step icon="2">
                Set <b className="font-semibold">Notifications</b> to Allow.
              </Step>
              <Step icon="3">Come back here and turn notifications on.</Step>
            </>
          )}
          {help === "install" && (
            <>
              <Step icon={<Share />}>
                In Safari, tap <b className="font-semibold">Share</b>.
              </Step>
              <Step icon={<SquarePlus />}>
                Choose <b className="font-semibold">Add to Home Screen</b>.
              </Step>
              <Step icon={<Bell />}>
                Open {APP_NAME} from its new icon, log in, and turn on notifications there.
              </Step>
            </>
          )}
        </ol>

        {help === "blocked" && !apple && (
          <p className="px-6 pt-3 text-sm text-muted-foreground">
            If {APP_NAME} is installed as an app, the switch is in your device&rsquo;s settings,
            under Apps, {APP_NAME}, Notifications.
          </p>
        )}

        <div className="px-6 pb-6 pt-5">
          <Button type="button" className="h-12 w-full" onClick={() => setHelp(null)}>
            Got it
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function NotificationsPrompt({
  place,
  className,
}: {
  place: "top" | "bottom";
  className?: string;
}) {
  const status = usePushStore((s) => s.status);
  const busy = usePushStore((s) => s.busy);
  const hidden = usePushStore((s) => s.promptHidden);
  const setHelp = usePushStore((s) => s.setHelp);
  const inCall = useCallStore((s) => s.state !== "idle");

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = window.localStorage.getItem(PROMPT_KEY) === "hidden";
    } catch {}
    usePushStore.getState().setPromptHidden(dismissed);
    void syncPush();

    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshPush();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const asking = status === "off" || status === "install";
  const shown = asking && !hidden && !inCall;

  return (
    <>
      {shown && (
        <div
          className={cn(
            "pointer-events-none absolute inset-x-0 z-10 flex justify-center px-3",
            place === "top" ? "top-3" : "bottom-[max(1rem,env(safe-area-inset-bottom))]",
            className,
          )}
        >
          <div
            role="region"
            aria-label="Notifications"
            className={cn(
              "pointer-events-auto flex max-w-full items-center gap-0.5 rounded-full border border-border/70 bg-card p-1 shadow-[0_18px_34px_-20px_rgb(15_18_30/0.55)]",
              "duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] animate-in fade-in-0 motion-reduce:animate-none",
              place === "top" ? "slide-in-from-top-2" : "slide-in-from-bottom-2",
            )}
          >
            <button
              type="button"
              disabled={busy}
              onClick={() => (status === "install" ? setHelp("install") : void turnOn())}
              className="flex h-9 min-w-0 items-center gap-2.5 rounded-full pl-1 pr-3 text-sm font-semibold transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            >
              <span
                aria-hidden="true"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"
              >
                <Bell className="h-4 w-4" />
              </span>
              <span className="truncate">
                {status === "install" ? "Get notifications" : "Turn on notifications"}
              </span>
            </button>
            <button
              type="button"
              aria-label="Not now"
              onClick={hidePrompt}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
      <NotificationsHelp />
    </>
  );
}
