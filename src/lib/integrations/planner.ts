import { createAdminClient } from "@/lib/supabase/admin";
import { getValidToken } from "./token-manager";

/**
 * Microsoft Planner, which is where the real task list lives.
 *
 * Config sits in `settings`, so moving to another plan or adding a person is a
 * database write rather than a deploy:
 *
 *   planner_plan_id   - the plan to read and write
 *   planner_members   - JSON [{ entraId, name, email, whatsapp }]
 *
 * The member list is also what lets this avoid asking for a directory scope.
 * Planner identifies assignees by Entra object id and nothing else, so turning
 * one into "ענבל" would otherwise need User.ReadBasic.All over the whole
 * tenant - a lot of reach for a two-person plan.
 */

const GRAPH = "https://graph.microsoft.com/v1.0";

export interface PlannerMember {
  entraId: string;
  name: string;
  email?: string;
  /** WhatsApp id, when this person uses the assistant. */
  whatsapp?: string;
}

export interface PlannerConfig {
  planId: string | null;
  members: PlannerMember[];
}

let cache: { value: PlannerConfig; at: number } | null = null;
const CACHE_MS = 60_000;

export async function getPlannerConfig(): Promise<PlannerConfig> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;

  const value: PlannerConfig = { planId: null, members: [] };
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("settings")
      .select("key,value")
      .in("key", ["planner_plan_id", "planner_members"]);

    for (const row of data ?? []) {
      if (row.key === "planner_plan_id") value.planId = row.value || null;
      if (row.key === "planner_members") {
        try {
          const parsed = JSON.parse(row.value || "[]");
          if (Array.isArray(parsed)) value.members = parsed;
        } catch {
          console.error("planner_members is not valid JSON; ignoring it.");
        }
      }
    }
  } catch (error) {
    console.error("Could not read Planner config:", error);
  }

  cache = { value, at: Date.now() };
  return value;
}

/** Entra id for a WhatsApp sender, or null if they are not on the plan. */
export async function entraIdFor(whatsappUserId: string): Promise<string | null> {
  const { members } = await getPlannerConfig();
  return members.find((m) => m.whatsapp === whatsappUserId)?.entraId ?? null;
}

/** Display name for an Entra id, falling back to a short form of the id. */
export async function nameForEntraId(entraId: string): Promise<string> {
  const { members } = await getPlannerConfig();
  return members.find((m) => m.entraId === entraId)?.name ?? entraId.slice(0, 8);
}

export interface GraphResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
  /** Planner requires this on every update, as If-Match. */
  etag?: string;
}

export async function graph<T = unknown>(
  path: string,
  init?: RequestInit
): Promise<GraphResult<T>> {
  const token = await getValidToken("microsoft");
  if (!token) {
    return { ok: false, status: 401, data: null, error: "Microsoft is not connected." };
  }

  const response = await fetch(`${GRAPH}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  // 204 on a successful PATCH or DELETE, with no body to parse.
  if (response.status === 204) {
    return { ok: true, status: 204, data: null };
  }

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const code = (body as { error?: { code?: string; message?: string } })?.error;
    return {
      ok: false,
      status: response.status,
      data: null,
      error: code?.message ?? code?.code ?? `Graph returned ${response.status}`,
    };
  }

  return {
    ok: true,
    status: response.status,
    data: body as T,
    etag:
      (body as { "@odata.etag"?: string })?.["@odata.etag"] ??
      response.headers.get("etag") ??
      undefined,
  };
}
