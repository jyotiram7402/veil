"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Link as LinkIcon, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { copyText } from "@/lib/clipboard";
import { apiErrorMessage, cn } from "@/lib/utils";

type Code = {
  id: string;
  code_hint: string;
  label: string | null;
  max_uses: number;
  use_count: number;
  expires_at: string | null;
  revoked_at: string | null;
  last_used_at: string | null;
  created_at: string;
  used_by: { id: string; username: string; display_name: string | null }[];
};

const SELECT =
  "h-10 w-full rounded-md border border-input bg-background/60 px-3 text-base shadow-sm sm:text-sm " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function statusOf(c: Code): { text: string; active: boolean } {
  if (c.revoked_at) return { text: "Switched off", active: false };
  if (c.expires_at && new Date(c.expires_at).getTime() <= Date.now()) {
    return { text: "Expired", active: false };
  }
  if (c.use_count >= c.max_uses) return { text: "Used up", active: false };
  return { text: "Active", active: true };
}

function dateText(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Admin tab for sign-up codes: make one, hand it to somebody, see who joined
 * with it, switch it off. A code is shown in full only right after it is made;
 * afterwards the list shows its last four characters.
 */
export function SignupCodesTab() {
  const [codes, setCodes] = useState<Code[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<{ code: string; url: string } | null>(null);

  const [label, setLabel] = useState("");
  const [maxUses, setMaxUses] = useState("1");
  const [expires, setExpires] = useState("7");
  const [creating, setCreating] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/signup-codes", { cache: "no-store" });
      const body: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        setLoadError(apiErrorMessage(body, "Couldn't load the sign-up codes."));
        return;
      }
      setLoadError(null);
      setCodes((body as { codes: Code[] }).codes);
    } catch {
      setLoadError("No connection. Check your internet and reload.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/admin/signup-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: label.trim() || undefined,
          maxUses: Number(maxUses),
          expiresInDays: expires === "never" ? null : Number(expires),
        }),
      });
      const body: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(apiErrorMessage(body, "Couldn't create the code. Try again."));
        return;
      }
      const made = body as { code: string; url: string; signupCode: Code };
      setFresh({ code: made.code, url: made.url });
      setCodes((list) => [made.signupCode, ...list]);
      setLabel("");
    } catch {
      toast.error("No connection. Check your internet and try again.");
    } finally {
      setCreating(false);
    }
  }

  async function switchOff(c: Code) {
    if (!confirm("Switch this code off? People who already joined with it keep their accounts.")) {
      return;
    }
    const res = await fetch(`/api/admin/signup-codes/${c.id}`, { method: "DELETE" });
    if (!res.ok) {
      const body: unknown = await res.json().catch(() => null);
      toast.error(apiErrorMessage(body, "Couldn't switch the code off. Try again."));
      return;
    }
    setCodes((list) =>
      list.map((x) => (x.id === c.id ? { ...x, revoked_at: new Date().toISOString() } : x)),
    );
    toast.success("Code switched off");
  }

  async function copy(text: string, what: string) {
    if (await copyText(text)) toast.success(`${what} copied`);
    else toast.error("Couldn't copy. Select it and copy it yourself.");
  }

  return (
    <div className="space-y-6">
      <p className="max-w-prose text-sm text-muted-foreground">
        A sign-up code lets somebody create their own account on the Sign up screen. They choose
        their own username and password, and then chat with you.
      </p>

      <form
        onSubmit={create}
        className="rounded-lg border border-border/60 bg-card p-4"
        aria-label="New sign-up code"
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="codeLabel">Who is it for? (optional)</Label>
            <Input
              id="codeLabel"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={60}
              placeholder="e.g. Rahul"
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="codeUses">Can be used</Label>
            <select
              id="codeUses"
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
              className={SELECT}
            >
              <option value="1">Once</option>
              <option value="5">5 times</option>
              <option value="10">10 times</option>
              <option value="25">25 times</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="codeExpires">Stops working</Label>
            <select
              id="codeExpires"
              value={expires}
              onChange={(e) => setExpires(e.target.value)}
              className={SELECT}
            >
              <option value="1">After 1 day</option>
              <option value="7">After 7 days</option>
              <option value="30">After 30 days</option>
              <option value="never">Never</option>
            </select>
          </div>
        </div>
        <Button type="submit" className="mt-4" disabled={creating}>
          {creating ? <Loader2 className="animate-spin" /> : <Plus />} Create code
        </Button>
      </form>

      {fresh && (
        <div
          role="status"
          className="rounded-lg border border-primary/40 bg-accent p-4 text-accent-foreground"
        >
          <p className="text-sm font-semibold">New code</p>
          <p className="mt-1 select-all break-all font-mono text-2xl font-bold tracking-widest">
            {fresh.code}
          </p>
          <p className="mt-1 text-sm">
            Copy it now and send it to the person. For safety it is not shown again.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => copy(fresh.code, "Code")}>
              <Copy /> Copy code
            </Button>
            <Button size="sm" variant="outline" onClick={() => copy(fresh.url, "Link")}>
              <LinkIcon /> Copy sign-up link
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setFresh(null)}>
              Done
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading codes…</p>
      ) : loadError ? (
        <p role="alert" className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {loadError}
        </p>
      ) : codes.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No codes yet. Create one above and send it to the person you want to invite.
        </p>
      ) : (
        <ul className="space-y-2">
          {codes.map((c) => {
            const status = statusOf(c);
            return (
              <li
                key={c.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border/60 bg-card px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold tracking-wider">
                      •••••-•{c.code_hint}
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        status.active
                          ? "bg-online/15 text-online-ink"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {status.text}
                    </span>
                    {c.label && <span className="truncate text-sm">{c.label}</span>}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Used {c.use_count} of {c.max_uses}
                    {" · "}
                    {c.expires_at ? `stops working ${dateText(c.expires_at)}` : "never expires"}
                    {" · "}made {dateText(c.created_at)}
                  </p>
                  {c.used_by.length > 0 && (
                    <p className="mt-1 text-xs">
                      Joined: {c.used_by.map((u) => `@${u.username}`).join(", ")}
                    </p>
                  )}
                </div>
                {status.active && (
                  <Button size="sm" variant="outline" onClick={() => switchOff(c)}>
                    Switch off
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
