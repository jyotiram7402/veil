"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { apiErrorMessage } from "@/lib/utils";
import type { Person, SignupCode } from "@/components/members/types";

type MembersState = {
  people: Person[] | null;
  peopleError: string | null;
  codes: SignupCode[] | null;
  codesError: string | null;
  reload: () => Promise<void>;
  patchPerson: (id: string, patch: Partial<Person>) => void;
  dropPerson: (id: string) => void;
  addCode: (code: SignupCode) => void;
  patchCode: (id: string, patch: Partial<SignupCode>) => void;
};

const MembersContext = createContext<MembersState | null>(null);

export function MembersProvider({ children }: { children: React.ReactNode }) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [peopleError, setPeopleError] = useState<string | null>(null);
  const [codes, setCodes] = useState<SignupCode[] | null>(null);
  const [codesError, setCodesError] = useState<string | null>(null);
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

  const loadCodes = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/signup-codes", { cache: "no-store" });
      const body: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        setCodesError(apiErrorMessage(body, "Couldn't load the sign-up codes."));
        return;
      }
      setCodesError(null);
      setCodes((body as { codes: SignupCode[] }).codes);
    } catch {
      setCodesError("No connection, so the sign-up codes didn't load.");
    }
  }, []);

  const reload = useCallback(async () => {
    await Promise.all([loadPeople(), loadCodes()]);
  }, [loadPeople, loadCodes]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const patchPerson = useCallback((id: string, patch: Partial<Person>) => {
    setPeople((list) => list?.map((p) => (p.id === id ? { ...p, ...patch } : p)) ?? list);
  }, []);
  const dropPerson = useCallback((id: string) => {
    setPeople((list) => list?.filter((p) => p.id !== id) ?? list);
  }, []);
  const addCode = useCallback((code: SignupCode) => {
    setCodes((list) => [code, ...(list ?? [])]);
  }, []);
  const patchCode = useCallback((id: string, patch: Partial<SignupCode>) => {
    setCodes((list) => list?.map((c) => (c.id === id ? { ...c, ...patch } : c)) ?? list);
  }, []);

  const value = useMemo(
    () => ({
      people,
      peopleError,
      codes,
      codesError,
      reload,
      patchPerson,
      dropPerson,
      addCode,
      patchCode,
    }),
    [people, peopleError, codes, codesError, reload, patchPerson, dropPerson, addCode, patchCode],
  );
  return <MembersContext.Provider value={value}>{children}</MembersContext.Provider>;
}

export function useMembers(): MembersState {
  const ctx = useContext(MembersContext);
  if (!ctx) throw new Error("useMembers() outside <MembersProvider>");
  return ctx;
}

export function useJoinedWithCode(personId: string): boolean | null {
  const { codes } = useMembers();
  if (!codes) return null;
  return codes.some((c) => c.used_by.some((u) => u.id === personId));
}
