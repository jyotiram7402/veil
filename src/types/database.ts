// Hand-maintained mirror of supabase/schema.sql. Regenerate with
// `supabase gen types typescript` once you connect a local Supabase CLI.

export type Json = string | number | boolean | null | { [k: string]: Json } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string;
          display_name: string | null;
          avatar_url: string | null;
          bio: string | null;
          is_admin: boolean;
          last_seen_at: string;
          created_at: string;
        };
        Insert: {
          id: string;
          username: string;
          display_name?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
          is_admin?: boolean;
          last_seen_at?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      chats: {
        Row: {
          id: string;
          type: "direct" | "group";
          name: string | null;
          avatar_url: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          type: "direct" | "group";
          name?: string | null;
          avatar_url?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["chats"]["Insert"]>;
        Relationships: [];
      };
      chat_members: {
        Row: {
          chat_id: string;
          user_id: string;
          role: "admin" | "member";
          joined_at: string;
          last_read_at: string;
        };
        Insert: {
          chat_id: string;
          user_id: string;
          role?: "admin" | "member";
          joined_at?: string;
          last_read_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["chat_members"]["Insert"]>;
        Relationships: [];
      };
      messages: {
        Row: {
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
        Insert: {
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
        Update: Partial<Database["public"]["Tables"]["messages"]["Insert"]>;
        Relationships: [];
      };
    };
    Functions: {
      get_or_create_direct_chat: {
        Args: { p_other: string };
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
    };
    Views: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
