"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { avatarGradient, cn, initialsFor } from "@/lib/utils";
import { usePresenceStore } from "@/store/presence-store";

type Props = {
  userId?: string | null;
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  showPresence?: boolean;
  className?: string;
};

const SIZE: Record<NonNullable<Props["size"]>, string> = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-xs",
  lg: "h-12 w-12 text-sm",
  xl: "h-16 w-16 text-base",
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

  return (
    <div className={cn("relative inline-block", className)}>
      <Avatar className={cn(SIZE[size], "ring-1 ring-border/60")}>
        {avatarUrl && <AvatarImage src={avatarUrl} alt={username} />}
        <AvatarFallback className={avatarGradient(username)}>
          {initialsFor(displayName ?? username)}
        </AvatarFallback>
      </Avatar>
      {showPresence && userId && (
        <span
          aria-hidden
          className={cn(
            "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-card",
            online ? "bg-emerald-500" : "bg-zinc-500",
          )}
        />
      )}
    </div>
  );
}
