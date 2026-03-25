import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  request: NextRequest,
  { params }: { params: { taskId: string } }
) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", params.taskId)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { taskId: string } }
) {
  const supabase = createAdminClient();
  const body = await request.json();

  // Auto-set completed_at when marking as completed
  if (body.status === "completed" && !body.completed_at) {
    body.completed_at = new Date().toISOString();
  }
  body.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("tasks")
    .update(body)
    .eq("id", params.taskId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { taskId: string } }
) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("tasks")
    .delete()
    .eq("id", params.taskId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
