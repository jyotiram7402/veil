import { MOJI_COLORS } from "@/lib/moji";

export default function ChatsIndexPage() {
  return (
    <div className="chat-bg hidden h-full w-full flex-col items-center justify-center px-6 text-center md:flex">
      <div className="flex items-end gap-2 leading-none" aria-hidden="true">
        <span
          className="grid h-14 w-14 -rotate-6 place-items-center rounded-[30%] text-[30px]"
          style={{ backgroundColor: MOJI_COLORS.sun }}
        >
          🐼
        </span>
        <span className="grid h-20 w-20 place-items-center rounded-[30%] bg-foreground text-[44px]">
          🦊
        </span>
        <span
          className="grid h-14 w-14 rotate-6 place-items-center rounded-[30%] text-[30px]"
          style={{ backgroundColor: MOJI_COLORS.sky }}
        >
          🐱
        </span>
      </div>
      <h2 className="mt-6 text-xl font-bold tracking-tight">Pick a chat</h2>
      <p className="mt-1.5 max-w-xs text-sm text-muted-foreground">
        Choose someone on the left, or start a new chat.
      </p>
    </div>
  );
}
