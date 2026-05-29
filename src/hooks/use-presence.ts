"use client";

import { useEffect } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { usePresenceStore } from "@/store/presence-store";
import type { Profile } from "@/types/chat";

/**
 * Joins the global "rooms-presence" channel so every signed-in client tracks
 * who's online. We use Supabase Realtime presence — a built-in primitive
 * that we don't have to host ourselves.
 */
export function usePresence(me: Profile | null) {
  const setOnline = usePresenceStore((s) => s.setOnline);

  useEffect(() => {
    if (!me) return;
    const supabase = supabaseBrowser();

    const channel = supabase.channel("rooms-presence", {
      config: { presence: { key: me.id } },
    });

    const syncFromState = () => {
      const state = channel.presenceState();
      setOnline(Object.keys(state));
    };

    channel
      .on("presence", { event: "sync" }, syncFromState)
      .on("presence", { event: "join" }, syncFromState)
      .on("presence", { event: "leave" }, syncFromState)
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ userId: me.id, at: Date.now() });
        }
      });

    return () => {
      void channel.untrack();
      supabase.removeChannel(channel);
    };
  }, [me, setOnline]);
}
