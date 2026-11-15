/**
 * Where a message's attachment lives in storage.
 *
 * A message keeps the signed link to its file, not the file's path (see
 * /api/upload: the path is `<chatId>/<uuid>-<name>` in the `attachments`
 * bucket). To delete the file the path has to be read back out of that link:
 *   https://<project>.supabase.co/storage/v1/object/sign/attachments/<path>?token=…
 *
 * Returns null for anything that is not a file of this chat, so a message
 * with a doctored link can never get another chat's file deleted.
 */
export function attachmentPath(url: string | null | undefined, chatId: string): string | null {
  if (!url) return null;
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }
  const marker = "/attachments/";
  const at = pathname.indexOf(marker);
  if (at < 0 || !pathname.slice(0, at).endsWith("/object/sign")) return null;
  let path: string;
  try {
    path = decodeURIComponent(pathname.slice(at + marker.length));
  } catch {
    return null;
  }
  if (!path.startsWith(`${chatId}/`) || path.includes("..") || path.length <= chatId.length + 1) {
    return null;
  }
  return path;
}
