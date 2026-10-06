import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_TIMEZONE, startOfDayUtc } from "@/lib/time";
import { MONTHLY_BUDGET_USD, getMonthToDateSpend } from "@/lib/ai/budget";

export const dynamic = "force-dynamic";

const TZ = DEFAULT_TIMEZONE;

/** YYYY-MM-DD for an instant, in the crew timezone. */
const isoDateIn = (at: Date) => at.toLocaleDateString("en-CA", { timeZone: TZ });

export async function GET(request: NextRequest) {
  const supabase = createAdminClient();
  const raw = parseInt(request.nextUrl.searchParams.get("days") ?? "7");
  const days = Number.isFinite(raw) ? Math.min(Math.max(raw, 1), 90) : 7;

  // Whole Israel days, not a rolling "now minus N×24h" window: the latter
  // slices today in half and makes the oldest day look artificially cheap.
  const todayIso = isoDateIn(new Date());
  const since = new Date(
    startOfDayUtc(todayIso, TZ).getTime() - (days - 1) * 86_400_000
  );

  const { data, error } = await supabase
    .from("usage_logs")
    .select("*, agents(name, slug)")
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const stats = {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCost: 0,
    totalMessages: 0,
    byAgent: {} as Record<
      string,
      { inputTokens: number; outputTokens: number; count: number; cost: number }
    >,
    daily: {} as Record<
      string,
      { inputTokens: number; outputTokens: number; cost: number; messages: number }
    >,
    // Budget context, so the dashboard answers "and how much is left?"
    monthToDate: 0,
    budget: MONTHLY_BUDGET_USD,
    remaining: 0,
    dailyAverage: 0,
    projectedMonth: 0,
  };

  // Seed every day in the window, so a quiet day shows as zero rather than
  // vanishing from the list and making the range look shorter than it is.
  for (let i = 0; i < days; i++) {
    const key = isoDateIn(
      new Date(startOfDayUtc(todayIso, TZ).getTime() - i * 86_400_000)
    );
    stats.daily[key] = { inputTokens: 0, outputTokens: 0, cost: 0, messages: 0 };
  }

  for (const log of data ?? []) {
    const cost = log.cost_usd ?? 0;
    stats.totalInputTokens += log.input_tokens;
    stats.totalOutputTokens += log.output_tokens;
    stats.totalCost += cost;
    stats.totalMessages += 1;

    const agentName = (log as { agents?: { name?: string } }).agents?.name ?? "Unknown";
    stats.byAgent[agentName] ??= {
      inputTokens: 0,
      outputTokens: 0,
      count: 0,
      cost: 0,
    };
    stats.byAgent[agentName].inputTokens += log.input_tokens;
    stats.byAgent[agentName].outputTokens += log.output_tokens;
    stats.byAgent[agentName].count += 1;
    stats.byAgent[agentName].cost += cost;

    // Bucket on the Israel date. Splitting the raw UTC timestamp files
    // anything after 21:00 local under tomorrow.
    const day = isoDateIn(new Date(log.created_at));
    const bucket = stats.daily[day];
    if (!bucket) continue;
    bucket.inputTokens += log.input_tokens;
    bucket.outputTokens += log.output_tokens;
    bucket.cost += cost;
    bucket.messages += 1;
  }

  stats.monthToDate = await getMonthToDateSpend();
  stats.remaining = Math.max(MONTHLY_BUDGET_USD - stats.monthToDate, 0);

  // Average over days that actually saw traffic: including the silent ones
  // drags the projection toward zero and hides a real spending trend.
  const active = Object.values(stats.daily).filter((d) => d.messages > 0);
  stats.dailyAverage = active.length
    ? active.reduce((sum, d) => sum + d.cost, 0) / active.length
    : 0;

  const now = new Date();
  const daysInMonth = new Date(
    now.getUTCFullYear(),
    now.getUTCMonth() + 1,
    0
  ).getDate();
  stats.projectedMonth = stats.dailyAverage * daysInMonth;

  return NextResponse.json(stats);
}
