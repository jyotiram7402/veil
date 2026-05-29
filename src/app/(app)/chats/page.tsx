import { MessageCircle } from "lucide-react";

export default function ChatsIndexPage() {
  return (
    <div className="hidden md:flex h-full w-full flex-col items-center justify-center chat-bg text-center px-6">
      <div className="grid h-16 w-16 place-items-center rounded-3xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 border border-border/60 mb-5">
        <MessageCircle className="h-7 w-7 text-violet-300" />
      </div>
      <h2 className="text-xl font-semibold tracking-tight">Pick up a conversation</h2>
      <p className="mt-2 text-sm text-muted-foreground max-w-sm">
        Select a chat from the list, or start a new one to begin.
      </p>
    </div>
  );
}
