// Hand-maintained mirror of supabase/schema.sql. Each table's Row/Insert/Update
// is defined as a standalone type up front so the Database interface below
// doesn't self-reference — supabase-js v2 resolves the inline
// `Partial<Database["public"]["Tables"]["x"]["Insert"]>` form to `never` in
// strict mode.

export type Json = string | number | boolean | null | { [k: string]: Json } | Json[];

// -------- profiles --------
type ProfileRow = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  is_admin: boolean;
  last_seen_at: string;
  created_at: string;
  suspended: boolean;
  archived: boolean;
};
type ProfileInsert = {
  id: string;
  username: string;
  display_name?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
  is_admin?: boolean;
  last_seen_at?: string;
  created_at?: string;
  suspended?: boolean;
  archived?: boolean;
};
type ProfileUpdate = Partial<ProfileInsert>;

// -------- chats --------
type ChatRow = {
  id: string;
  type: "direct" | "group";
  name: string | null;
  avatar_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};
type ChatInsert = {
  id?: string;
  type: "direct" | "group";
  name?: string | null;
  avatar_url?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
};
type ChatUpdate = Partial<ChatInsert>;

// -------- chat_members --------
type ChatMemberRow = {
  chat_id: string;
  user_id: string;
  role: "admin" | "member";
  joined_at: string;
  last_read_at: string;
};
type ChatMemberInsert = {
  chat_id: string;
  user_id: string;
  role?: "admin" | "member";
  joined_at?: string;
  last_read_at?: string;
};
type ChatMemberUpdate = Partial<ChatMemberInsert>;

// -------- messages --------
type MessageRow = {
  id: string;
  chat_id: string;
  sender_id: string | null;
  content: string | null;
  type: "text" | "image" | "file" | "system";
  attachment_url: string | null;
  attachment_name: string | null;
  attachment_size: number | null;
  attachment_mime: string | null;
  reply_to: string | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
};
type MessageInsert = {
  id?: string;
  chat_id: string;
  sender_id: string | null;
  content?: string | null;
  type?: "text" | "image" | "file" | "system";
  attachment_url?: string | null;
  attachment_name?: string | null;
  attachment_size?: number | null;
  attachment_mime?: string | null;
  reply_to?: string | null;
  created_at?: string;
  edited_at?: string | null;
  deleted_at?: string | null;
};
type MessageUpdate = Partial<MessageInsert>;

// -------- invite_tokens --------
type InviteTokenRow = {
  token: string;
  user_id: string;
  enabled: boolean;
  created_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
  use_count: number;
};
type InviteTokenInsert = {
  token: string;
  user_id: string;
  enabled?: boolean;
  created_at?: string;
  revoked_at?: string | null;
  last_used_at?: string | null;
  use_count?: number;
};
type InviteTokenUpdate = Partial<InviteTokenInsert>;

// -------- app_settings --------
type AppSettingRow = {
  key: string;
  value: Json;
  updated_at: string;
  updated_by: string | null;
};
type AppSettingInsert = {
  key: string;
  value: Json;
  updated_at?: string;
  updated_by?: string | null;
};
type AppSettingUpdate = Partial<AppSettingInsert>;

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: ProfileInsert;
        Update: ProfileUpdate;
        Relationships: [];
      };
      chats: {
        Row: ChatRow;
        Insert: ChatInsert;
        Update: ChatUpdate;
        Relationships: [];
      };
      chat_members: {
        Row: ChatMemberRow;
        Insert: ChatMemberInsert;
        Update: ChatMemberUpdate;
        Relationships: [];
      };
      messages: {
        Row: MessageRow;
        Insert: MessageInsert;
        Update: MessageUpdate;
        Relationships: [];
      };
      invite_tokens: {
        Row: InviteTokenRow;
        Insert: InviteTokenInsert;
        Update: InviteTokenUpdate;
        Relationships: [];
      };
      app_settings: {
        Row: AppSettingRow;
        Insert: AppSettingInsert;
        Update: AppSettingUpdate;
        Relationships: [];
      };
    };
    Functions: {
      get_or_create_direct_chat: {
        Args: { p_other: string };
        Returns: string;
      };
      get_or_create_admin_user_chat: {
        Args: { p_user: string };
        Returns: string;
      };
      is_chat_member: {
        Args: { p_chat: string; p_user: string };
        Returns: boolean;
      };
      is_chat_admin: {
        Args: { p_chat: string; p_user: string };
        Returns: boolean;
      };
      is_admin: {
        Args: { p_user: string };
        Returns: boolean;
      };
    };
    Views: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
