import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { supabaseServer } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { jsonError } from "@/lib/api";
import {
  ALLOWED_ATTACHMENT_MIME,
  ATTACHMENT_MAX_BYTES,
  AVATAR_MAX_BYTES,
  IMAGE_MIME_TYPES,
} from "@/lib/constants";

const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export async function POST(req: Request) {
  const session = await getSessionUser();
  if (!session) return jsonError(401, "Sign in required");

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError(400, "Expected multipart/form-data");
  }

  const file = form.get("file");
  const kind = String(form.get("kind") ?? "");
  const chatId = form.get("chatId");

  if (!(file instanceof File)) return jsonError(400, "Missing file");
  if (file.size === 0) return jsonError(400, "Empty file");

  const supabase = await supabaseServer();

  if (kind === "avatar") {
    if (file.size > AVATAR_MAX_BYTES) return jsonError(413, "Avatar too large (max 2 MB)");
    if (!IMAGE_MIME_TYPES.includes(file.type)) return jsonError(415, "Unsupported image type");

    const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
    const path = `${session.id}/avatar-${Date.now()}.${ext}`;
    const buf = Buffer.from(await file.arrayBuffer());

    const { error } = await supabase.storage.from("avatars").upload(path, buf, {
      contentType: file.type,
      upsert: true,
    });
    if (error) return jsonError(500, error.message);

    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    return NextResponse.json({ url: data.publicUrl, path });
  }

  if (kind === "attachment") {
    if (typeof chatId !== "string") return jsonError(400, "chatId required");
    if (file.size > ATTACHMENT_MAX_BYTES) return jsonError(413, "File too large (max 10 MB)");
    if (!ALLOWED_ATTACHMENT_MIME.includes(file.type)) {
      return jsonError(415, "Unsupported file type");
    }

    const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(0, 120);
    const path = `${chatId}/${randomUUID()}-${safeName}`;
    const buf = Buffer.from(await file.arrayBuffer());

    const { error } = await supabase.storage.from("attachments").upload(path, buf, {
      contentType: file.type,
      upsert: false,
    });
    if (error) return jsonError(500, error.message);

    const { data: signed, error: signErr } = await supabase.storage
      .from("attachments")
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    if (signErr || !signed) return jsonError(500, signErr?.message ?? "Failed to sign URL");

    return NextResponse.json({
      url: signed.signedUrl,
      path,
      name: file.name,
      size: file.size,
      mime: file.type,
      isImage: IMAGE_MIME_TYPES.includes(file.type),
    });
  }

  return jsonError(400, "Unknown upload kind");
}
