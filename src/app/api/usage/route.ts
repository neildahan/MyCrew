import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = createAdminClient();
  const days = parseInt(request.nextUrl.searchParams.get("days") ?? "7");

  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await supabase
    .from("usage_logs")
    .select("*, agents(name, slug)")
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Aggregate stats
  const stats = {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCost: 0,
    byAgent: {} as Record<string, { inputTokens: number; outputTokens: number; count: number }>,
    daily: {} as Record<string, { inputTokens: number; outputTokens: number }>,
  };

  for (const log of data ?? []) {
    stats.totalInputTokens += log.input_tokens;
    stats.totalOutputTokens += log.output_tokens;
    stats.totalCost += log.cost_usd ?? 0;

    const agentName = (log as any).agents?.name ?? "Unknown";
    if (!stats.byAgent[agentName]) {
      stats.byAgent[agentName] = { inputTokens: 0, outputTokens: 0, count: 0 };
    }
    stats.byAgent[agentName].inputTokens += log.input_tokens;
    stats.byAgent[agentName].outputTokens += log.output_tokens;
    stats.byAgent[agentName].count++;

    const day = log.created_at.split("T")[0];
    if (!stats.daily[day]) {
      stats.daily[day] = { inputTokens: 0, outputTokens: 0 };
    }
    stats.daily[day].inputTokens += log.input_tokens;
    stats.daily[day].outputTokens += log.output_tokens;
  }

  return NextResponse.json(stats);
}
