import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Shared secret for /api/agent/message, which the WhatsApp worker uses to
 * drive the agent.
 *
 * Read from the `settings` table first, environment second - the same pattern
 * as the crew list and the Microsoft credentials. Vercel environment variables
 * have twice now been set and not seen by production, with no way to tell from
 * outside the dashboard; the database is somewhere both the app and the person
 * maintaining it can actually check.
 *
 *   agent_api_secret
 */

let cache: { value: string | null; at: number } | null = null;
const CACHE_MS = 60_000;

export async function getAgentApiSecret(): Promise<string | null> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;

  let stored: string | null = null;
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "agent_api_secret")
      .maybeSingle();
    stored = data?.value ?? null;
  } catch (error) {
    console.error("Could not read agent_api_secret from settings:", error);
  }

  const value = stored || process.env.AGENT_API_SECRET || null;
  cache = { value, at: Date.now() };
  return value;
}
