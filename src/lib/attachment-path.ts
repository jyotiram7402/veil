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
