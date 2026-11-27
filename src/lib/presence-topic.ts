import "server-only";
import { requireServerEnv } from "@/lib/env";

const encoder = new TextEncoder();

export async function topicFromSecret(secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode("blackfoxx presence")));
  const name = Array.from(mac.subarray(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
  return `presence:${name}`;
}

let topic: Promise<string> | null = null;

export function presenceTopic(): Promise<string> {
  topic ??= topicFromSecret(requireServerEnv().SUPABASE_SERVICE_ROLE_KEY);
  return topic;
}
