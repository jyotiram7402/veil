"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  Ban,
  BellRing,
  Clock,
  Copy,
  KeyRound,
  Link as LinkIcon,
  Loader2,
  MessageSquare,
  Power,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldCheck,
  TextCursorInput,
  Trash2,
  Unlink,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useConfirm, type ConfirmOptions } from "@/components/ui/confirm-dialog";
import { UserAvatar } from "@/components/chat/user-avatar";
import { ScreenHeader } from "@/components/layout/screen-header";
import {
  GROUP_FIELD,
  Group,
  GroupButtonRow,
  GroupDisclosureRow,
  GroupRow,
} from "@/components/layout/grouped";
import { LinkBox, copyLink } from "@/components/members/link-box";
import { useMembers, useRequestFor } from "@/components/members/members-provider";
import { firstName, nameOf, seen, type Person } from "@/components/members/types";
import {
  CHAT_RULES,
  DISAPPEARING_CONFIRM,
  clampLength,
  everyoneLength,
  everyoneValue,
} from "@/components/settings/chat-rules";
import { LengthInput } from "@/components/settings/length-input";
import { copyText } from "@/lib/clipboard";
import { lastSeen } from "@/lib/format";
import {
  DIRECT_LINK_HOURS,
  INVITE_HOURS,
  KEEP_OPEN,
  KEEP_OPEN_LABELS,
  endsLine,
  linkState,
  type KeepOpen,
} from "@/lib/invite-window";
import { usePresenceStore } from "@/store/presence-store";
import { useSessionStore } from "@/store/session-store";
import { apiErrorMessage, cn } from "@/lib/utils";

type Confirm = (options: ConfirmOptions) => Promise<boolean>;

const JSON_HEADERS = { "Content-Type": "application/json" };

export function MemberScreen({ id }: { id: string }) {
  const { people, peopleError, reload } = useMembers();
  const meId = useSessionStore((s) => s.profile?.id);
  const { confirm, dialog } = useConfirm();
  const person = people?.find((p) => p.id === id) ?? null;

  let body: React.ReactNode;
  if (people === null && peopleError) {
    body = (
      <Notice title="This page didn't load" text={peopleError}>
        <Button variant="secondary" onClick={() => void reload()}>
          Try again
        </Button>
      </Notice>
    );
  } else if (people === null) {
    body = <HeroSkeleton />;
  } else if (id === meId) {
    body = (
      <Notice title="This is you" text="Your name, photo and password are in Settings.">
        <Button asChild variant="secondary">
          <Link href="/settings">Open Settings</Link>
        </Button>
      </Notice>
    );
  } else if (!person) {
    body = (
      <Notice title="This person isn't here" text="They may have been deleted.">
        <Button asChild variant="secondary">
          <Link href="/admin">Back to Members</Link>
        </Button>
      </Notice>
    );
  } else {
    body = <PersonPage key={person.id} person={person} confirm={confirm} />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ScreenHeader
        back={{ href: "/admin", label: "Back to Members", hideFrom: "xl" }}
        className="pb-0"
      />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-xl space-y-8 px-4 pb-12 pt-1 sm:px-6">{body}</div>
      </div>
      {dialog}
    </div>
  );
}

function Notice({
  title,
  text,
  children,
}: {
  title: string;
  text: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="py-16 text-center">
      <p className="text-base font-bold">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{text}</p>
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}

function HeroSkeleton() {
  return (
    <div className="flex flex-col items-center pt-2" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-24 w-24 rounded-full bg-muted" />
      <Skeleton className="mt-5 h-6 w-40 bg-muted" />
      <Skeleton className="mt-2 h-4 w-52 bg-muted" />
    </div>
  );
}

function PersonPage({ person, confirm }: { person: Person; confirm: Confirm }) {
  const member = !person.is_admin && !person.archived;
  return (
    <>
      <Hero person={person} />
      {!person.archived &&
        (person.is_admin ? (
          <Group title="Sign-in">
            <GroupRow
              icon={ShieldCheck}
              title="Admin"
              description="Signs in at Admin login with their own password."
            />
          </Group>
        ) : (
          <SignInGroup person={person} confirm={confirm} />
        ))}
      {member && <RulesGroup person={person} confirm={confirm} />}
      <AccountGroup person={person} confirm={confirm} />
    </>
  );
}

function Hero({ person }: { person: Person }) {
  const router = useRouter();
  const online = usePresenceStore((s) => s.online.has(person.id));
  const [opening, setOpening] = useState(false);
  const invite = person.invite;
  const member = !person.is_admin && !person.archived;

  async function openChat() {
    setOpening(true);
    try {
      const res = await fetch(`/api/admin/users/${person.id}/chat`, { method: "POST" });
      const body: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(apiErrorMessage(body, "Couldn't open the chat. Try again."));
        return;
      }
      router.push(`/chats/${(body as { chatId: string }).chatId}`);
    } catch {
      toast.error("No connection. Check your internet and try again.");
    } finally {
      setOpening(false);
    }
  }

  const badge = person.archived
    ? { text: "Archived · can't sign in", className: "bg-secondary text-secondary-foreground" }
    : person.suspended
      ? { text: "Suspended · can't sign in", className: "bg-destructive/10 text-destructive" }
      : person.is_admin
        ? { text: "Admin", className: "bg-secondary text-secondary-foreground" }
        : null;

  return (
    <div className="flex flex-col items-center text-center">
      <UserAvatar
        userId={person.id}
        username={person.username}
        displayName={person.display_name}
        avatarUrl={person.avatar_url}
        size="hero"
        showPresence={!person.archived}
      />
      <h1 className="mt-4 max-w-full truncate text-2xl font-extrabold tracking-tight">
        {nameOf(person)}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        @{person.username} ·{" "}
        {online && !person.archived ? (
          <span className="font-medium text-online-ink">Online</span>
        ) : (
          seen(person.last_seen_at).toLowerCase()
        )}
      </p>
      {badge && (
        <p className={cn("mt-3 rounded-full px-3 py-1 text-[13px] font-semibold", badge.className)}>
          {badge.text}
        </p>
      )}
      {member && (
        <div className="mt-5 flex w-full max-w-xs gap-3">
          <Button size="lg" className="flex-1" onClick={() => void openChat()} disabled={opening}>
            {opening ? <Loader2 className="animate-spin" /> : <MessageSquare />} Chat
          </Button>
          {invite?.enabled && (
            <Button
              size="lg"
              variant="secondary"
              className="flex-1"
              onClick={() => void copyLink(invite.url)}
            >
              <Copy /> Copy link
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function HashcodeForm({
  label,
  hint,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  label: string;
  hint: string;
  submitLabel: string;
  onSubmit: (hashcode: string) => Promise<string | null>;
  onCancel: () => void;
}) {
  const id = useId();
  const [hashcode, setHashcode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (hashcode.trim().length < 4) {
      setError("Use at least 4 characters.");
      return;
    }
    setBusy(true);
    setError(await onSubmit(hashcode.trim()));
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-hashcode`} className="text-[13px] font-semibold">
          {label}
        </Label>
        <Input
          id={`${id}-hashcode`}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoFocus
          maxLength={128}
          value={hashcode}
          onChange={(e) => {
            setHashcode(e.target.value);
            setError(null);
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-hint${error ? ` ${id}-err` : ""}`}
          className={GROUP_FIELD}
        />
        <p id={`${id}-hint`} className="text-[13px] text-muted-foreground">
          {hint}
        </p>
      </div>
      {error && (
        <p id={`${id}-err`} role="alert" className="text-[13px] font-medium text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>
          {busy && <Loader2 className="animate-spin" />}
          {submitLabel}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

type Panel = "keep" | "hashcode" | "direct" | "new-link" | "make-link";

function SignInGroup({ person, confirm }: { person: Person; confirm: Confirm }) {
  const { reload, patchPerson, dropRequestsFor } = useMembers();
  const request = useRequestFor(person.id);
  const [open, setOpen] = useState<Panel | null>(null);
  const [directUrl, setDirectUrl] = useState<string | null>(null);
  const [making, setMaking] = useState(false);
  const first = firstName(person);
  const invite = person.invite;
  const toggle = (which: Panel) => (next: boolean) => {
    setOpen(next ? which : null);
    setDirectUrl(null);
  };

  async function setEnabled(enabled: boolean) {
    if (!invite) return;
    patchPerson(person.id, { invite: { ...invite, enabled } });
    const res = await fetch(`/api/admin/users/${person.id}/invite`, {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify({ enabled }),
    }).catch(() => null);
    if (!res?.ok) {
      patchPerson(person.id, { invite: { ...invite, enabled: !enabled } });
      toast.error("Couldn't change the link. Try again.");
    }
  }

  async function keepOpen(choice: KeepOpen) {
    if (!invite) return;
    try {
      const res = await fetch(`/api/admin/users/${person.id}/invite`, {
        method: "PATCH",
        headers: JSON_HEADERS,
        body: JSON.stringify({ keepOpen: choice }),
      });
      const body: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(apiErrorMessage(body, "Couldn't change the link. Try again."));
        return;
      }
      const expires_at = (body as { expires_at?: string | null } | null)?.expires_at ?? null;
      patchPerson(person.id, { invite: { ...invite, expires_at } });
      toast.success(
        choice === "always"
          ? "The link never runs out now"
          : `The link is open for ${KEEP_OPEN_LABELS[choice]}`,
      );
      setOpen(null);
    } catch {
      toast.error("No connection. Check your internet and try again.");
    }
  }

  async function changeHashcode(hashcode: string): Promise<string | null> {
    try {
      const res = await fetch(`/api/admin/users/${person.id}/invite`, {
        method: "PATCH",
        headers: JSON_HEADERS,
        body: JSON.stringify({ password: hashcode }),
      });
      const body: unknown = await res.json().catch(() => null);
      if (!res.ok) return apiErrorMessage(body, "That didn't work. Try again.");
      toast.success(`Hashcode changed. Tell ${first} the new one.`);
      setOpen(null);
      return null;
    } catch {
      return "No connection. Check your internet and try again.";
    }
  }

  async function makeLink(hashcode?: string): Promise<string | null> {
    try {
      const res = await fetch(`/api/admin/users/${person.id}/invite`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(hashcode ? { password: hashcode } : {}),
      });
      const body: unknown = await res.json().catch(() => null);
      if (!res.ok) return apiErrorMessage(body, "That didn't work. Try again.");
      const url = (body as { invite: { url: string } }).invite.url;
      const copied = await copyText(url);
      toast.success(
        copied
          ? `New link copied. Send it to ${first}${hashcode ? " with the hashcode" : ""}.`
          : "New link made. Copy it from Invite link.",
      );
      setOpen(null);
      await reload();
      return null;
    } catch {
      return "No connection. Check your internet and try again.";
    }
  }

  async function makeNewLink() {
    if (making) return;
    setMaking(true);
    const error = await makeLink();
    setMaking(false);
    if (error) toast.error(error);
  }

  async function makeDirect(hashcode: string): Promise<string | null> {
    try {
      const res = await fetch(`/api/admin/users/${person.id}/direct-link`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ hashcode }),
      });
      const body: unknown = await res.json().catch(() => null);
      if (!res.ok) return apiErrorMessage(body, "Couldn't make the link. Try again.");
      setDirectUrl((body as { url: string }).url);
      dropRequestsFor(person.id);
      void reload();
      return null;
    } catch {
      return "No connection. Check your internet and try again.";
    }
  }

  async function dismissRequest() {
    if (!request) return;
    const res = await fetch(`/api/admin/hashcode-requests/${request.id}`, {
      method: "DELETE",
    }).catch(() => null);
    if (!res?.ok) {
      toast.error("Couldn't dismiss the request. Try again.");
      return;
    }
    dropRequestsFor(person.id);
    toast.success("Request dismissed");
  }

  async function removeLink() {
    const ok = await confirm({
      title: `Remove ${first}'s invite link?`,
      body: `The link stops working for good, and ${first} can't sign in until you make a new one.`,
      confirmLabel: "Remove link",
      destructive: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/admin/users/${person.id}/invite`, { method: "DELETE" }).catch(
      () => null,
    );
    if (!res?.ok) {
      toast.error("Couldn't remove the link. Try again.");
      return;
    }
    patchPerson(person.id, { invite: null });
    toast.success("Link removed");
  }

  const requestRow = request && (
    <GroupRow
      icon={BellRing}
      title="Asked for their hashcode"
      description={`${lastSeen(request.created_at)} · typed “${request.typed_name}”${
        request.device ? ` · ${request.device}` : ""
      }. Check it's really them, then send them a direct link.`}
      trailing={
        <Button size="sm" variant="ghost" onClick={() => void dismissRequest()} className="shrink-0">
          Dismiss
        </Button>
      }
    />
  );

  const directRow = (
    <GroupDisclosureRow
      icon={Send}
      title="Send a direct link"
      description={`Opens straight to their hashcode, already filled in. Works once, for ${DIRECT_LINK_HOURS} hours.`}
      open={open === "direct"}
      onOpenChange={toggle("direct")}
    >
      {directUrl ? (
        <div className="space-y-3">
          <p className="text-[13px] leading-snug text-muted-foreground">
            Send it to {first} only: whoever opens it can sign in as them.
          </p>
          <LinkBox url={directUrl} />
          <Button variant="ghost" className="w-full" onClick={() => toggle("direct")(false)}>
            Done
          </Button>
        </div>
      ) : (
        <HashcodeForm
          label="Their hashcode"
          hint="Type the one they have, or a new one. It becomes their hashcode."
          submitLabel="Make direct link"
          onSubmit={makeDirect}
          onCancel={() => setOpen(null)}
        />
      )}
    </GroupDisclosureRow>
  );

  if (!invite) {
    return (
      <Group title="Sign-in">
        {requestRow}
        <GroupRow
          icon={KeyRound}
          title="No invite link"
          description={`${first} can't sign in until you make one. If they're signed in now, they stay signed in.`}
        />
        <GroupDisclosureRow
          icon={LinkIcon}
          title="Make an invite link"
          description={`You choose the hashcode. The link works for ${INVITE_HOURS} hours.`}
          open={open === "make-link"}
          onOpenChange={toggle("make-link")}
        >
          <HashcodeForm
            label="Hashcode"
            hint="At least 4 characters, emoji too. Send it with the link."
            submitLabel="Make link"
            onSubmit={(hashcode) => makeLink(hashcode)}
            onCancel={() => setOpen(null)}
          />
        </GroupDisclosureRow>
        {directRow}
      </Group>
    );
  }

  const state = linkState(invite);
  const openLine = state === "off" ? "Switched off" : endsLine(invite.expires_at);
  const used =
    invite.use_count === 0
      ? "Not used to sign in yet"
      : `Signed in ${invite.use_count} ${invite.use_count === 1 ? "time" : "times"}${
          invite.last_used_at ? ` · last ${lastSeen(invite.last_used_at)}` : ""
        }`;

  return (
    <Group title="Sign-in">
      {requestRow}
      <GroupRow
        icon={LinkIcon}
        title="Invite link"
        description={
          <>
            <span className="block truncate">{invite.url.replace(/^https?:\/\//, "")}</span>
            <span className={cn("block", state === "ended" && "font-medium text-destructive")}>
              {openLine}
            </span>
            <span className="block">{used}</span>
          </>
        }
        trailing={
          <Button
            size="icon"
            variant="ghost"
            onClick={() => void copyLink(invite.url)}
            aria-label="Copy link"
            className="shrink-0"
          >
            <Copy />
          </Button>
        }
      />
      <GroupDisclosureRow
        icon={Clock}
        title="Keep it open"
        description={
          state === "ended"
            ? `It ran out, so ${first} can't sign in. Open it again for a while.`
            : `${first} can sign in with their name and hashcode while it's open.`
        }
        open={open === "keep"}
        onOpenChange={toggle("keep")}
      >
        <div className="flex flex-wrap gap-2">
          {KEEP_OPEN.map((choice) => (
            <Button key={choice} variant="secondary" onClick={() => void keepOpen(choice)}>
              {choice === "always" ? "Always" : `${KEEP_OPEN_LABELS[choice]} from now`}
            </Button>
          ))}
        </div>
      </GroupDisclosureRow>
      <GroupRow
        icon={Power}
        title="Link works"
        description={
          invite.enabled
            ? `${first} can sign in while the link is open.`
            : "Switched off: nobody can sign in with it until you switch it back on."
        }
        trailing={
          <Switch
            checked={invite.enabled}
            onCheckedChange={(v) => void setEnabled(v)}
            aria-label="Link works"
          />
        }
      />
      <GroupDisclosureRow
        icon={KeyRound}
        title="Change the hashcode"
        description={`Only you can set it. ${first} types it with their name.`}
        open={open === "hashcode"}
        onOpenChange={toggle("hashcode")}
      >
        <HashcodeForm
          label="New hashcode"
          hint="At least 4 characters, emoji too. The link stays the same."
          submitLabel="Change hashcode"
          onSubmit={changeHashcode}
          onCancel={() => setOpen(null)}
        />
      </GroupDisclosureRow>
      {directRow}
      <GroupDisclosureRow
        icon={RefreshCw}
        title="New invite link"
        description="The old link stops working at once. The hashcode stays the same."
        open={open === "new-link"}
        onOpenChange={toggle("new-link")}
      >
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void makeNewLink()} disabled={making}>
            {making && <Loader2 className="animate-spin" />}
            Make new link
          </Button>
          <Button variant="ghost" onClick={() => setOpen(null)} disabled={making}>
            Cancel
          </Button>
        </div>
      </GroupDisclosureRow>
      <GroupButtonRow
        icon={Unlink}
        title="Remove link"
        description={`${first} can't sign in until you make a new one.`}
        destructive
        onClick={() => void removeLink()}
      />
    </Group>
  );
}

function RulesGroup({ person, confirm }: { person: Person; confirm: Confirm }) {
  const first = firstName(person);
  const [own, setOwn] = useState<Record<string, unknown> | null>(null);
  const [everyone, setEveryone] = useState<Record<string, unknown>>({});
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [lengthKey, setLengthKey] = useState(0);

  useEffect(() => {
    let live = true;
    setFailed(false);
    void (async () => {
      try {
        const [mine, all] = await Promise.all([
          fetch(`/api/admin/users/${person.id}/settings`, { cache: "no-store" }),
          fetch("/api/admin/settings", { cache: "no-store" }),
        ]);
        if (!mine.ok || !all.ok) throw new Error("not loaded");
        const ownSettings = ((await mine.json()) as { settings?: Record<string, unknown> }).settings;
        const allSettings = ((await all.json()) as { settings?: Record<string, unknown> }).settings;
        if (!live) return;
        setOwn(ownSettings ?? {});
        setEveryone(allSettings ?? {});
      } catch {
        if (live) setFailed(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [person.id, attempt]);

  async function save(patch: Record<string, unknown>) {
    if (!own) return;
    const previous = Object.fromEntries(Object.keys(patch).map((key) => [key, own[key]]));
    const apply = (values: Record<string, unknown>) => (current: Record<string, unknown> | null) => {
      if (!current) return current;
      const next = { ...current };
      for (const [key, value] of Object.entries(values)) {
        if (value === null || value === undefined) delete next[key];
        else next[key] = value;
      }
      return next;
    };
    setOwn(apply(patch));
    const res = await fetch(`/api/admin/users/${person.id}/settings`, {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify(patch),
    }).catch(() => null);
    if (!res?.ok) {
      setOwn(apply(previous));
      toast.error("Couldn't save. Try again.");
    }
  }

  const askDisappearing = () =>
    confirm({
      title: DISAPPEARING_CONFIRM.title,
      confirmLabel: DISAPPEARING_CONFIRM.confirmLabel,
      destructive: true,
      body: DISAPPEARING_CONFIRM.paragraphs.map((p) => <p key={p}>{p}</p>),
    });

  async function backToEveryones(key: string) {
    if (
      key === "disappearing_messages" &&
      own?.disappearing_messages === false &&
      everyoneValue(everyone, "disappearing_messages") &&
      !(await askDisappearing())
    ) {
      return;
    }
    void save({ [key]: null });
  }

  const reset = (key: string, what: string) => (
    <>
      Just for {first} ·{" "}
      <button
        type="button"
        onClick={() => void backToEveryones(key)}
        aria-label={`Use everyone's setting for ${what}`}
        className="rounded font-semibold text-foreground underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Use everyone&apos;s
      </button>
    </>
  );

  if (failed) {
    return (
      <Group title={`Chat rules for ${first}`}>
        <GroupButtonRow
          icon={RefreshCw}
          title="Couldn't load the chat rules"
          description="Tap to try again."
          onClick={() => setAttempt((n) => n + 1)}
        />
      </Group>
    );
  }

  if (!own) {
    return (
      <Group title={`Chat rules for ${first}`}>
        {CHAT_RULES.map((rule) => (
          <GroupRow
            key={rule.key}
            icon={rule.icon}
            title={rule.title}
            description={<Skeleton className="mt-1 h-3 w-36 bg-muted" />}
          />
        ))}
      </Group>
    );
  }

  const lengthOwn = typeof own.max_message_length === "number" ? own.max_message_length : null;
  const lengthAll = everyoneLength(everyone);

  return (
    <Group
      title={`Chat rules for ${first}`}
      footer={
        <>
          The rules for everyone are in{" "}
          <Link
            href="/settings"
            className="rounded font-semibold text-foreground underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Settings
          </Link>
          .
        </>
      }
    >
      {CHAT_RULES.map((rule) => {
        const overridden = typeof own[rule.key] === "boolean";
        const value = overridden ? (own[rule.key] as boolean) : everyoneValue(everyone, rule.key);
        return (
          <GroupRow
            key={rule.key}
            icon={rule.icon}
            title={rule.title}
            description={
              overridden
                ? reset(rule.key, rule.title.toLowerCase())
                : `Same as everyone (${value ? "on" : "off"})`
            }
            trailing={
              <Switch
                checked={value}
                aria-label={`${rule.title} for ${first}`}
                onCheckedChange={async (next) => {
                  if (rule.key === "disappearing_messages" && next && !(await askDisappearing())) {
                    return;
                  }
                  void save({ [rule.key]: next });
                }}
              />
            }
          />
        );
      })}
      <GroupRow
        icon={TextCursorInput}
        title="Longest message"
        description={
          lengthOwn !== null
            ? reset("max_message_length", "the longest message")
            : `Same as everyone (${lengthAll.toLocaleString()} characters)`
        }
        trailing={
          <LengthInput
            key={`${lengthOwn}-${lengthKey}`}
            label={`Longest message for ${first}, in characters`}
            defaultValue={lengthOwn !== null ? String(lengthOwn) : ""}
            placeholder={String(lengthAll)}
            onCommit={(raw) => {
              if (raw.trim() === "") {
                if (lengthOwn !== null) void save({ max_message_length: null });
                return;
              }
              const n = clampLength(raw);
              if (n !== null && n !== lengthOwn) void save({ max_message_length: n });
              else setLengthKey((k) => k + 1);
            }}
          />
        }
      />
    </Group>
  );
}

function AccountGroup({ person, confirm }: { person: Person; confirm: Confirm }) {
  const router = useRouter();
  const { patchPerson, dropPerson } = useMembers();
  const busy = useRef(false);
  const first = firstName(person);

  async function call(url: string, init: RequestInit, fallback: string): Promise<boolean> {
    if (busy.current) return false;
    busy.current = true;
    try {
      const res = await fetch(url, init);
      if (!res.ok) {
        const body: unknown = await res.json().catch(() => null);
        toast.error(apiErrorMessage(body, fallback));
        return false;
      }
      return true;
    } catch {
      toast.error("No connection. Check your internet and try again.");
      return false;
    } finally {
      busy.current = false;
    }
  }

  async function setSuspended(next: boolean) {
    if (next) {
      const ok = await confirm({
        title: `Suspend ${first}?`,
        body: `${first} is signed out and can't sign in until you reinstate them. Your chat stays as it is.`,
        confirmLabel: "Suspend",
        destructive: true,
      });
      if (!ok) return;
    }
    const done = await call(
      `/api/admin/users/${person.id}/suspend`,
      { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify({ suspended: next }) },
      "Couldn't change that. Try again.",
    );
    if (!done) return;
    patchPerson(person.id, { suspended: next });
    toast.success(next ? `${first} is suspended` : `${first} can sign in again`);
  }

  async function archive() {
    const ok = await confirm({
      title: `Move ${first} to Archive?`,
      body: `${first} can't sign in any more and their link stops working. Your chat and its messages are kept, and you can restore ${first} later.`,
      confirmLabel: "Move to Archive",
      destructive: true,
    });
    if (!ok) return;
    const done = await call(
      `/api/admin/users/${person.id}`,
      { method: "DELETE" },
      "Couldn't archive. Try again.",
    );
    if (!done) return;
    patchPerson(person.id, { archived: true, suspended: true, invite: null });
    toast.success(`${first} is in Archive`);
  }

  async function restore() {
    const ok = await confirm({
      title: `Restore ${first}?`,
      body: `${first} comes back to Members. To sign in they need a new invite link, which you can make on this page.`,
      confirmLabel: "Restore",
    });
    if (!ok) return;
    const done = await call(
      `/api/admin/users/${person.id}/restore`,
      { method: "POST" },
      "Couldn't restore. Try again.",
    );
    if (!done) return;
    patchPerson(person.id, { archived: false, suspended: false });
    toast.success(`${first} is back`);
  }

  async function deleteForever() {
    const ok = await confirm({
      title: `Delete ${first} forever?`,
      body: (
        <>
          <p>
            {first}&apos;s account goes, and so does every message, photo and file in your chat.
          </p>
          <p className="font-semibold text-foreground">This can&apos;t be undone.</p>
        </>
      ),
      confirmLabel: "Delete forever",
      destructive: true,
    });
    if (!ok) return;
    const done = await call(
      `/api/admin/users/${person.id}?hard=1`,
      { method: "DELETE" },
      "Couldn't delete. Try again.",
    );
    if (!done) return;
    router.replace("/admin");
    dropPerson(person.id);
    toast.success(`${first} is deleted`);
  }

  if (person.archived) {
    return (
      <Group title="Account">
        <GroupButtonRow
          icon={ArchiveRestore}
          title="Restore"
          description="Back to Members. They need a new invite link to sign in."
          onClick={() => void restore()}
        />
        <GroupButtonRow
          icon={Trash2}
          title="Delete forever"
          description="Removes them and every message in your chat."
          destructive
          onClick={() => void deleteForever()}
        />
      </Group>
    );
  }

  return (
    <Group title="Account">
      {!person.is_admin &&
        (person.suspended ? (
          <GroupButtonRow
            icon={RotateCcw}
            title="Reinstate"
            description="Lets them sign in again while their invite link is open."
            onClick={() => void setSuspended(false)}
          />
        ) : (
          <GroupButtonRow
            icon={Ban}
            title="Suspend"
            description="Signs them out and stops them signing in. Your chat stays."
            onClick={() => void setSuspended(true)}
          />
        ))}
      <GroupButtonRow
        icon={Archive}
        title="Move to Archive"
        description="They can't sign in. Your chat and its messages are kept."
        destructive
        onClick={() => void archive()}
      />
    </Group>
  );
}
