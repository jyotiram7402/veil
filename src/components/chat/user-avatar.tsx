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
  size?: "sm" | "md" | "lg" | "story" | "xl";
  showPresence?: boolean;
  className?: string;
};

const SIZE: Record<NonNullable<Props["size"]>, string> = {
  sm: "h-8 w-8 text-[17px]",
  md: "h-10 w-10 text-[21px]",
  lg: "h-12 w-12 text-[26px]",
  story: "h-14 w-14 text-[30px]",
  xl: "h-16 w-16 text-[34px]",
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
          className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-online ring-2 ring-card"
        />
      )}
    </div>
  );
}
