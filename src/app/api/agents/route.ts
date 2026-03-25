import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET all agents
export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("agents")
    .select("*, skills(count)")
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// POST create agent
export async function POST(request: NextRequest) {
  const supabase = createAdminClient();
  const body = await request.json();

  const { data, error } = await supabase
    .from("agents")
    .insert(body)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data, { status: 201 });
}
