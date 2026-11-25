"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { mojiFor, parseMojiValue } from "@/lib/moji";
import { cn } from "@/lib/utils";
import { usePresenceStore } from "@/store/presence-store";

type Props = {
  userId?: string | null;
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
<<<<<<< HEAD
  /** sm 32px, md 40px, lg 48px, story 56px (the people row), xl 64px, hero 96px (a person's screen) */
  size?: "sm" | "md" | "lg" | "story" | "xl" | "hero";
  /** Show a green dot while this person is online. */
=======
  size?: "sm" | "md" | "lg" | "story" | "xl" | "2xl";
>>>>>>> 5c1d94054047b9a8e141db7699f22c3285dc1d90
  showPresence?: boolean;
  className?: string;
};

const SIZE: Record<NonNullable<Props["size"]>, string> = {
  sm: "h-8 w-8 text-[17px]",
  md: "h-10 w-10 text-[21px]",
  lg: "h-12 w-12 text-[26px]",
  story: "h-14 w-14 text-[30px]",
  hero: "h-24 w-24 text-[52px]",
  xl: "h-16 w-16 text-[34px]",
  "2xl": "h-24 w-24 text-[52px]",
};

export function UserAvatar({
  userId,
  username,
  displayName,
  avatarUrl,
  size = "md",
  showPresence,
  className,
}: Props) {
  const online = usePresenceStore((s) => (userId ? s.online.has(userId) : false));
  const chosen = parseMojiValue(avatarUrl);
  const moji = chosen ?? mojiFor(userId ?? username);
  const photoUrl = chosen ? null : avatarUrl;

  return (
    <div className={cn("relative inline-block", className)}>
      <Avatar className={SIZE[size]}>
        {photoUrl && <AvatarImage src={photoUrl} alt={displayName ?? username} />}
        <AvatarFallback style={{ backgroundColor: moji.bg }}>
          <span aria-hidden="true">{moji.emoji}</span>
        </AvatarFallback>
      </Avatar>
      {showPresence && online && (
        <span
          role="img"
          aria-label="Online"
          className={cn(
            "absolute rounded-full bg-online",
            // The hero sits on the page ground, every other size on a white surface.
            size === "hero"
              ? "bottom-1 right-1 h-5 w-5 ring-4 ring-background"
              : "bottom-0 right-0 h-3 w-3 ring-2 ring-card",
          )}
        />
      )}
    </div>
  );
}
