"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PANEL } from "@/components/form-styles";
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
    <section aria-labelledby="relayTitle" className={cn(PANEL, "px-4 py-3.5")}>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 id="relayTitle" className="text-[15px] font-semibold leading-snug">
            Call relay
          </h2>
          <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">
            Calls between two different networks pass through a relay. Check that it is set up
            and that this device can reach it.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={run}
          disabled={busy}
          className="shrink-0 shadow-none"
        >
          {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
          {busy ? "Checking…" : "Check"}
        </Button>
      </div>
      <p
        aria-live="polite"
        className={cn(
          "flex items-start gap-2 rounded-2xl text-[13px] font-medium leading-snug",
          shown ? "mt-3 px-3 py-2.5" : "sr-only",
          shown?.good ? "bg-online/10 text-online-ink" : "bg-destructive/10 text-destructive",
        )}
      >
        {shown && (
          <>
            <Icon className="mt-px h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{shown.text}</span>
          </>
        )}
      </p>
    </section>
  );
}
