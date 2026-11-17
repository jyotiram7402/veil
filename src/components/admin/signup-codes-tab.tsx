"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Link as LinkIcon, Loader2, Plus, Ticket } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Chip,
  EmptyState,
  ListSkeleton,
  LoadError,
  SelectField,
  dateText,
} from "@/components/admin/parts";
import { FIELD, FIELD_LABEL, PANEL } from "@/components/form-styles";
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

function statusOf(c: Code): { text: string; active: boolean } {
  if (c.revoked_at) return { text: "Switched off", active: false };
  if (c.expires_at && new Date(c.expires_at).getTime() <= Date.now()) {
    return { text: "Expired", active: false };
  }
  if (c.use_count >= c.max_uses) return { text: "Used up", active: false };
  return { text: "Active", active: true };
}

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
    <div className="space-y-5">
      <p className="px-1 text-sm text-muted-foreground">
        A sign-up code lets somebody create their own account on the Sign up screen. They choose
        their own username and password, and then chat with you.
      </p>

      <form onSubmit={create} className={cn(PANEL, "p-5")} aria-labelledby="newCodeTitle">
        <h2 id="newCodeTitle" className="text-base font-bold">
          New sign-up code
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="codeLabel" className={FIELD_LABEL}>
              Who is it for? (optional)
            </Label>
            <Input
              id="codeLabel"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={60}
              placeholder="e.g. Rahul"
              autoComplete="off"
              className={FIELD}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="codeUses" className={FIELD_LABEL}>
              Can be used
            </Label>
            <SelectField id="codeUses" value={maxUses} onChange={(e) => setMaxUses(e.target.value)}>
              <option value="1">Once</option>
              <option value="5">5 times</option>
              <option value="10">10 times</option>
              <option value="25">25 times</option>
            </SelectField>
          </div>
          <div className="space-y-2">
            <Label htmlFor="codeExpires" className={FIELD_LABEL}>
              Stops working
            </Label>
            <SelectField
              id="codeExpires"
              value={expires}
              onChange={(e) => setExpires(e.target.value)}
            >
              <option value="1">After 1 day</option>
              <option value="7">After 7 days</option>
              <option value="30">After 30 days</option>
              <option value="never">Never</option>
            </SelectField>
          </div>
        </div>
        <Button type="submit" className="mt-5 h-12 w-full px-6 sm:w-auto" disabled={creating}>
          {creating ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Plus aria-hidden="true" />}{" "}
          Create code
        </Button>
      </form>

      {fresh && (
        <div role="status" className="rounded-2xl bg-accent p-5 text-accent-foreground">
          <p className="text-sm font-semibold">New code</p>
          <p className="mt-1 select-all break-all font-mono text-[1.75rem] font-bold leading-tight tracking-[0.12em]">
            {fresh.code}
          </p>
          <p className="mt-2 text-sm">
            Copy it now and send it to the person. For safety it is not shown again.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => copy(fresh.code, "Code")}>
              <Copy aria-hidden="true" /> Copy code
            </Button>
            <Button
              variant="secondary"
              className="bg-card shadow-none hover:bg-card/80"
              onClick={() => copy(fresh.url, "Link")}
            >
              <LinkIcon aria-hidden="true" /> Copy sign-up link
            </Button>
            <Button variant="ghost" className="hover:bg-card/60" onClick={() => setFresh(null)}>
              Done
            </Button>
          </div>
        </div>
      )}

      {loading && codes.length === 0 ? (
        <ListSkeleton rows={2} />
      ) : loadError ? (
        <LoadError>{loadError}</LoadError>
      ) : codes.length === 0 ? (
        <EmptyState title="No codes yet">
          Create one above and send it to the person you want to invite.
        </EmptyState>
      ) : (
        <ul className="space-y-2" aria-label="Sign-up codes">
          {codes.map((c) => {
            const status = statusOf(c);
            return (
              <li key={c.id} className={cn(PANEL, "flex items-center gap-3 p-4")}>
                <span
                  aria-hidden="true"
                  className={cn(
                    "hidden h-11 w-11 shrink-0 place-items-center rounded-full sm:grid [&_svg]:size-5",
                    status.active ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground",
                  )}
                >
                  <Ticket />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-mono text-sm font-semibold tracking-wider">
                      •••••-•{c.code_hint}
                    </span>
                    <Chip tone={status.active ? "good" : "quiet"}>{status.text}</Chip>
                    {c.label && (
                      <span className="min-w-0 truncate text-sm font-semibold">{c.label}</span>
                    )}
                  </div>
                  <p className="mt-1 text-[13px] leading-snug text-muted-foreground">
                    Used {c.use_count} of {c.max_uses}
                    {" · "}
                    {c.expires_at ? `stops working ${dateText(c.expires_at)}` : "never expires"}
                    {" · "}made {dateText(c.created_at)}
                  </p>
                  {c.used_by.length > 0 && (
                    <p className="mt-1 text-[13px] leading-snug">
                      Joined: {c.used_by.map((u) => `@${u.username}`).join(", ")}
                    </p>
                  )}
                </div>
                {status.active && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => switchOff(c)}
                    className="h-9 shrink-0 px-3.5 shadow-none"
                  >
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
