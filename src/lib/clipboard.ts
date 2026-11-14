/**
 * Copy text to the clipboard. Returns whether it worked; never throws.
 *
 * "Copy" always means copy: this does not open the system share sheet. (On
 * Windows that sheet used to appear instead of copying, because the browser
 * offers `navigator.share` there too.)
 *
 * Call it directly from a click handler. Browsers may refuse a copy that
 * happens later (for example after waiting for a request), so check the
 * result and tell the user what to do when it is false.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Not allowed or not available: try the older way below.
  }
  return copyWithSelection(text);
}

/** Older way: put the text in a hidden field, select it, ask the browser to copy. */
function copyWithSelection(text: string): boolean {
  if (typeof document === "undefined") return false;
  const previouslyFocused = document.activeElement as HTMLElement | null;
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.setAttribute("aria-hidden", "true");
  field.style.position = "fixed";
  field.style.top = "0";
  field.style.left = "0";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.select();
  field.setSelectionRange(0, text.length);
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  document.body.removeChild(field);
  previouslyFocused?.focus?.();
  return ok;
}
