"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { apiErrorMessage } from "@/lib/utils";
import type { HashcodeRequest, Person } from "@/components/members/types";

type MembersState = {
  people: Person[] | null;
  peopleError: string | null;
  requests: HashcodeRequest[];
  reload: () => Promise<void>;
  patchPerson: (id: string, patch: Partial<Person>) => void;
  dropPerson: (id: string) => void;
  dropRequestsFor: (userId: string) => void;
};

const MembersContext = createContext<MembersState | null>(null);

export function MembersProvider({ children }: { children: React.ReactNode }) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [peopleError, setPeopleError] = useState<string | null>(null);
  const [requests, setRequests] = useState<HashcodeRequest[]>([]);
  const loaded = useRef(false);

  const loadPeople = useCallback(async () => {
    let error: string;
    try {
      const res = await fetch("/api/admin/users", { cache: "no-store" });
      const body: unknown = await res.json().catch(() => null);
      if (res.ok) {
        setPeopleError(null);
        setPeople((body as { users: Person[] }).users);
        loaded.current = true;
        return;
      }
      error = apiErrorMessage(body, "Couldn't load your members.");
    } catch {
      error = "No connection. Check your internet and try again.";
    }
    if (loaded.current) toast.error(`The list didn't update. ${error}`);
    else setPeopleError(error);
  }, []);

  const loadRequests = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/hashcode-requests", { cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as { requests?: HashcodeRequest[] };
      setRequests(body.requests ?? []);
    } catch {}
  }, []);

  const reload = useCallback(async () => {
    await Promise.all([loadPeople(), loadRequests()]);
  }, [loadPeople, loadRequests]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void loadRequests();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [loadRequests]);

  const patchPerson = useCallback((id: string, patch: Partial<Person>) => {
    setPeople((list) => list?.map((p) => (p.id === id ? { ...p, ...patch } : p)) ?? list);
  }, []);
  const dropPerson = useCallback((id: string) => {
    setPeople((list) => list?.filter((p) => p.id !== id) ?? list);
  }, []);
  const dropRequestsFor = useCallback((userId: string) => {
    setRequests((list) => list.filter((r) => r.user_id !== userId));
  }, []);

  const value = useMemo(
    () => ({
      people,
      peopleError,
      requests,
      reload,
      patchPerson,
      dropPerson,
      dropRequestsFor,
    }),
    [people, peopleError, requests, reload, patchPerson, dropPerson, dropRequestsFor],
  );
  return <MembersContext.Provider value={value}>{children}</MembersContext.Provider>;
}

export function useMembers(): MembersState {
  const ctx = useContext(MembersContext);
  if (!ctx) throw new Error("useMembers() outside <MembersProvider>");
  return ctx;
}

export function useRequestFor(personId: string): HashcodeRequest | null {
  const { requests } = useMembers();
  return requests.find((r) => r.user_id === personId) ?? null;
}
