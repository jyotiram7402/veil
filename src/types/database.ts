export type Json = string | number | boolean | null | { [k: string]: Json } | Json[];

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
  settings: Json;
  is_room_guest: boolean;
  signup_code_id: string | null;
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
  settings?: Json;
  is_room_guest?: boolean;
  signup_code_id?: string | null;
};
type ProfileUpdate = Partial<ProfileInsert>;

type ChatRow = {
  id: string;
  type: "direct" | "group" | "room";
  name: string | null;
  avatar_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  status: "active" | "ended" | "expired" | "locked";
  expires_at: string | null;
  ended_at: string | null;
  max_participants: number | null;
  chat_enabled: boolean;
  voice_enabled: boolean;
  video_enabled: boolean;
};
type ChatInsert = {
  id?: string;
  type: "direct" | "group" | "room";
  name?: string | null;
  avatar_url?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
  status?: "active" | "ended" | "expired" | "locked";
  expires_at?: string | null;
  ended_at?: string | null;
  max_participants?: number | null;
  chat_enabled?: boolean;
  voice_enabled?: boolean;
  video_enabled?: boolean;
};
type ChatUpdate = Partial<ChatInsert>;

type ChatMemberRow = {
  chat_id: string;
  user_id: string;
  role: "admin" | "member";
  joined_at: string;
  last_read_at: string;
  blocked: boolean;
  can_chat: boolean;
  can_voice: boolean;
  can_video: boolean;
  removed_at: string | null;
  muted: boolean;
};
type ChatMemberInsert = {
  chat_id: string;
  user_id: string;
  role?: "admin" | "member";
  joined_at?: string;
  last_read_at?: string;
  blocked?: boolean;
  can_chat?: boolean;
  can_voice?: boolean;
  can_video?: boolean;
  removed_at?: string | null;
  muted?: boolean;
};
type ChatMemberUpdate = Partial<ChatMemberInsert>;

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

type InviteTokenRow = {
  token: string;
  user_id: string;
  enabled: boolean;
  created_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
  use_count: number;
  gate_password_hash: string | null;
};
type InviteTokenInsert = {
  token: string;
  user_id: string;
  enabled?: boolean;
  created_at?: string;
  revoked_at?: string | null;
  last_used_at?: string | null;
  use_count?: number;
  gate_password_hash?: string | null;
};
type InviteTokenUpdate = Partial<InviteTokenInsert>;

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

type RoomInviteRow = {
  id: string;
  room_id: string;
  selector: string;
  verifier_hash: string;
  label: string | null;
  created_by: string | null;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  max_uses: number | null;
  use_count: number;
  last_used_at: string | null;
  claimed_by: string | null;
};
type RoomInviteInsert = {
  id?: string;
  room_id: string;
  selector: string;
  verifier_hash: string;
  label?: string | null;
  created_by?: string | null;
  created_at?: string;
  expires_at?: string | null;
  revoked_at?: string | null;
  max_uses?: number | null;
  use_count?: number;
  last_used_at?: string | null;
  claimed_by?: string | null;
};
type RoomInviteUpdate = Partial<RoomInviteInsert>;

type RoomAuditRow = {
  id: string;
  room_id: string | null;
  actor_id: string | null;
  action: string;
  target_id: string | null;
  meta: Json;
  created_at: string;
};
type RoomAuditInsert = {
  id?: string;
  room_id?: string | null;
  actor_id?: string | null;
  action: string;
  target_id?: string | null;
  meta?: Json;
  created_at?: string;
};
type RoomAuditUpdate = Partial<RoomAuditInsert>;

type CallSessionRow = {
  id: string;
  chat_id: string;
  caller_id: string;
  callee_id: string;
  kind: "voice" | "video";
  status: "ringing" | "connected" | "ended" | "rejected" | "cancelled" | "missed" | "busy" | "failed";
  created_at: string;
  connected_at: string | null;
  ended_at: string | null;
  end_reason: string | null;
  duration_seconds: number | null;
  event_posted: boolean;
};
type CallSessionInsert = {
  id?: string;
  chat_id: string;
  caller_id: string;
  callee_id: string;
  kind?: "voice" | "video";
  status?: CallSessionRow["status"];
  created_at?: string;
  connected_at?: string | null;
  ended_at?: string | null;
  end_reason?: string | null;
  duration_seconds?: number | null;
  event_posted?: boolean;
};
type CallSessionUpdate = Partial<CallSessionInsert>;

type SignupCodeRow = {
  id: string;
  code_hash: string;
  code_hint: string;
  label: string | null;
  max_uses: number;
  use_count: number;
  expires_at: string | null;
  revoked_at: string | null;
  last_used_at: string | null;
  created_by: string | null;
  created_at: string;
};
type SignupCodeInsert = {
  id?: string;
  code_hash: string;
  code_hint: string;
  label?: string | null;
  max_uses?: number;
  use_count?: number;
  expires_at?: string | null;
  revoked_at?: string | null;
  last_used_at?: string | null;
  created_by?: string | null;
  created_at?: string;
};
type SignupCodeUpdate = Partial<SignupCodeInsert>;

type PushSubscriptionRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  seen_at: string | null;
  created_at: string;
};
type PushSubscriptionInsert = {
  id?: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  seen_at?: string | null;
  created_at?: string;
};
type PushSubscriptionUpdate = Partial<PushSubscriptionInsert>;

type PushKeyRow = {
  id: number;
  public_key: string;
  private_key: string;
  created_at: string;
};
type PushKeyInsert = {
  id?: number;
  public_key: string;
  private_key: string;
  created_at?: string;
};
type PushKeyUpdate = Partial<PushKeyInsert>;

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
      room_invites: {
        Row: RoomInviteRow;
        Insert: RoomInviteInsert;
        Update: RoomInviteUpdate;
        Relationships: [];
      };
      room_audit_log: {
        Row: RoomAuditRow;
        Insert: RoomAuditInsert;
        Update: RoomAuditUpdate;
        Relationships: [];
      };
      call_sessions: {
        Row: CallSessionRow;
        Insert: CallSessionInsert;
        Update: CallSessionUpdate;
        Relationships: [];
      };
      signup_codes: {
        Row: SignupCodeRow;
        Insert: SignupCodeInsert;
        Update: SignupCodeUpdate;
        Relationships: [];
      };
      push_subscriptions: {
        Row: PushSubscriptionRow;
        Insert: PushSubscriptionInsert;
        Update: PushSubscriptionUpdate;
        Relationships: [];
      };
      push_keys: {
        Row: PushKeyRow;
        Insert: PushKeyInsert;
        Update: PushKeyUpdate;
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
      is_room_admin: {
        Args: { p_chat: string; p_user: string };
        Returns: boolean;
      };
      can_access_chat: {
        Args: { p_chat: string; p_user: string };
        Returns: boolean;
      };
      is_active_profile: {
        Args: { p_user: string };
        Returns: boolean;
      };
      claim_room_seat: {
        Args: { p_room: string; p_user: string };
        Returns: boolean;
      };
      can_chat_in: {
        Args: { p_chat: string; p_user: string };
        Returns: boolean;
      };
      claim_signup_code: {
        Args: { p_code_hash: string };
        Returns: string | null;
      };
      release_signup_code: {
        Args: { p_id: string };
        Returns: undefined;
      };
      take_rate_token: {
        Args: { p_key: string; p_limit: number; p_per_ms: number };
        Returns: boolean;
      };
    };
    Views: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
