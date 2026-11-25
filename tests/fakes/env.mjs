const defaults = { SUPABASE_URL: "https://test.supabase.co" };

export const env = new Proxy(
  {},
  {
    get: (_, name) =>
      globalThis.__env && name in globalThis.__env ? globalThis.__env[name] : defaults[name],
  },
);

export function requireServerEnv() {
  return { SUPABASE_SERVICE_ROLE_KEY: "test-service-key", INTERNAL_EMAIL_DOMAIN: "rooms.local" };
}
