function required(name: string, value: string | undefined): string {
  if (!value || value.length === 0) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

export const env = {
  SUPABASE_URL: required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
  SUPABASE_ANON_KEY: required(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  ),
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  INTERNAL_EMAIL_DOMAIN: process.env.INTERNAL_EMAIL_DOMAIN ?? "rooms.local",
  ADMIN_BOOTSTRAP_TOKEN: process.env.ADMIN_BOOTSTRAP_TOKEN,
  APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  TURN_URL: process.env.NEXT_PUBLIC_TURN_URL,
  TURN_USERNAME: process.env.NEXT_PUBLIC_TURN_USERNAME,
  TURN_CREDENTIAL: process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
};

export function requireServerEnv(): {
  SUPABASE_SERVICE_ROLE_KEY: string;
  INTERNAL_EMAIL_DOMAIN: string;
} {
  return {
    SUPABASE_SERVICE_ROLE_KEY: required(
      "SUPABASE_SERVICE_ROLE_KEY",
      env.SUPABASE_SERVICE_ROLE_KEY,
    ),
    INTERNAL_EMAIL_DOMAIN: env.INTERNAL_EMAIL_DOMAIN,
  };
}
