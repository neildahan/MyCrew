import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET skills for an agent
export async function GET(
  request: NextRequest,
  { params }: { params: { agentId: string } }
) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("skills")
    .select("*")
    .eq("agent_id", params.agentId)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// POST create skill
export async function POST(
  request: NextRequest,
  { params }: { params: { agentId: string } }
) {
  const supabase = createAdminClient();
  const body = await request.json();
  const { data, error } = await supabase
    .from("skills")
    .insert({ ...body, agent_id: params.agentId })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data, { status: 201 });
}

// PUT update skill (pass skill id in body)
export async function PUT(request: NextRequest) {
  const supabase = createAdminClient();
  const body = await request.json();
  const { id, ...rest } = body;
  const updates = { ...rest, updated_at: new Date().toISOString() };

  const { data, error } = await supabase
    .from("skills")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}

// DELETE skill (pass skill id in body)
export async function DELETE(request: NextRequest) {
  const supabase = createAdminClient();
  const { id } = await request.json();

  const { error } = await supabase.from("skills").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
