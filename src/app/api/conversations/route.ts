import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = createAdminClient();
  const agentId = request.nextUrl.searchParams.get("agentId");

  let query = supabase
    .from("conversations")
    .select("*, agents(name, slug)")
    .order("last_message_at", { ascending: false })
    .limit(50);

  if (agentId) {
    query = query.eq("agent_id", agentId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
