import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Microsoft 365 app credentials.
 *
 * Read from the `settings` table first, then environment variables. Vercel
 * environment variables were added twice and production never saw them, with
 * no way to diagnose it from outside the dashboard; the database is somewhere
 * both the app and the people maintaining it can actually verify.
 *
 *   microsoft_client_id
 *   microsoft_client_secret
 *   microsoft_tenant
 *   microsoft_redirect_uri
 */

export interface MicrosoftConfig {
  clientId: string | null;
  clientSecret: string | null;
  tenant: string;
  redirectUri: string;
}

const DEFAULT_REDIRECT =
  "https://mycrew-app.vercel.app/api/auth/callback/microsoft";

let cache: { value: MicrosoftConfig; at: number } | null = null;
const CACHE_MS = 60_000;

export async function getMicrosoftConfig(): Promise<MicrosoftConfig> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;

  const stored: Record<string, string> = {};
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("settings")
      .select("key,value")
      .in("key", [
        "microsoft_client_id",
        "microsoft_client_secret",
        "microsoft_tenant",
        "microsoft_redirect_uri",
      ]);
    for (const row of data ?? []) {
      if (row.value) stored[row.key] = row.value;
    }
  } catch (error) {
    console.error("Could not read Microsoft config from settings:", error);
  }

  const value: MicrosoftConfig = {
    clientId: stored.microsoft_client_id ?? process.env.MICROSOFT_CLIENT_ID ?? null,
    clientSecret:
      stored.microsoft_client_secret ?? process.env.MICROSOFT_CLIENT_SECRET ?? null,
    tenant: stored.microsoft_tenant ?? process.env.MICROSOFT_TENANT ?? "common",
    redirectUri:
      stored.microsoft_redirect_uri ??
      process.env.MICROSOFT_REDIRECT_URI ??
      DEFAULT_REDIRECT,
  };

  cache = { value, at: Date.now() };
  return value;
}

/** Which pieces are present, for diagnostics. Never returns the values. */
export async function getMicrosoftConfigStatus() {
  const c = await getMicrosoftConfig();
  return {
    clientId: c.clientId ? "set" : "missing",
    clientSecret: c.clientSecret ? "set" : "missing",
    tenant: c.tenant,
    redirectUri: c.redirectUri,
  };
}
