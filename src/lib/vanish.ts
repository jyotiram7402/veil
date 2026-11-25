import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { env, requireServerEnv } from "@/lib/env";
import { effectiveSettingsForUser } from "@/lib/settings";
import { attachmentPath } from "@/lib/attachment-path";
import { readCutoff } from "@/lib/read-cutoff";

const BATCH = 300;
const MAX_ROUNDS = 10;
const IDS_PER_DELETE = 100;

export async function chatIsDisappearing(chatId: string): Promise<boolean> {
  const admin = supabaseAdmin();
  const { data } = await admin
    .from("chats")
    .select("type, members:chat_members(user:profiles(id, is_admin))")
    .eq("id", chatId)
    .maybeSingle();
  const chat = data as unknown as {
    type: string;
    members: Array<{ user: { id: string; is_admin: boolean } | null }> | null;
  } | null;
  if (!chat || chat.type !== "direct") return false;
  const member = (chat.members ?? []).map((m) => m.user).find((u) => u && !u.is_admin);
  if (!member) return false;
  return memberHasDisappearing(member.id);
}

export async function memberHasDisappearing(memberId: string): Promise<boolean> {
  const settings = await effectiveSettingsForUser(memberId);
  return settings.disappearing_messages === true;
}

export async function deleteReadMessages(
  chatId: string,
  readerId: string,
  upTo: string,
): Promise<{ deleted: number; more: boolean }> {
  const cutoff = readCutoff(upTo);
  if (!cutoff) return { deleted: 0, more: false };

  const admin = supabaseAdmin();
  let deleted = 0;
  let more = false;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const { data, error } = await admin
      .from("messages")
      .select("id, attachment_url")
      .eq("chat_id", chatId)
      .or(`sender_id.is.null,sender_id.neq.${readerId}`)
      .lte("created_at", cutoff)
      .order("created_at", { ascending: true })
      .limit(BATCH);
    if (error) throw new Error("Could not read the messages to delete");
    let rows = (data ?? []) as Array<{ id: string; attachment_url: string | null }>;
    if (rows.length === 0) {
      more = false;
      break;
    }
    more = rows.length === BATCH;

    const paths = rows
      .map((r) => attachmentPath(r.attachment_url, chatId))
      .filter((p): p is string => p !== null);
    if (paths.length > 0) {
      const { error: storageError } = await admin.storage.from("attachments").remove(paths);
      if (storageError) {
        console.error("vanish: could not remove", paths.length, "file(s)");
        rows = rows.filter((r) => attachmentPath(r.attachment_url, chatId) === null);
        more = false;
      }
    }

    for (let i = 0; i < rows.length; i += IDS_PER_DELETE) {
      const ids = rows.slice(i, i + IDS_PER_DELETE).map((r) => r.id);
      const { error: deleteError } = await admin.from("messages").delete().in("id", ids);
      if (deleteError) throw new Error("Could not delete the messages");
      deleted += ids.length;
    }
    if (!more) break;
  }

  if (deleted > 0) await announce(chatId, readerId, cutoff);
  return { deleted, more };
}

async function announce(chatId: string, reader: string, upTo: string): Promise<void> {
  try {
    const { SUPABASE_SERVICE_ROLE_KEY: key } = requireServerEnv();
    await fetch(`${env.SUPABASE_URL}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        messages: [{ topic: `chat:${chatId}`, event: "vanished", payload: { reader, upTo } }],
      }),
      signal: AbortSignal.timeout(4000),
    });
  } catch {}
}
