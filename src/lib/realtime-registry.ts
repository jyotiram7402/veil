import type { RealtimeChannel } from "@supabase/supabase-js";

/**
 * Tiny module-level registry so a sender hook (typing) can reuse the same
 * realtime channel that the listener hook (chat realtime) already
 * subscribed. Supabase broadcasts only deliver from subscribed channels —
 * creating a second `chat:{id}` channel just to send would be a no-op.
 */
const channels = new Map<string, RealtimeChannel>();

export function setChatChannel(chatId: string, channel: RealtimeChannel) {
  channels.set(chatId, channel);
}

export function getChatChannel(chatId: string): RealtimeChannel | undefined {
  return channels.get(chatId);
}

export function clearChatChannel(chatId: string) {
  channels.delete(chatId);
}
