import type { RealtimeChannel } from "@supabase/supabase-js";

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
