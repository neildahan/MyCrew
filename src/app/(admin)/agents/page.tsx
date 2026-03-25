"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { Settings, MessageSquare, Wrench } from "lucide-react";
import type { Agent } from "@/types/database";

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/agents")
      .then((res) => res.json())
      .then(setAgents)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading agents...</div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Agents"
        description="Manage your AI crew members"
      />

      <div className="grid gap-6 md:grid-cols-3">
        {agents.map((agent) => (
          <Card key={agent.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{agent.name}</CardTitle>
                <Badge variant={agent.is_active ? "success" : "secondary"}>
                  {agent.is_active ? "Active" : "Inactive"}
                </Badge>
              </div>
              <CardDescription className="text-xs">
                {agent.model_provider}/{agent.model_name} | Temp: {agent.temperature}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4 line-clamp-3">
                {agent.persona_description}
              </p>
              <div className="flex gap-2">
                <Link href={`/agents/${agent.id}`}>
                  <Button variant="outline" size="sm">
                    <Settings className="h-3 w-3 mr-1" />
                    Configure
                  </Button>
                </Link>
                <Link href={`/agents/${agent.id}/skills`}>
                  <Button variant="outline" size="sm">
                    <Wrench className="h-3 w-3 mr-1" />
                    Skills
                  </Button>
                </Link>
                <Link href={`/agents/${agent.id}/conversations`}>
                  <Button variant="outline" size="sm">
                    <MessageSquare className="h-3 w-3 mr-1" />
                    Chats
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
