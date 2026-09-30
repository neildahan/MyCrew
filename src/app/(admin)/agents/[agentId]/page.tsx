"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/layout/page-header";
import { useToast } from "@/components/ui/toast";
import { ArrowLeft, Save } from "lucide-react";
import type { Agent } from "@/types/database";
import Link from "next/link";

const MODEL_OPTIONS: Record<string, { value: string; label: string }[]> = {
  gemini: [
    { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
  ],
  anthropic: [
    { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (Recommended)" },
    { value: "claude-opus-4-6", label: "Claude Opus 4.6 (Most capable)" },
    { value: "claude-haiku-4-5", label: "Claude Haiku 4.5 (Fastest)" },
  ],
  openai: [
    { value: "gpt-4o", label: "GPT-4o" },
    { value: "gpt-4o-mini", label: "GPT-4o Mini" },
  ],
};

export default function AgentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { addToast } = useToast();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/agents/${params.agentId}`)
      .then((res) => res.json())
      .then(setAgent)
      .finally(() => setLoading(false));
  }, [params.agentId]);

  async function handleSave() {
    if (!agent) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/agents/${agent.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: agent.name,
          persona_description: agent.persona_description,
          system_prompt: agent.system_prompt,
          model_provider: agent.model_provider,
          model_name: agent.model_name,
          temperature: agent.temperature,
          max_tokens: agent.max_tokens,
          is_active: agent.is_active,
        }),
      });
      if (res.ok) {
        addToast({ title: "Agent updated", variant: "success" });
      } else {
        addToast({ title: "Failed to update", variant: "destructive" });
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading || !agent) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>;
  }

  return (
    <div>
      <PageHeader
        title={`Configure ${agent.name}`}
        description={`Edit persona, system prompt, and model settings for ${agent.name}`}
        action={
          <div className="flex gap-2">
            <Link href="/agents">
              <Button variant="outline">
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
            </Link>
            <Button onClick={handleSave} disabled={saving}>
              <Save className="h-4 w-4 mr-1" />
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        }
      />

      <div className="grid gap-6 md:grid-cols-2">
        {/* General */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">General</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium">Name</label>
              <Input
                value={agent.name}
                onChange={(e) => setAgent({ ...agent, name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Slug</label>
              <Input value={agent.slug} disabled className="bg-muted" />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Active</label>
              <Switch
                checked={agent.is_active}
                onCheckedChange={(checked) =>
                  setAgent({ ...agent, is_active: checked })
                }
              />
            </div>
          </CardContent>
        </Card>

        {/* Model Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Model Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium">Provider</label>
              <Select
                value={agent.model_provider}
                onChange={(e) => {
                  const newProvider = e.target.value;
                  const models = MODEL_OPTIONS[newProvider] || [];
                  const defaultModel = models[0]?.value || "";
                  setAgent({
                    ...agent,
                    model_provider: newProvider,
                    model_name: defaultModel,
                  });
                }}
              >
                <option value="gemini">Google Gemini</option>
                <option value="anthropic">Anthropic (Claude)</option>
                <option value="openai">OpenAI</option>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Model</label>
              <Select
                value={agent.model_name}
                onChange={(e) =>
                  setAgent({ ...agent, model_name: e.target.value })
                }
              >
                {(MODEL_OPTIONS[agent.model_provider] || []).map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">
                Temperature ({agent.temperature})
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={agent.temperature}
                onChange={(e) =>
                  setAgent({ ...agent, temperature: parseFloat(e.target.value) })
                }
                className="w-full"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Max Tokens</label>
              <Input
                type="number"
                value={agent.max_tokens}
                onChange={(e) =>
                  setAgent({ ...agent, max_tokens: parseInt(e.target.value) })
                }
              />
            </div>
          </CardContent>
        </Card>

        {/* Persona */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Persona Description</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={agent.persona_description}
              onChange={(e) =>
                setAgent({ ...agent, persona_description: e.target.value })
              }
              rows={4}
            />
          </CardContent>
        </Card>

        {/* System Prompt */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">System Prompt</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={agent.system_prompt}
              onChange={(e) =>
                setAgent({ ...agent, system_prompt: e.target.value })
              }
              rows={12}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground mt-2">
              Use {"{{current_date}}"} for dynamic date injection. Active skills are appended automatically.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
