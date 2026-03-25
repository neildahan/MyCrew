"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { BarChart3 } from "lucide-react";

interface UsageStats {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  byAgent: Record<string, { inputTokens: number; outputTokens: number; count: number }>;
  daily: Record<string, { inputTokens: number; outputTokens: number }>;
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
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>;
  }

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
      <div className="grid gap-4 md:grid-cols-3 mb-8">
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
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Estimated Cost
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${(stats?.totalCost ?? 0).toFixed(4)}
            </div>
          </CardContent>
        </Card>
      </div>

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
                  <span className="text-muted-foreground">Interactions</span>
                  <span className="font-medium">{data.count}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Input tokens</span>
                  <span className="font-medium">{data.inputTokens.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Output tokens</span>
                  <span className="font-medium">{data.outputTokens.toLocaleString()}</span>
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
      {Object.keys(stats?.daily ?? {}).length > 0 && (
        <>
          <h2 className="text-xl font-semibold mb-4">Daily Breakdown</h2>
          <Card>
            <CardContent className="p-4">
              <div className="space-y-2">
                {Object.entries(stats?.daily ?? {})
                  .sort(([a], [b]) => b.localeCompare(a))
                  .map(([date, data]) => (
                    <div key={date} className="flex items-center justify-between text-sm py-2 border-b last:border-0">
                      <span className="font-medium">{new Date(date).toLocaleDateString()}</span>
                      <div className="flex gap-6 text-muted-foreground">
                        <span>In: {data.inputTokens.toLocaleString()}</span>
                        <span>Out: {data.outputTokens.toLocaleString()}</span>
                        <span className="font-medium text-foreground">
                          Total: {(data.inputTokens + data.outputTokens).toLocaleString()}
                        </span>
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
