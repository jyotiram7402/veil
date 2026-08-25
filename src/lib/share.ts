"use client";

/**
 * Share a link using the native share sheet on mobile where available, falling
 * back to copying to the clipboard. Returns how it was handled so callers can
 * show the right toast. Never throws.
 */
export async function shareOrCopy(
  text: string,
  opts?: { title?: string },
): Promise<"shared" | "copied" | "failed"> {
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  if (nav?.share) {
    try {
      await nav.share({ title: opts?.title, text });
      return "shared";
    } catch (err) {
      // User cancelled the share sheet — treat as a no-op, not a failure.
      if (err instanceof DOMException && err.name === "AbortError") return "shared";
      // fall through to clipboard
    }
  }
  try {
    await nav?.clipboard?.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}
