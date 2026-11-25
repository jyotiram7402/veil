"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Archive, ChevronDown, Ticket, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { UserAvatar } from "@/components/chat/user-avatar";
import { ScreenHeader } from "@/components/layout/screen-header";
import { AddSomeoneDialog } from "@/components/members/add-someone-dialog";
import { useMembers } from "@/components/members/members-provider";
import {
  codeIsActive,
  codeLine,
  codeTitle,
  nameOf,
  statusOf,
  type Person,
  type SignupCode,
} from "@/components/members/types";
import { usePresenceStore } from "@/store/presence-store";
import { useSessionStore } from "@/store/session-store";
import { apiErrorMessage, cn } from "@/lib/utils";

const ROW =
  "flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

const TONE = {
  online: "font-medium text-online-ink",
  blocked: "text-destructive",
  plain: "text-muted-foreground",
};

function byName(a: Person, b: Person): number {
  return nameOf(a).localeCompare(nameOf(b), undefined, { sensitivity: "base" });
}

export function MemberList({ selectedId }: { selectedId: string | null }) {
  const { people, peopleError, codes, codesError, reload, patchCode } = useMembers();
  const meId = useSessionStore((s) => s.profile?.id);
  const online = usePresenceStore((s) => s.online);
  const { confirm, dialog } = useConfirm();
  const [addOpen, setAddOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [showPastCodes, setShowPastCodes] = useState(false);

  const active = useMemo(
    () => (people ?? []).filter((p) => !p.archived && p.id !== meId).sort(byName),
    [people, meId],
  );
  const archived = useMemo(
    () => (people ?? []).filter((p) => p.archived && p.id !== meId).sort(byName),
    [people, meId],
  );
  const liveCodes = (codes ?? []).filter(codeIsActive);
  const pastCodes = (codes ?? []).filter((c) => !codeIsActive(c));
  const onlineCount = active.filter((p) => online.has(p.id)).length;

  useEffect(() => {
    if (selectedId && archived.some((p) => p.id === selectedId)) setShowArchived(true);
  }, [selectedId, archived]);

  async function switchOff(code: SignupCode) {
    const ok = await confirm({
      title: "Switch this code off?",
      body: "Nobody new can sign up with it. People who already joined with it keep their accounts.",
      confirmLabel: "Switch off",
      destructive: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/admin/signup-codes/${code.id}`, { method: "DELETE" }).catch(
      () => null,
    );
    if (!res) {
      toast.error("No connection. Check your internet and try again.");
      return;
    }
    if (!res.ok) {
      const body: unknown = await res.json().catch(() => null);
      toast.error(apiErrorMessage(body, "Couldn't switch the code off. Try again."));
      return;
    }
    patchCode(code.id, { revoked_at: new Date().toISOString() });
    toast.success("Code switched off");
  }

  const count = active.length;
  const subtitle =
    people === null
      ? peopleError
        ? "Not loaded"
        : "Loading…"
      : `${count} ${count === 1 ? "person" : "people"}${onlineCount > 0 ? ` · ${onlineCount} online` : ""}`;

  return (
    <>
      <ScreenHeader
        title="Members"
        subtitle={subtitle}
        back={{ href: "/chats", label: "Back to chats", hideFrom: "md" }}
        actions={
          <Button onClick={() => setAddOpen(true)} className="[&_svg]:size-[18px]">
            <UserPlus />
            <span className="hidden min-[400px]:inline">Add someone</span>
            <span className="min-[400px]:hidden">Add</span>
          </Button>
        }
      />

      <div className="mx-5 h-px shrink-0 bg-border" />

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-8 pt-2">
        {people === null && peopleError ? (
          <div className="px-6 py-14 text-center" role="alert">
            <p className="text-base font-bold">Members didn&apos;t load</p>
            <p className="mt-1 text-sm text-muted-foreground">{peopleError}</p>
            <Button className="mt-5" variant="secondary" onClick={() => void reload()}>
              Try again
            </Button>
          </div>
        ) : people === null ? (
          <ul aria-label="Loading members" aria-busy="true">
            {[0, 1, 2, 3].map((i) => (
              <li key={i} className="flex items-center gap-3 px-3 py-2.5">
                <Skeleton className="h-12 w-12 rounded-full bg-muted" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-32 bg-muted" />
                  <Skeleton className="h-3 w-48 bg-muted" />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <>
            {active.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <p className="text-base font-bold">No one here yet</p>
                <p className="mx-auto mt-1 max-w-[17rem] text-sm text-muted-foreground">
                  Add someone and they get a personal link, or a code to sign up with.
                </p>
                <Button className="mt-5" onClick={() => setAddOpen(true)}>
                  <UserPlus /> Add someone
                </Button>
              </div>
            ) : (
              <ul aria-label="Members">
                {active.map((p) => (
                  <PersonRow
                    key={p.id}
                    person={p}
                    online={online.has(p.id)}
                    selected={p.id === selectedId}
                  />
                ))}
              </ul>
            )}

            {(liveCodes.length > 0 || pastCodes.length > 0 || (codes === null && codesError)) && (
              <section aria-labelledby="codes-heading" className="mt-6">
                <h2 id="codes-heading" className="px-3 pb-1 text-[15px] font-bold">
                  Sign-up codes
                </h2>
                {codes === null ? (
                  <p role="alert" className="px-3 py-2 text-[13px] text-destructive">
                    {codesError}
                  </p>
                ) : liveCodes.length === 0 ? (
                  <p className="px-3 py-2 text-[13px] text-muted-foreground">
                    No code works right now. Make one with Add someone.
                  </p>
                ) : (
                  <ul>
                    {liveCodes.map((c) => (
                      <CodeRow key={c.id} code={c} onSwitchOff={() => void switchOff(c)} />
                    ))}
                  </ul>
                )}
                {pastCodes.length > 0 && (
                  <>
                    <button
                      type="button"
                      aria-expanded={showPastCodes}
                      onClick={() => setShowPastCodes((v) => !v)}
                      className={cn(ROW, "py-2 text-[13px] font-semibold hover:bg-muted/70")}
                    >
                      <span className="flex-1">Codes that no longer work · {pastCodes.length}</span>
                      <ChevronDown
                        aria-hidden="true"
                        className={cn(
                          "h-4 w-4 text-muted-foreground transition-transform duration-200",
                          showPastCodes && "rotate-180",
                        )}
                      />
                    </button>
                    {showPastCodes && (
                      <ul>
                        {pastCodes.map((c) => (
                          <CodeRow key={c.id} code={c} />
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </section>
            )}

            {archived.length > 0 && (
              <section aria-label="Archived" className="mt-6">
                <button
                  type="button"
                  aria-expanded={showArchived}
                  onClick={() => setShowArchived((v) => !v)}
                  className={cn(ROW, "hover:bg-muted/70 active:bg-muted")}
                >
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-muted">
                    <Archive className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold">Archived</span>
                    <span className="block truncate text-[13px] text-muted-foreground">
                      {archived.length} {archived.length === 1 ? "person" : "people"} who can&apos;t
                      sign in
                    </span>
                  </span>
                  <ChevronDown
                    aria-hidden="true"
                    className={cn(
                      "h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200",
                      showArchived && "rotate-180",
                    )}
                  />
                </button>
                {showArchived && (
                  <ul aria-label="Archived people">
                    {archived.map((p) => (
                      <PersonRow key={p.id} person={p} online={false} selected={p.id === selectedId} />
                    ))}
                  </ul>
                )}
              </section>
            )}
          </>
        )}
      </div>

      <AddSomeoneDialog open={addOpen} onOpenChange={setAddOpen} />
      {dialog}
    </>
  );
}

function PersonRow({
  person,
  online,
  selected,
}: {
  person: Person;
  online: boolean;
  selected: boolean;
}) {
  const status = statusOf(person, online);
  return (
    <li>
      <Link
        href={`/admin/${person.id}`}
        aria-current={selected ? "page" : undefined}
        className={cn(ROW, selected ? "bg-accent" : "hover:bg-muted/70 active:bg-muted")}
      >
        <UserAvatar
          userId={person.id}
          username={person.username}
          displayName={person.display_name}
          avatarUrl={person.avatar_url}
          size="lg"
          showPresence={!person.archived}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[15px] font-semibold">{nameOf(person)}</span>
            {person.is_admin && (
              <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-secondary-foreground">
                Admin
              </span>
            )}
          </div>
          <p className={cn("mt-0.5 truncate text-[13px]", TONE[status.tone])}>{status.text}</p>
        </div>
      </Link>
    </li>
  );
}

function CodeRow({ code, onSwitchOff }: { code: SignupCode; onSwitchOff?: () => void }) {
  const joined = code.used_by.map((u) => `@${u.username}`).join(", ");
  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-muted">
        <Ticket className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold">{codeTitle(code)}</p>
        <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">
          {code.label?.trim() && `Ends ${code.code_hint} · `}
          {codeLine(code)}
        </p>
        {joined && (
          <p className="mt-0.5 truncate text-[13px] text-muted-foreground">Joined: {joined}</p>
        )}
      </div>
      {onSwitchOff && (
        <Button
          size="sm"
          variant="outline"
          onClick={onSwitchOff}
          aria-label={`Switch off ${codeTitle(code)}`}
          className="shrink-0"
        >
          Switch off
        </Button>
      )}
    </li>
  );
}
