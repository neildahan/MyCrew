"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/page-header";
import { Bot, MessageSquare, Zap, TrendingUp } from "lucide-react";
import type { Agent } from "@/types/database";

const agentColors: Record<string, string> = {
  yarden: "bg-green-100 text-green-700 border-green-200",
  dana: "bg-purple-100 text-purple-700 border-purple-200",
  james: "bg-blue-100 text-blue-700 border-blue-200",
};

const agentIcons: Record<string, string> = {
  yarden: "Secretary",
  dana: "Marketing",
  james: "Advisor",
};

export default function DashboardPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [usage, setUsage] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [agentsRes, usageRes] = await Promise.all([
          fetch("/api/agents"),
          fetch("/api/usage?days=7"),
        ]);
        setAgents(await agentsRes.json());
        setUsage(await usageRes.json());
      } catch (err) {
        console.error("Failed to load dashboard:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading dashboard...</div>
      </div>
    );
  }

  const totalMessages = usage?.totalInputTokens ? Math.round((usage.totalInputTokens + usage.totalOutputTokens) / 500) : 0;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Overview of your AI crew"
      />

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Agents</CardTitle>
            <Bot className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {agents.filter((a) => a.is_active).length}
            </div>
            <p className="text-xs text-muted-foreground">of {agents.length} total</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Messages (7d)</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">~{totalMessages}</div>
            <p className="text-xs text-muted-foreground">estimated from tokens</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tokens Used (7d)</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {((usage?.totalInputTokens ?? 0) + (usage?.totalOutputTokens ?? 0)).toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">input + output</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Est. Cost (7d)</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${(usage?.totalCost ?? 0).toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground">across all agents</p>
          </CardContent>
        </Card>
      </div>

      {/* Agent Status */}
      <h2 className="text-xl font-semibold mb-4">Your Crew</h2>
      <div className="grid gap-4 md:grid-cols-3 mb-8">
        {agents.map((agent) => (
          <Card key={agent.id} className="relative">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{agent.name}</CardTitle>
                <Badge variant={agent.is_active ? "success" : "secondary"}>
                  {agent.is_active ? "Active" : "Inactive"}
                </Badge>
              </div>
              <CardDescription>
                <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${agentColors[agent.slug] ?? ""}`}>
                  {agentIcons[agent.slug] ?? agent.slug}
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground line-clamp-2">
                {agent.persona_description}
              </p>
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="bg-secondary px-2 py-0.5 rounded">
                  {agent.model_provider}/{agent.model_name}
                </span>
              </div>
              {usage?.byAgent?.[agent.name] && (
                <div className="mt-2 text-xs text-muted-foreground">
                  {usage.byAgent[agent.name].count} interactions this week
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Tips */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Quick Start</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>1. Configure your WhatsApp Business API keys in <strong>Settings</strong></p>
          <p>2. Set up your Gemini API key in <strong>Settings</strong></p>
          <p>3. Send a message to your WhatsApp number to start chatting with your crew</p>
          <p>4. Use <code>/yarden</code>, <code>/dana</code>, or <code>/james</code> to switch agents</p>
          <p>5. Send <code>/menu</code> or <code>/help</code> to see the agent selection menu</p>
        </CardContent>
      </Card>
    </div>
  );
}
