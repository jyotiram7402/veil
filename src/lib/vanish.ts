import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { env, requireServerEnv } from "@/lib/env";
import { effectiveSettingsForUser } from "@/lib/settings";
import { attachmentPath } from "@/lib/attachment-path";
import { readCutoff } from "@/lib/read-cutoff";

/**
 * Disappearing messages.
 *
 * The rule: a message is deleted for both people once the person it was sent
 * to has read it and then leaves the chat (goes back, switches app or tab,
 * locks the phone). A message that has not been read yet stays until it is.
 *
 * Deleted means deleted: the rows are removed from the database, and the
 * photos and files they carried from storage. Nobody can bring them back, the
 * admin included. Only the admin can switch this on or off (the
 * `disappearing_messages` setting: for everyone, or per person).
 */

/** Rows handled per round, and rounds per request. */
const BATCH = 300;
const MAX_ROUNDS = 10;
/** Ids per delete statement: they travel in the URL of the request to the database. */
const IDS_PER_DELETE = 100;

/**
 * Whether messages disappear in this chat. It is a 1:1 chat between the admin
 * and one member, and the setting that counts is that member's.
 */
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
  const settings = await effectiveSettingsForUser(member.id);
  return settings.disappearing_messages === true;
}

/**
 * Deletes, for good, every message in the chat that was sent to `readerId`
 * and that they had on their screen by `upTo`.
 *
 * Returns how many went. `more` means there are still some left (a very long
 * history goes in several requests): the screen asks again.
 *
 * The caller has already checked that `readerId` is in the chat and that the
 * chat is a disappearing one.
 */
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
      // Sent by someone else (or by an account that no longer exists).
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

    // Files first, then the messages that carried them: a file whose message
    // is gone could never be found again and would stay in storage for ever.
    const paths = rows
      .map((r) => attachmentPath(r.attachment_url, chatId))
      .filter((p): p is string => p !== null);
    if (paths.length > 0) {
      const { error: storageError } = await admin.storage.from("attachments").remove(paths);
      if (storageError) {
        // Storage is not answering. Keep those messages (they go at the next
        // leave), delete the ones without a file, and stop for now.
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

/**
 * Tells both open chats to drop the messages at once ("everything `reader`
 * had received up to `upTo`"). The database's own change feed reports a delete
 * by id only, so the screens do not wait for it.
 *
 * Sent as a plain web request to Supabase Realtime: nothing is listening on
 * the server, so there is no connection to send it over.
 */
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
  } catch {
    /* the screens catch up the next time they load */
  }
}
