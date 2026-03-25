"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/page-header";
import { useToast } from "@/components/ui/toast";
import { Plus, Trash2, ArrowLeft, Save } from "lucide-react";
import type { Agent, Skill } from "@/types/database";
import Link from "next/link";

export default function SkillsPage() {
  const params = useParams();
  const { addToast } = useToast();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [newSkill, setNewSkill] = useState({
    name: "",
    display_name: "",
    description: "",
    prompt_injection: "",
  });

  useEffect(() => {
    Promise.all([
      fetch(`/api/agents/${params.agentId}`).then((r) => r.json()),
      fetch(`/api/agents/${params.agentId}/skills`).then((r) => r.json()),
    ])
      .then(([a, s]) => {
        setAgent(a);
        setSkills(s);
      })
      .finally(() => setLoading(false));
  }, [params.agentId]);

  async function toggleSkill(skill: Skill) {
    const res = await fetch(`/api/agents/${params.agentId}/skills`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: skill.id, is_active: !skill.is_active }),
    });
    if (res.ok) {
      setSkills(skills.map((s) => (s.id === skill.id ? { ...s, is_active: !s.is_active } : s)));
      addToast({ title: `Skill ${skill.is_active ? "disabled" : "enabled"}`, variant: "success" });
    }
  }

  async function addSkill() {
    const res = await fetch(`/api/agents/${params.agentId}/skills`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newSkill),
    });
    if (res.ok) {
      const skill = await res.json();
      setSkills([...skills, skill]);
      setNewSkill({ name: "", display_name: "", description: "", prompt_injection: "" });
      setShowNew(false);
      addToast({ title: "Skill added", variant: "success" });
    }
  }

  async function deleteSkill(id: string) {
    const res = await fetch(`/api/agents/${params.agentId}/skills`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      setSkills(skills.filter((s) => s.id !== id));
      addToast({ title: "Skill deleted", variant: "success" });
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>;
  }

  return (
    <div>
      <PageHeader
        title={`${agent?.name}'s Skills`}
        description="Manage what this agent can do"
        action={
          <div className="flex gap-2">
            <Link href="/agents">
              <Button variant="outline">
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
            </Link>
            <Button onClick={() => setShowNew(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Add Skill
            </Button>
          </div>
        }
      />

      {/* Add New Skill Form */}
      {showNew && (
        <Card className="mb-6 border-primary/50">
          <CardHeader>
            <CardTitle className="text-lg">New Skill</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Skill Name (slug)</label>
                <Input
                  value={newSkill.name}
                  onChange={(e) => setNewSkill({ ...newSkill, name: e.target.value })}
                  placeholder="e.g., send_invoice"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Display Name</label>
                <Input
                  value={newSkill.display_name}
                  onChange={(e) => setNewSkill({ ...newSkill, display_name: e.target.value })}
                  placeholder="e.g., Send Invoice"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <Textarea
                value={newSkill.description}
                onChange={(e) => setNewSkill({ ...newSkill, description: e.target.value })}
                placeholder="What this skill does..."
                rows={2}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Prompt Injection (instructions for the AI)</label>
              <Textarea
                value={newSkill.prompt_injection}
                onChange={(e) => setNewSkill({ ...newSkill, prompt_injection: e.target.value })}
                placeholder="Additional instructions when this skill is active..."
                rows={3}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={addSkill}>
                <Save className="h-4 w-4 mr-1" />
                Save Skill
              </Button>
              <Button variant="outline" onClick={() => setShowNew(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Skills List */}
      <div className="space-y-3">
        {skills.map((skill) => (
          <Card key={skill.id}>
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{skill.display_name}</span>
                  <Badge variant={skill.is_active ? "success" : "secondary"} className="text-xs">
                    {skill.is_active ? "Active" : "Inactive"}
                  </Badge>
                  <code className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    {skill.name}
                  </code>
                </div>
                <p className="text-sm text-muted-foreground mt-1">{skill.description}</p>
              </div>
              <div className="flex items-center gap-3 ml-4">
                <Switch
                  checked={skill.is_active}
                  onCheckedChange={() => toggleSkill(skill)}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => deleteSkill(skill.id)}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        {skills.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            No skills configured. Click "Add Skill" to get started.
          </div>
        )}
      </div>
    </div>
  );
}
