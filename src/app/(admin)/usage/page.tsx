"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { BarChart3 } from "lucide-react";

interface DayStats {
  inputTokens: number;
  outputTokens: number;
  cost: number;
  messages: number;
}

interface UsageStats {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  totalMessages: number;
  byAgent: Record<
    string,
    { inputTokens: number; outputTokens: number; count: number; cost: number }
  >;
  daily: Record<string, DayStats>;
  monthToDate: number;
  budget: number;
  remaining: number;
  dailyAverage: number;
  projectedMonth: number;
}

/** A sub-cent day rendered as "$0.00" reads as broken rather than as cheap. */
function usd(amount: number): string {
  if (amount === 0) return "$0";
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  if (amount < 1) return `$${amount.toFixed(3)}`;
  return `$${amount.toFixed(2)}`;
}

/** Parsed as local noon, so the date never slips a day across timezones. */
function dayLabel(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export default function UsagePage() {
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/usage?days=${days}`)
      .then((r) => r.json())
      .then(setStats)
      .finally(() => setLoading(false));
  }, [days]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Loading...
      </div>
    );
  }

  const daily = Object.entries(stats?.daily ?? {}).sort(([a], [b]) =>
    b.localeCompare(a)
  );
  // Scale the bars to the busiest day so a quiet week still reads clearly.
  const peak = Math.max(...daily.map(([, d]) => d.cost), 0.0001);

  const budget = stats?.budget ?? 0;
  const monthToDate = stats?.monthToDate ?? 0;
  const usedFraction = budget > 0 ? Math.min(monthToDate / budget, 1) : 0;
  const overBudget = (stats?.projectedMonth ?? 0) > budget && (stats?.dailyAverage ?? 0) > 0;

  return (
    <div>
      <PageHeader
        title="Usage"
        description="Token usage and cost tracking"
        action={
          <div className="flex gap-2">
            {[7, 14, 30].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  days === d
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        }
      />

      {/* Totals */}
      <div className="grid gap-4 md:grid-cols-4 mb-8">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Cost ({days}d)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{usd(stats?.totalCost ?? 0)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {(stats?.totalMessages ?? 0).toLocaleString()} messages
              {(stats?.totalMessages ?? 0) > 0 &&
                ` · ${usd((stats?.totalCost ?? 0) / (stats?.totalMessages ?? 1))} each`}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Average day
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{usd(stats?.dailyAverage ?? 0)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              across days with traffic
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Input Tokens
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(stats?.totalInputTokens ?? 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Output Tokens
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(stats?.totalOutputTokens ?? 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Monthly budget */}
      <Card className="mb-8">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            This month
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline justify-between mb-2">
            <div className="text-2xl font-bold">{usd(monthToDate)}</div>
            <div className="text-sm text-muted-foreground">
              of {usd(budget)} · {usd(stats?.remaining ?? 0)} left
            </div>
          </div>
          <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                usedFraction >= 1
                  ? "bg-destructive"
                  : usedFraction >= 0.8
                  ? "bg-amber-500"
                  : "bg-primary"
              }`}
              style={{ width: `${Math.max(usedFraction * 100, 1)}%` }}
            />
          </div>
          {overBudget && (
            <p className="text-xs text-amber-600 dark:text-amber-500 mt-2">
              At the current daily average this month lands around{" "}
              {usd(stats?.projectedMonth ?? 0)}.
            </p>
          )}
        </CardContent>
      </Card>

      {/* By Agent */}
      <h2 className="text-xl font-semibold mb-4">Usage by Agent</h2>
      <div className="grid gap-4 md:grid-cols-3 mb-8">
        {Object.entries(stats?.byAgent ?? {}).map(([name, data]) => (
          <Card key={name}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{name}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cost</span>
                  <span className="font-semibold">{usd(data.cost)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Interactions</span>
                  <span className="font-medium">{data.count}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Input tokens</span>
                  <span className="font-medium">
                    {data.inputTokens.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Output tokens</span>
                  <span className="font-medium">
                    {data.outputTokens.toLocaleString()}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {Object.keys(stats?.byAgent ?? {}).length === 0 && (
          <div className="md:col-span-3 text-center py-12 text-muted-foreground text-sm">
            <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
            No usage data yet. Start chatting with your agents!
          </div>
        )}
      </div>

      {/* Daily Breakdown */}
      {daily.length > 0 && (
        <>
          <h2 className="text-xl font-semibold mb-4">Daily Breakdown</h2>
          <Card>
            <CardContent className="p-4">
              <div className="space-y-1">
                {daily.map(([date, data]) => (
                  <div
                    key={date}
                    className="flex items-center gap-4 text-sm py-2 border-b last:border-0"
                  >
                    <span className="font-medium w-28 shrink-0">
                      {dayLabel(date)}
                    </span>

                    <span className="font-semibold w-20 shrink-0 tabular-nums">
                      {usd(data.cost)}
                    </span>

                    <div className="flex-1 min-w-[40px] h-2 rounded-full bg-secondary overflow-hidden">
                      {data.cost > 0 && (
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{
                            width: `${Math.max((data.cost / peak) * 100, 2)}%`,
                          }}
                        />
                      )}
                    </div>

                    <div className="flex gap-4 text-muted-foreground text-xs shrink-0 tabular-nums">
                      {data.messages > 0 ? (
                        <>
                          <span className="w-16 text-right">
                            {data.messages} msg
                          </span>
                          <span className="w-24 text-right">
                            {(
                              data.inputTokens + data.outputTokens
                            ).toLocaleString()}{" "}
                            tok
                          </span>
                        </>
                      ) : (
                        <span className="w-40 text-right opacity-50">quiet</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
