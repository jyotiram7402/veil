import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type SettingsShape = {
  uploads_enabled: boolean;
  typing_indicator: boolean;
  screen_guard: boolean;
  user_session_ephemeral: boolean;
  max_message_length: number;
};

export const DEFAULT_SETTINGS: SettingsShape = {
  uploads_enabled: true,
  typing_indicator: true,
  screen_guard: true,
  user_session_ephemeral: true,
  max_message_length: 4000,
};

export const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS) as Array<keyof SettingsShape>;

function coerce(v: unknown, fallback: unknown): unknown {
  if (v === null || v === undefined) return fallback;
  return v;
}

export function mergeSettings(
  global: Record<string, unknown>,
  perUser: Record<string, unknown>,
): SettingsShape {
  const out = { ...DEFAULT_SETTINGS } as Record<string, unknown>;
  for (const k of SETTING_KEYS) {
    out[k] = coerce(perUser[k], coerce(global[k], DEFAULT_SETTINGS[k]));
  }
  return out as SettingsShape;
}

/** Server-side: resolve the effective settings for one user. */
export async function effectiveSettingsForUser(userId: string): Promise<SettingsShape> {
  const admin = supabaseAdmin();
  const [globalRows, profile] = await Promise.all([
    admin.from("app_settings").select("key, value"),
    admin.from("profiles").select("settings").eq("id", userId).maybeSingle(),
  ]);

  const global: Record<string, unknown> = {};
  for (const row of globalRows.data ?? []) global[row.key] = row.value;
  const perUser =
    (profile.data?.settings as Record<string, unknown> | null | undefined) ?? {};
  return mergeSettings(global, perUser);
}
