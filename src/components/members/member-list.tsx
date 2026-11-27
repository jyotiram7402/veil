"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Archive, ChevronDown, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/chat/user-avatar";
import { ScreenHeader } from "@/components/layout/screen-header";
import { AddSomeoneDialog } from "@/components/members/add-someone-dialog";
import { useMembers } from "@/components/members/members-provider";
import { nameOf, statusOf, type HashcodeRequest, type Person } from "@/components/members/types";
import { lastSeen } from "@/lib/format";
import { usePresenceStore } from "@/store/presence-store";
import { useSessionStore } from "@/store/session-store";
import { cn } from "@/lib/utils";

const ROW =
  "flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

const TONE = {
  online: "font-medium text-online-ink",
  blocked: "text-destructive",
  attention: "font-semibold text-foreground",
  plain: "text-muted-foreground",
};

function byName(a: Person, b: Person): number {
  return nameOf(a).localeCompare(nameOf(b), undefined, { sensitivity: "base" });
}

export function MemberList({ selectedId }: { selectedId: string | null }) {
  const { people, peopleError, requests, reload } = useMembers();
  const meId = useSessionStore((s) => s.profile?.id);
  const online = usePresenceStore((s) => s.online);
  const [addOpen, setAddOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const active = useMemo(
    () => (people ?? []).filter((p) => !p.archived && p.id !== meId).sort(byName),
    [people, meId],
  );
  const archived = useMemo(
    () => (people ?? []).filter((p) => p.archived && p.id !== meId).sort(byName),
    [people, meId],
  );
  const asked = useMemo(() => {
    const byId = new Map((people ?? []).map((p) => [p.id, p]));
    return requests.flatMap((r) => {
      const person = byId.get(r.user_id);
      return person && !person.archived ? [{ request: r, person }] : [];
    });
  }, [people, requests]);
  const askedIds = useMemo(() => new Set(asked.map((a) => a.person.id)), [asked]);
  const onlineCount = active.filter((p) => online.has(p.id)).length;

  useEffect(() => {
    if (selectedId && archived.some((p) => p.id === selectedId)) setShowArchived(true);
  }, [selectedId, archived]);

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
            {asked.length > 0 && (
              <section aria-labelledby="requests-heading" className="mb-4">
                <h2 id="requests-heading" className="px-3 pb-1 pt-1 text-[15px] font-bold">
                  Hashcode requests
                </h2>
                <ul>
                  {asked.map(({ request, person }) => (
                    <RequestRow
                      key={request.id}
                      request={request}
                      person={person}
                      selected={person.id === selectedId}
                    />
                  ))}
                </ul>
              </section>
            )}

            {active.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <p className="text-base font-bold">No one here yet</p>
                <p className="mx-auto mt-1 max-w-[17rem] text-sm text-muted-foreground">
                  Add someone, then send them their invite link, name and hashcode.
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
                    asked={askedIds.has(p.id)}
                    selected={p.id === selectedId}
                  />
                ))}
              </ul>
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
    </>
  );
}

function PersonRow({
  person,
  online,
  asked = false,
  selected,
}: {
  person: Person;
  online: boolean;
  asked?: boolean;
  selected: boolean;
}) {
  const status = statusOf(person, online, asked);
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

function RequestRow({
  request,
  person,
  selected,
}: {
  request: HashcodeRequest;
  person: Person;
  selected: boolean;
}) {
  return (
    <li>
      <Link
        href={`/admin/${person.id}`}
        aria-current={selected ? "page" : undefined}
        className={cn(ROW, selected ? "bg-accent" : "bg-muted/60 hover:bg-muted active:bg-muted")}
      >
        <UserAvatar
          userId={person.id}
          username={person.username}
          displayName={person.display_name}
          avatarUrl={person.avatar_url}
          size="lg"
        />
        <div className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold">{nameOf(person)}</span>
          <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
            Asked {lastSeen(request.created_at)}
            {request.device ? ` · ${request.device}` : ""}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-primary px-2.5 py-1 text-[12px] font-semibold text-primary-foreground">
          Answer
        </span>
      </Link>
    </li>
  );
}
