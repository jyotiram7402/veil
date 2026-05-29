"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * For non-admin (invite-link) users only. Ends the Supabase session the
 * instant the tab is hidden, the page is unloaded, or the window loses
 * focus. To return, the user must re-open their invite link.
 *
 * The actual cookie kill happens server-side via /api/auth/logout so the
 * httpOnly auth cookie is properly cleared.
 */
export function useEphemeralSession(enabled: boolean = true) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) return;
    let killed = false;
    const kill = (redirect: boolean) => {
      if (killed) return;
      killed = true;
      // sendBeacon for pagehide so the request makes it before the page dies
      try {
        const blob = new Blob(["{}"], { type: "application/json" });
        navigator.sendBeacon("/api/auth/end-session", blob);
      } catch {
        // ignore
      }
      // Best-effort: also call the standard logout so the cookie clears in
      // the SPA before navigation, in case the user comes back to the same tab
      void fetch("/api/auth/logout", { method: "POST", keepalive: true }).catch(
        () => undefined,
      );
      if (redirect) router.replace("/expired");
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") kill(false);
    };
    const onPageHide = () => kill(false);
    const onBlur = () => kill(false);

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("blur", onBlur);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("blur", onBlur);
    };
  }, [router, enabled]);
}
