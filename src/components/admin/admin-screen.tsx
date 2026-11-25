"use client";

import { useRef, useState } from "react";
import { ScreenHeader } from "@/components/layout/screen-header";
import { MembersTab } from "@/components/admin/members-tab";
import { SignupCodesTab } from "@/components/admin/signup-codes-tab";
import { DefaultsTab } from "@/components/admin/defaults-tab";
import { AccountTab } from "@/components/admin/account-tab";
import { cn } from "@/lib/utils";

export type AdminTab = "members" | "codes" | "archive" | "defaults" | "account";

const TABS: { id: AdminTab; label: string }[] = [
  { id: "members", label: "Members" },
  { id: "codes", label: "Sign-up codes" },
  { id: "archive", label: "Archive" },
  { id: "defaults", label: "Defaults" },
  { id: "account", label: "Account" },
];

export function AdminScreen({ initialTab = "members" }: { initialTab?: AdminTab }) {
  const [tab, setTab] = useState<AdminTab>(initialTab);
  const scrollRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef(new Map<AdminTab, HTMLButtonElement>());

  function choose(next: AdminTab, focus = false) {
    setTab(next);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    const el = tabRefs.current.get(next);
    if (focus) el?.focus();
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const at = TABS.findIndex((t) => t.id === tab);
    let next = -1;
    if (e.key === "ArrowRight") next = (at + 1) % TABS.length;
    else if (e.key === "ArrowLeft") next = (at - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TABS.length - 1;
    if (next < 0) return;
    e.preventDefault();
    choose(TABS[next]!.id, true);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ScreenHeader title="Members" />
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="sticky top-0 z-10 bg-background">
          <div
            role="tablist"
            aria-label="Admin sections"
            onKeyDown={onKeyDown}
            className="no-scrollbar mx-auto flex max-w-2xl gap-2 overflow-x-auto px-4 py-3 sm:px-6"
          >
            {TABS.map((t) => {
              const selected = t.id === tab;
              return (
                <button
                  key={t.id}
                  ref={(el) => {
                    if (el) tabRefs.current.set(t.id, el);
                    else tabRefs.current.delete(t.id);
                  }}
                  type="button"
                  role="tab"
                  id={`admin-tab-${t.id}`}
                  aria-selected={selected}
                  aria-controls="admin-panel"
                  tabIndex={selected ? 0 : -1}
                  onClick={() => choose(t.id)}
                  className={cn(
                    "h-9 shrink-0 rounded-full px-4 text-sm font-semibold transition-colors duration-150",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    selected
                      ? "bg-foreground text-background"
                      : "border border-border/70 bg-card text-foreground hover:bg-accent",
                  )}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
        <div
          id="admin-panel"
          role="tabpanel"
          aria-labelledby={`admin-tab-${tab}`}
          className="mx-auto w-full max-w-2xl px-4 pb-10 pt-1 sm:px-6"
        >
          {tab === "members" && <MembersTab archived={false} />}
          {tab === "codes" && <SignupCodesTab />}
          {tab === "archive" && <MembersTab key="archive" archived />}
          {tab === "defaults" && <DefaultsTab />}
          {tab === "account" && <AccountTab />}
        </div>
      </div>
    </div>
  );
}
