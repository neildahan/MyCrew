import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET single agent
export async function GET(
  request: NextRequest,
  { params }: { params: { agentId: string } }
) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("agents")
    .select("*")
    .eq("id", params.agentId)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  return NextResponse.json(data);
}

// PUT update agent
export async function PUT(
  request: NextRequest,
  { params }: { params: { agentId: string } }
) {
  const supabase = createAdminClient();
  const body = await request.json();
  body.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("agents")
    .update(body)
    .eq("id", params.agentId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}

// DELETE agent
export async function DELETE(
  request: NextRequest,
  { params }: { params: { agentId: string } }
) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("agents")
    .delete()
    .eq("id", params.agentId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
