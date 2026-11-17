import "server-only";
import {
  createCipheriv,
  createECDH,
  createHash,
  createPrivateKey,
  hkdfSync,
  randomBytes,
  sign,
} from "node:crypto";

export type VapidKeys = { publicKey: string; privateKey: string };
export type PushTarget = { endpoint: string; p256dh: string; auth: string };
export type PushResult = "sent" | "gone" | "failed";

const CURVE = "prime256v1";
const RECORD_SIZE = 4096;
const TOKEN_LIFETIME_SECONDS = 12 * 60 * 60;
const SEND_TIMEOUT_MS = 5000;

const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /(^|\.)push\.services\.mozilla\.com$/,
  /(^|\.)notify\.windows\.com$/,
  /(^|\.)push\.apple\.com$/,
];

const encode = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");
const decode = (text: string) => Buffer.from(text, "base64url");

export function isPushEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2000) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && PUSH_HOSTS.some((host) => host.test(url.hostname));
  } catch {
    return false;
  }
}

export function generateVapidKeys(): VapidKeys {
  const ecdh = createECDH(CURVE);
  ecdh.generateKeys();
  const scalar = ecdh.getPrivateKey();
  const privateKey = Buffer.concat([Buffer.alloc(32 - scalar.length), scalar]);
  return { publicKey: encode(ecdh.getPublicKey()), privateKey: encode(privateKey) };
}

export function vapidAuthorization(
  endpoint: string,
  keys: VapidKeys,
  subject: string,
  now: number = Date.now(),
): string {
  const point = decode(keys.publicKey);
  const key = createPrivateKey({
    format: "jwk",
    key: {
      kty: "EC",
      crv: "P-256",
      d: keys.privateKey,
      x: encode(point.subarray(1, 33)),
      y: encode(point.subarray(33, 65)),
    },
  });
  const header = encode(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = encode(
    Buffer.from(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(now / 1000) + TOKEN_LIFETIME_SECONDS,
        sub: subject,
      }),
    ),
  );
  const unsigned = `${header}.${claims}`;
  const signature = sign("sha256", Buffer.from(unsigned), { key, dsaEncoding: "ieee-p1363" });
  return `vapid t=${unsigned}.${encode(signature)}, k=${keys.publicKey}`;
}

export function encryptWith(
  plaintext: Uint8Array,
  target: Pick<PushTarget, "p256dh" | "auth">,
  salt: Uint8Array,
  senderPrivateKey: Uint8Array,
): Buffer {
  const receiverPublic = decode(target.p256dh);
  const authSecret = decode(target.auth);
  if (receiverPublic.length !== 65 || receiverPublic[0] !== 4 || authSecret.length !== 16) {
    throw new Error("not a usable push subscription");
  }
  if (plaintext.length > RECORD_SIZE - 86 - 17) throw new Error("push message too long");

  const ecdh = createECDH(CURVE);
  ecdh.setPrivateKey(Buffer.from(senderPrivateKey));
  const senderPublic = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(receiverPublic);

  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), receiverPublic, senderPublic]);
  const ikm = Buffer.from(hkdfSync("sha256", shared, authSecret, keyInfo, 32));
  const cek = Buffer.from(
    hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16),
  );
  const nonce = Buffer.from(
    hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12),
  );

  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const sealed = Buffer.concat([
    cipher.update(Buffer.concat([Buffer.from(plaintext), Buffer.from([2])])),
    cipher.final(),
    cipher.getAuthTag(),
  ]);

  const header = Buffer.alloc(21);
  Buffer.from(salt).copy(header, 0);
  header.writeUInt32BE(RECORD_SIZE, 16);
  header.writeUInt8(senderPublic.length, 20);
  return Buffer.concat([header, senderPublic, sealed]);
}

export function encryptPayload(
  plaintext: Uint8Array,
  target: Pick<PushTarget, "p256dh" | "auth">,
): Buffer {
  const ecdh = createECDH(CURVE);
  ecdh.generateKeys();
  return encryptWith(plaintext, target, randomBytes(16), ecdh.getPrivateKey());
}

export function pushTopic(tag: string): string {
  return createHash("sha256").update(tag).digest("base64url").slice(0, 32);
}

export async function sendPush(
  target: PushTarget,
  payload: Record<string, unknown>,
  keys: VapidKeys,
  options: { subject: string; ttlSeconds: number; topic?: string },
): Promise<PushResult> {
  if (!isPushEndpoint(target.endpoint)) return "gone";
  let body: Buffer;
  try {
    body = encryptPayload(Buffer.from(JSON.stringify(payload)), target);
  } catch {
    return "gone";
  }
  try {
    const res = await fetch(target.endpoint, {
      method: "POST",
      headers: {
        Authorization: vapidAuthorization(target.endpoint, keys, options.subject),
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: String(options.ttlSeconds),
        Urgency: "high",
        ...(options.topic ? { Topic: options.topic } : {}),
      },
      body: new Uint8Array(body),
      cache: "no-store",
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (res.status === 404 || res.status === 410) return "gone";
    if (!res.ok) console.error(`[push] the push service answered ${res.status}`);
    return res.ok ? "sent" : "failed";
  } catch {
    return "failed";
  }
}
