"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { checkRelay, type RelayCheckResult } from "@/lib/webrtc/relay-check";
import { cn } from "@/lib/utils";

const RESULTS: Record<RelayCheckResult, { good: boolean; text: string }> = {
  ok: { good: true, text: "The relay works from this device." },
  not_configured: {
    good: false,
    text: "The relay is not set up. Add the two Cloudflare values in Vercel, then redeploy.",
  },
  rejected: {
    good: false,
    text: "Cloudflare refused the key. Check the two Cloudflare values in Vercel, then redeploy.",
  },
  unreachable: { good: false, text: "Cloudflare did not answer. Try again in a minute." },
  blocked: {
    good: false,
    text: "The relay is set up, but this network blocks it. Try on mobile data or another Wi-Fi.",
  },
  unsupported: { good: false, text: "This browser cannot make calls." },
  error: { good: false, text: "Couldn't run the check. Reload the page and try again." },
};

export function CallRelayCheck() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RelayCheckResult | null>(null);

  async function run() {
    setBusy(true);
    setResult(null);
    try {
      setResult(await checkRelay());
    } catch {
      setResult("error");
    } finally {
      setBusy(false);
    }
  }

  const shown = result ? RESULTS[result] : null;
  const Icon = shown?.good ? CheckCircle2 : AlertTriangle;

  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm font-medium">Call relay</div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Calls between two different networks pass through a relay. Check that it is set up
            and that this device can reach it.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={run} disabled={busy} className="shrink-0">
          {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
          {busy ? "Checking…" : "Check"}
        </Button>
      </div>
      <p
        aria-live="polite"
        className={cn(
          "flex items-start gap-2 text-[13px] font-medium",
          shown ? "mt-3" : "sr-only",
          shown?.good ? "text-online-ink" : "text-destructive",
        )}
      >
        {shown && (
          <>
            <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{shown.text}</span>
          </>
        )}
      </p>
    </div>
  );
}
