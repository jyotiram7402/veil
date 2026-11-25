const TAKEN = new Set(["23505", "email_exists", "user_already_exists"]);

export function errorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && code ? code : null;
}

export function isTaken(error: unknown): boolean {
  const code = errorCode(error);
  return code !== null && TAKEN.has(code);
}

export function describeError(error: unknown): string {
  if (error === null || error === undefined) return "no error object";
  if (typeof error === "string") return error.slice(0, 300) || "empty error";
  if (typeof error !== "object") return String(error);
  const { code, status, name, message } = error as {
    code?: unknown;
    status?: unknown;
    name?: unknown;
    message?: unknown;
  };
  const parts = [code, status, typeof code === "string" ? undefined : name, message]
    .filter((part) => (typeof part === "string" && part) || typeof part === "number")
    .map(String);
  return parts.length ? parts.join(" ").slice(0, 300) : "unknown error";
}
