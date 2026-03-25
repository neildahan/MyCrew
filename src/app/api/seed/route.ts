import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { defaultAgents, defaultSkills } from "@/lib/agents/defaults";

// POST /api/seed — Seeds the database with default agents and skills
// Call this once after setting up your Supabase database
export async function POST() {
  const supabase = createAdminClient();

  const results = [];

  for (const agentData of defaultAgents) {
    // Check if agent already exists
    const { data: existing } = await supabase
      .from("agents")
      .select("id")
      .eq("slug", agentData.slug)
      .single();

    if (existing) {
      results.push({ agent: agentData.slug, status: "already exists" });
      continue;
    }

    // Create agent
    const { data: agent, error: agentError } = await supabase
      .from("agents")
      .insert(agentData)
      .select()
      .single();

    if (agentError || !agent) {
      results.push({ agent: agentData.slug, status: "error", error: agentError?.message });
      continue;
    }

    // Create skills
    const agentSkills = defaultSkills[agentData.slug] ?? [];
    for (const skillData of agentSkills) {
      const { error: skillError } = await supabase
        .from("skills")
        .insert({ ...skillData, agent_id: agent.id });

      if (skillError) {
        results.push({ agent: agentData.slug, skill: skillData.name, status: "skill error", error: skillError.message });
      }
    }

    results.push({
      agent: agentData.slug,
      status: "created",
      skills: agentSkills.length,
    });
  }

  return NextResponse.json({ results });
}
