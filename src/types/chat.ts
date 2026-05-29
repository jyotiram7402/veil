import type { Database } from "./database";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Chat = Database["public"]["Tables"]["chats"]["Row"];
export type ChatMember = Database["public"]["Tables"]["chat_members"]["Row"];
export type Message = Database["public"]["Tables"]["messages"]["Row"];

export type ChatSummary = Chat & {
  members: Array<Pick<Profile, "id" | "username" | "display_name" | "avatar_url">>;
  last_message: Pick<Message, "id" | "content" | "type" | "created_at" | "sender_id"> | null;
  unread_count: number;
  my_last_read_at: string;
};

export type MessageWithSender = Message & {
  sender: Pick<Profile, "id" | "username" | "display_name" | "avatar_url"> | null;
};

export type TypingState = {
  userId: string;
  username: string;
  at: number;
};

export type PresenceState = {
  userId: string;
  online: boolean;
  lastSeenAt: string;
};
