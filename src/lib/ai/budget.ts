import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_TIMEZONE, startOfDayUtc } from "@/lib/time";

/**
 * Monthly spend cap, in USD.
 *
 * This is a soft cap enforced by this app against its own usage_logs, so it
 * can only see spend this app recorded. It is not a substitute for the hard
 * spend limit in the Anthropic Console, which is the real backstop if this
 * code ever fails to log a call.
 */
export const MONTHLY_BUDGET_USD = Number(process.env.MONTHLY_BUDGET_USD ?? 10);

/** Above this fraction of the budget, downgrade to the cheaper model. */
const DEGRADE_AT = 0.8;

export type BudgetState = "ok" | "degrade" | "stop";

export interface BudgetStatus {
  spend: number;
  budget: number;
  remaining: number;
  fraction: number;
  state: BudgetState;
}

function startOfMonthIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

/** Total USD logged by this app since the start of the current month. */
export async function getMonthToDateSpend(): Promise<number> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("usage_logs")
    .select("cost_usd")
    .gte("created_at", startOfMonthIso());

  if (error) {
    // Fail OPEN here on purpose: a database hiccup should not silently stop
    // the assistant from answering. The Console spend limit still applies.
    console.error("Budget check failed, allowing the request:", error);
    return 0;
  }

  return (data ?? []).reduce((sum, row) => sum + (row.cost_usd ?? 0), 0);
}

export async function getBudgetStatus(): Promise<BudgetStatus> {
  const spend = await getMonthToDateSpend();
  const budget = MONTHLY_BUDGET_USD;
  const fraction = budget > 0 ? spend / budget : 0;

  const state: BudgetState =
    fraction >= 1 ? "stop" : fraction >= DEGRADE_AT ? "degrade" : "ok";

  return {
    spend,
    budget,
    remaining: Math.max(budget - spend, 0),
    fraction,
    state,
  };
}

/** What the user is told when the cap is reached, in both languages. */
export function budgetExceededMessage(status: BudgetStatus): string {
  return (
    `⚠️ הגעתי לתקרה החודשית ` +
    `($${status.spend.toFixed(2)} מתוך $${status.budget.toFixed(2)}), ` +
    `אז אני עוצר עד תחילת החודש הבא.\n\n` +
    `Monthly budget reached ($${status.spend.toFixed(2)} of $${status.budget.toFixed(2)}). ` +
    `Raise MONTHLY_BUDGET_USD to continue.`
  );
}

// --- Daily spend -----------------------------------------------------------

/**
 * Days are Israel days, not UTC days. A UTC boundary would put everything
 * between midnight and 03:00 Israel time on the wrong day, which is exactly
 * when a late-night message would land.
 */
const TZ = DEFAULT_TIMEZONE;

/** YYYY-MM-DD for `at` in the crew timezone. */
function isoDateIn(at: Date): string {
  return at.toLocaleDateString("en-CA", { timeZone: TZ });
}

export interface DayCost {
  /** YYYY-MM-DD in the crew timezone. */
  date: string;
  cost: number;
  messages: number;
}

/**
 * Cost per day for the last `days` days, newest first. Days with no traffic
 * are included at zero, so a gap reads as a quiet day rather than as missing
 * data.
 */
export async function getDailyCosts(days = 7): Promise<DayCost[]> {
  const supabase = createAdminClient();

  const todayIso = isoDateIn(new Date());
  const since = startOfDayUtc(todayIso, TZ);
  since.setDate(since.getDate() - (days - 1));

  const { data, error } = await supabase
    .from("usage_logs")
    .select("cost_usd,created_at")
    .gte("created_at", since.toISOString());

  if (error) {
    console.error("Daily cost query failed:", error);
    return [];
  }

  const buckets = new Map<string, DayCost>();
  for (let i = 0; i < days; i++) {
    const d = new Date(startOfDayUtc(todayIso, TZ).getTime() - i * 86_400_000);
    const key = isoDateIn(d);
    buckets.set(key, { date: key, cost: 0, messages: 0 });
  }

  for (const row of data ?? []) {
    const key = isoDateIn(new Date(row.created_at));
    const bucket = buckets.get(key);
    if (!bucket) continue; // Outside the window after timezone shifting.
    bucket.cost += row.cost_usd ?? 0;
    bucket.messages += 1;
  }

  return Array.from(buckets.values()).sort((a, b) => b.date.localeCompare(a.date));
}

export interface SpendReport {
  today: DayCost;
  yesterday: DayCost;
  recent: DayCost[];
  monthToDate: number;
  budget: number;
  remaining: number;
  /** Mean daily cost across days that actually had traffic. */
  dailyAverage: number;
  /** Month-end projection at the current daily average. */
  projectedMonth: number;
}

export async function getSpendReport(days = 7): Promise<SpendReport> {
  const [recent, monthToDate] = await Promise.all([
    getDailyCosts(days),
    getMonthToDateSpend(),
  ]);

  const blank = (date: string): DayCost => ({ date, cost: 0, messages: 0 });
  const todayIso = isoDateIn(new Date());
  const yesterdayIso = isoDateIn(new Date(Date.now() - 86_400_000));

  const active = recent.filter((d) => d.messages > 0);
  const dailyAverage = active.length
    ? active.reduce((sum, d) => sum + d.cost, 0) / active.length
    : 0;

  const daysInMonth = new Date(
    new Date().getUTCFullYear(),
    new Date().getUTCMonth() + 1,
    0
  ).getDate();

  return {
    today: recent.find((d) => d.date === todayIso) ?? blank(todayIso),
    yesterday: recent.find((d) => d.date === yesterdayIso) ?? blank(yesterdayIso),
    recent,
    monthToDate,
    budget: MONTHLY_BUDGET_USD,
    remaining: Math.max(MONTHLY_BUDGET_USD - monthToDate, 0),
    dailyAverage,
    projectedMonth: dailyAverage * daysInMonth,
  };
}

/** Sub-cent costs read as "$0.00", which looks broken. Show real precision. */
export function formatUsd(amount: number): string {
  if (amount === 0) return "$0";
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  if (amount < 1) return `$${amount.toFixed(3)}`;
  return `$${amount.toFixed(2)}`;
}
