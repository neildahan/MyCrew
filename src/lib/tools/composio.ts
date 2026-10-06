import { Composio } from "@composio/core";
import type { ToolDefinition } from "@/lib/ai/types";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Composio gives Yarden Outlook (and anything else) without an Azure app
 * registration, a client secret, or environment variables: Composio owns the
 * OAuth app, hosts the consent screen, and refreshes the tokens.
 *
 * Config lives in the settings table:
 *   composio_api_key   - from the Composio dashboard
 *   composio_tools     - optional, comma-separated override of ENABLED_TOOLS
 *
 * The Composio "user id" is the crew member's WhatsApp number, so Neil and
 * Inbal each connect their own mailbox and never see each other's.
 */

/**
 * Deliberately a short list. The Outlook toolkit alone exposes 282 tools, and
 * every tool definition is tokens on every single message - sending them all
 * would cost more per message than the whole assistant costs today. These are
 * the ones an assistant actually reaches for; widen it via composio_tools.
 */
const ENABLED_TOOLS = [
  "OUTLOOK_GET_CALENDAR_VIEW",
  "OUTLOOK_CREATE_CALENDAR_EVENT",
  "OUTLOOK_FIND_MEETING_TIMES",
  "OUTLOOK_LIST_MESSAGES",
  "OUTLOOK_SEARCH_MESSAGES",
  "OUTLOOK_CREATE_EMAIL_DRAFT",
];

/** Composio tool slugs are upper snake case; this is how we route a call. */
export const isComposioTool = (name: string) => /^[A-Z][A-Z0-9_]+$/.test(name);

async function setting(key: string): Promise<string | null> {
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("settings")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    return data?.value ?? null;
  } catch {
    return null;
  }
}

async function client(): Promise<Composio | null> {
  const apiKey = (await setting("composio_api_key")) ?? process.env.COMPOSIO_API_KEY;
  if (!apiKey) return null;
  return new Composio({ apiKey });
}

async function enabledTools(): Promise<string[]> {
  const override = await setting("composio_tools");
  if (!override) return ENABLED_TOOLS;
  return override.split(",").map((s) => s.trim()).filter(Boolean);
}

/** Cached per user: this runs on every inbound message. */
const cache = new Map<string, { tools: ToolDefinition[]; at: number }>();
const CACHE_MS = 5 * 60_000;

/**
 * Tool definitions for a crew member, or [] when Composio is not configured
 * or the person has not connected anything. Never throws: a Composio outage
 * must degrade the assistant, not break her.
 */
export async function getComposioTools(userId: string): Promise<ToolDefinition[]> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.tools;

  const composio = await client();
  if (!composio) return [];

  try {
    const raw = await composio.tools.get(userId, { tools: await enabledTools() });

    const tools: ToolDefinition[] = (raw as unknown as Array<Record<string, unknown>>)
      .map((t) => {
        // The SDK returns provider-shaped tools; unwrap the common forms.
        const fn = (t.function ?? t) as Record<string, unknown>;
        const name = (fn.name ?? t.slug ?? t.name) as string | undefined;
        if (!name) return null;
        return {
          name,
          description: (fn.description ?? t.description ?? name) as string,
          parameters: (fn.parameters ?? t.inputParameters ?? {
            type: "object",
            properties: {},
          }) as object,
        };
      })
      .filter((t): t is ToolDefinition => t !== null);

    cache.set(userId, { tools, at: Date.now() });
    return tools;
  } catch (error) {
    console.error("Could not load Composio tools:", error);
    return [];
  }
}

/** Execute a Composio tool on behalf of a crew member. */
export async function executeComposioTool(
  slug: string,
  args: Record<string, unknown>,
  userId: string
): Promise<unknown> {
  const composio = await client();
  if (!composio) return { error: "Composio is not configured." };

  try {
    const result = await composio.tools.execute(slug, { userId, arguments: args });
    const r = result as unknown as Record<string, unknown>;

    // A failed tool call must read as a failure to the model, not as data.
    if (r.successful === false) {
      return { error: r.error ?? "The tool call failed.", data: r.data };
    }
    return r.data ?? r;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Composio tool ${slug} failed:`, message);
    return { error: `Tool failed: ${message}` };
  }
}

/**
 * Start connecting a toolkit (e.g. "outlook") for one crew member. Returns the
 * hosted sign-in URL: they approve on Microsoft's own consent screen and
 * Composio stores and refreshes the token.
 *
 * toolkits.authorize creates the managed auth config on first use, so there is
 * nothing to register or configure beforehand.
 */
export async function startConnection(
  userId: string,
  toolkit: string
): Promise<string | null> {
  const composio = await client();
  if (!composio) return null;

  try {
    const request = await composio.toolkits.authorize(userId, toolkit);
    const r = request as unknown as Record<string, unknown>;
    return (r.redirectUrl ?? r.redirect_url ?? r.url ?? null) as string | null;
  } catch (error) {
    console.error(`Could not start ${toolkit} connection:`, error);
    return null;
  }
}

/** Which toolkits this person has actually connected. */
export async function listConnections(userId: string): Promise<string[]> {
  const composio = await client();
  if (!composio) return [];
  try {
    const res = await composio.connectedAccounts.list({ userIds: [userId] });
    const items = ((res as unknown as Record<string, unknown>).items ?? []) as Array<
      Record<string, unknown>
    >;
    return items
      .map((i) => {
        const tk = i.toolkit as Record<string, unknown> | undefined;
        return (tk?.slug ?? i.toolkitSlug) as string | undefined;
      })
      .filter((s): s is string => !!s);
  } catch (error) {
    console.error("Could not list Composio connections:", error);
    return [];
  }
}
