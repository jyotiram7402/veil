import type { Database } from "./database";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Chat = Database["public"]["Tables"]["chats"]["Row"];
export type Message = Database["public"]["Tables"]["messages"]["Row"];

export type ChatSummary = Pick<
  Chat,
  "id" | "type" | "name" | "avatar_url" | "created_by" | "created_at" | "updated_at"
> & {
  members: Array<Pick<Profile, "id" | "username" | "display_name" | "avatar_url">>;
  last_message: Pick<Message, "id" | "content" | "type" | "created_at" | "sender_id"> | null;
  unread_count: number;
  my_last_read_at: string;
};

export type MessageWithSender = Message & {
  sender: Pick<Profile, "id" | "username" | "display_name" | "avatar_url"> | null;
};
