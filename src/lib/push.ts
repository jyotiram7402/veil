import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { CALL_RING_TIMEOUT_MS } from "@/lib/webrtc/types";
import {
  generateVapidKeys,
  pushTopic,
  sendPush,
  type PushTarget,
  type VapidKeys,
} from "@/lib/web-push";

export type Notice = { title: string; body?: string; tag: string; url: string; ring?: boolean };

const APP_OPEN_WINDOW_MS = 45_000;
const NOTICE_TTL_SECONDS = 24 * 60 * 60;
const RING_TTL_SECONDS = Math.ceil(CALL_RING_TIMEOUT_MS / 1000);
const MAX_DEVICES_PER_PERSON = 10;

type Person = {
  username: string;
  display_name: string | null;
  is_admin: boolean;
  suspended: boolean;
  archived: boolean;
};

type MemberRow = {
  user_id: string;
  blocked: boolean;
  removed_at: string | null;
  muted?: boolean;
  chat: { type: string } | null;
  user: Person | null;
};

let knownKeys: VapidKeys | null = null;

export async function getPushKeys(): Promise<VapidKeys | null> {
  if (knownKeys) return knownKeys;
  const admin = supabaseAdmin();
  const read = async (): Promise<VapidKeys | null> => {
    const { data } = await admin
      .from("push_keys")
      .select("public_key, private_key")
      .eq("id", 1)
      .maybeSingle();
    return data ? { publicKey: data.public_key, privateKey: data.private_key } : null;
  };

  let keys = await read();
  if (!keys) {
    const fresh = generateVapidKeys();
    const { error } = await admin
      .from("push_keys")
      .upsert(
        { id: 1, public_key: fresh.publicKey, private_key: fresh.privateKey },
        { onConflict: "id", ignoreDuplicates: true },
      );
    if (error) return null;
    keys = await read();
  }
  knownKeys = keys;
  return keys;
}

export async function saveDevice(
  userId: string,
  device: PushTarget,
  replaces?: string,
): Promise<boolean> {
  const admin = supabaseAdmin();
  const { error } = await admin
    .from("push_subscriptions")
    .upsert(
      { user_id: userId, endpoint: device.endpoint, p256dh: device.p256dh, auth: device.auth },
      { onConflict: "endpoint" },
    );
  if (error) return false;

  const [{ data: surplus }] = await Promise.all([
    admin
      .from("push_subscriptions")
      .select("id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(MAX_DEVICES_PER_PERSON, MAX_DEVICES_PER_PERSON + 99),
    replaces && replaces !== device.endpoint
      ? admin.from("push_subscriptions").delete().eq("user_id", userId).eq("endpoint", replaces)
      : null,
  ]);
  if (surplus && surplus.length > 0) {
    await admin
      .from("push_subscriptions")
      .delete()
      .in(
        "id",
        surplus.map((row) => row.id),
      );
  }
  return true;
}

export async function forgetAllDevices(userId: string): Promise<void> {
  await supabaseAdmin().from("push_subscriptions").delete().eq("user_id", userId);
}

export type TestPushResult = "sent" | "failed" | "not-set-up" | "not-registered";

export async function sendTestPush(
  userId: string,
  endpoint: string,
  origin: string,
): Promise<TestPushResult> {
  const keys = await getPushKeys();
  if (!keys) return "not-set-up";
  const admin = supabaseAdmin();
  const { data: device } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId)
    .eq("endpoint", endpoint)
    .maybeSingle();
  if (!device) return "not-registered";
  const notice: Notice = {
    title: "Test notification",
    body: "Notifications work on this phone.",
    tag: "test",
    url: "/",
  };
  const result = await sendPush(device, notice, keys, {
    subject: subjectFor(origin),
    ttlSeconds: 60,
    topic: pushTopic(notice.tag),
  });
  if (result === "gone") {
    await admin.from("push_subscriptions").delete().eq("id", device.id);
    return "not-registered";
  }
  return result;
}

export async function removeDevice(userId: string, endpoint: string): Promise<void> {
  await supabaseAdmin()
    .from("push_subscriptions")
    .delete()
    .eq("user_id", userId)
    .eq("endpoint", endpoint);
}

export async function markDevice(userId: string, endpoint: string, open: boolean): Promise<void> {
  await supabaseAdmin()
    .from("push_subscriptions")
    .update({ seen_at: open ? new Date().toISOString() : null })
    .eq("user_id", userId)
    .eq("endpoint", endpoint);
}

function subjectFor(origin: string): string {
  if (origin.startsWith("https://")) return origin;
  if (env.APP_URL.startsWith("https://")) return env.APP_URL;
  return `mailto:push@${env.INTERNAL_EMAIL_DOMAIN}`;
}

function nameOf(person: Person | null | undefined): string {
  return person?.display_name?.trim() || person?.username || "Someone";
}

async function deliver(
  notices: Map<string, Notice>,
  origin: string,
  ttlSeconds: number = NOTICE_TTL_SECONDS,
): Promise<void> {
  if (notices.size === 0) return;
  const admin = supabaseAdmin();
  const [keys, { data: devices }] = await Promise.all([
    getPushKeys(),
    admin
      .from("push_subscriptions")
      .select("id, user_id, endpoint, p256dh, auth, seen_at")
      .in("user_id", [...notices.keys()]),
  ]);
  if (!keys || !devices || devices.length === 0) return;

  const openSince = Date.now() - APP_OPEN_WINDOW_MS;
  const subject = subjectFor(origin);
  const gone: string[] = [];
  await Promise.all(
    devices.map(async (device) => {
      const notice = notices.get(device.user_id);
      if (!notice) return;
      if (device.seen_at && Date.parse(device.seen_at) > openSince) return;
      const result = await sendPush(device, notice, keys, {
        subject,
        ttlSeconds,
        topic: pushTopic(notice.tag),
      });
      if (result === "gone") gone.push(device.id);
    }),
  );
  if (gone.length > 0) await admin.from("push_subscriptions").delete().in("id", gone);
}

export async function notifyNewMessage(
  chatId: string,
  senderId: string,
  origin: string,
): Promise<void> {
  try {
    const { data } = await supabaseAdmin()
      .from("chat_members")
      .select(
        "*, chat:chats(type), user:profiles(username, display_name, is_admin, suspended, archived)",
      )
      .eq("chat_id", chatId);
    const members = (data ?? []) as unknown as MemberRow[];
    const type = members[0]?.chat?.type;
    if (type !== "direct" && type !== "group") return;

    const sender = members.find((m) => m.user_id === senderId)?.user;
    const tag = `chat-${chatId}`;
    const notices = new Map<string, Notice>();
    for (const m of members) {
      if (m.user_id === senderId || m.blocked || m.removed_at || m.muted || !m.user) continue;
      if (m.user.suspended || m.user.archived) continue;
      if (m.user.is_admin) {
        notices.set(m.user_id, {
          title: nameOf(sender),
          body: "New message",
          tag,
          url: `/chats/${chatId}`,
        });
      } else if (type === "direct" && sender?.is_admin) {
        notices.set(m.user_id, { title: "New message", tag, url: "/chat" });
      }
    }
    await deliver(notices, origin);
  } catch (err) {
    console.error("[push] a message notification failed", err);
  }
}

export async function notifyIncomingCall(
  call: { callId: string; chatId: string; callerId: string; kind: "voice" | "video" },
  origin: string,
): Promise<void> {
  try {
    const { data } = await supabaseAdmin()
      .from("chat_members")
      .select(
        "user_id, blocked, removed_at, chat:chats(type), user:profiles(username, display_name, is_admin, suspended, archived)",
      )
      .eq("chat_id", call.chatId);
    const members = (data ?? []) as unknown as MemberRow[];
    if (members[0]?.chat?.type !== "direct") return;

    const reachable = (m: MemberRow | undefined): m is MemberRow & { user: Person } =>
      !!m && !m.blocked && !m.removed_at && !!m.user && !m.user.suspended && !m.user.archived;
    const caller = members.find((m) => m.user_id === call.callerId);
    const callee = members.find((m) => m.user_id !== call.callerId);
    if (!reachable(caller) || !reachable(callee)) return;
    if (!caller.user.is_admin && !callee.user.is_admin) return;

    const what = call.kind === "video" ? "Incoming video call" : "Incoming voice call";
    const tag = `call-${call.chatId}`;
    const notice: Notice = callee.user.is_admin
      ? { title: nameOf(caller.user), body: what, tag, url: `/chats/${call.chatId}`, ring: true }
      : { title: what, tag, url: "/chat", ring: true };
    await deliver(new Map([[callee.user_id, notice]]), origin, RING_TTL_SECONDS);
  } catch (err) {
    console.error("[push] an incoming-call notification failed", err);
  }
}

export async function notifyMissedCall(
  call: { chatId: string; callerId: string; calleeId: string; kind: "voice" | "video" },
  origin: string,
): Promise<void> {
  try {
    const { data } = await supabaseAdmin()
      .from("profiles")
      .select("id, username, display_name, is_admin, suspended, archived")
      .in("id", [call.callerId, call.calleeId]);
    const people = data ?? [];
    const caller = people.find((p) => p.id === call.callerId);
    const callee = people.find((p) => p.id === call.calleeId);
    if (!caller || !callee || callee.suspended || callee.archived) return;
    if (!callee.is_admin && !caller.is_admin) return;

    const what = call.kind === "video" ? "Missed video call" : "Missed voice call";
    const tag = `call-${call.chatId}`;
    const notice: Notice = callee.is_admin
      ? { title: nameOf(caller), body: what, tag, url: `/chats/${call.chatId}` }
      : { title: what, tag, url: "/chat" };
    await deliver(new Map([[callee.id, notice]]), origin);
  } catch (err) {
    console.error("[push] a missed-call notification failed", err);
  }
}

export async function notifyHashcodeRequest(
  member: { id: string; username: string; display_name: string | null },
  origin: string,
): Promise<void> {
  try {
    const { data: admins } = await supabaseAdmin()
      .from("profiles")
      .select("id")
      .eq("is_admin", true)
      .eq("suspended", false)
      .eq("archived", false);
    const notice: Notice = {
      title: "Hashcode request",
      body: `${member.display_name?.trim() || member.username} asked for their hashcode.`,
      tag: `hashcode-${member.id}`,
      url: `/admin/${member.id}`,
    };
    const notices = new Map<string, Notice>();
    for (const a of admins ?? []) notices.set(a.id, notice);
    await deliver(notices, origin);
  } catch (err) {
    console.error("[push] a hashcode-request notification failed", err);
  }
}
