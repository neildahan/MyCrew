import { createAdminClient } from "@/lib/supabase/admin";

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
