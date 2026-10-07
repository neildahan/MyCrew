import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The crew is the small, fixed set of people allowed to use the assistant.
 *
 * It lives in the `settings` table rather than an environment variable so that
 * adding or removing someone is a database write, not a Vercel dashboard trip
 * followed by a redeploy. Env vars remain as a fallback for local development
 * and for the very first boot before anything is stored.
 *
 *   crew_numbers -> "972544373481,972500000000"
 *   crew_names   -> "Neil,Inbal"            (positional, optional)
 */

const NUMBERS_KEY = "crew_numbers";
const NAMES_KEY = "crew_names";

/** Cached for a minute: this is read on every inbound message. */
let cache: { numbers: string[]; names: string[]; at: number } | null = null;
const CACHE_MS = 60_000;

function fromEnv(key: string): string[] {
  const raw =
    key === NUMBERS_KEY
      ? process.env.CREW_WHATSAPP_NUMBERS
      : process.env.CREW_NAMES;
  return (raw ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

async function load(): Promise<{ numbers: string[]; names: string[] }> {
  if (cache && Date.now() - cache.at < CACHE_MS) {
    return { numbers: cache.numbers, names: cache.names };
  }

  let numbers: string[] = [];
  let names: string[] = [];

  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("settings")
      .select("key,value")
      .in("key", [NUMBERS_KEY, NAMES_KEY]);

    for (const row of data ?? []) {
      const parts = (row.value ?? "").split(",").map((s: string) => s.trim()).filter(Boolean);
      if (row.key === NUMBERS_KEY) numbers = parts;
      if (row.key === NAMES_KEY) names = parts;
    }
  } catch (error) {
    // Fall through to env rather than locking everyone out on a hiccup.
    console.error("Could not read crew from settings:", error);
  }

  if (numbers.length === 0) numbers = fromEnv(NUMBERS_KEY);
  if (names.length === 0) names = fromEnv(NAMES_KEY);

  cache = { numbers, names, at: Date.now() };
  return { numbers, names };
}

export async function getCrewNumbers(): Promise<string[]> {
  return (await load()).numbers;
}

export async function isCrewMember(whatsappUserId: string): Promise<boolean> {
  const { numbers } = await load();
  // An empty crew denies everyone. Failing closed matters more here than
  // convenience: the alternative is a stranger spending the Anthropic key.
  return numbers.length > 0 && numbers.includes(whatsappUserId);
}

/** Display name for a number, falling back to the number itself. */
export async function getCrewName(whatsappUserId: string): Promise<string> {
  const { numbers, names } = await load();
  const i = numbers.indexOf(whatsappUserId);
  return i >= 0 && names[i] ? names[i] : whatsappUserId;
}

/**
 * The other crew member, for a two-person crew. Returns null if the crew is
 * not exactly two people, since "the other one" stops being well defined.
 */
export async function getOtherMember(whatsappUserId: string): Promise<string | null> {
  const { numbers } = await load();
  if (numbers.length !== 2) return null;
  return numbers.find((n) => n !== whatsappUserId) ?? null;
}

/**
 * Who the shared integrations belong to.
 *
 * The Microsoft and Google connections are a single token per provider, not
 * one per person, so ANY crew member reaching those tools reads the owner's
 * calendar and mail. In a group that answer is spoken to the whole room.
 *
 * Stored as `integrations_owner`; defaults to the first crew member, which is
 * whoever set the app up. Setting it to an empty string shares the mailbox
 * with the whole crew deliberately.
 */
export async function getIntegrationsOwner(): Promise<string | null> {
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "integrations_owner")
      .maybeSingle();
    if (data) return data.value ?? null;
  } catch (error) {
    console.error("Could not read integrations_owner:", error);
  }
  const { numbers } = await load();
  return numbers[0] ?? null;
}

/** May this person use the shared mail and calendar connections? */
export async function mayUseSharedIntegrations(
  whatsappUserId: string
): Promise<boolean> {
  const owner = await getIntegrationsOwner();
  // No owner recorded means the crew shares them on purpose.
  if (!owner) return true;
  return owner === whatsappUserId;
}
