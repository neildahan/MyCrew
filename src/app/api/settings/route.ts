import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("settings")
    .select("*")
    .order("key");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Mask secret values
  const masked = data?.map((s) => ({
    ...s,
    value: s.is_secret ? "••••••••" : s.value,
  }));

  return NextResponse.json(masked);
}

export async function PUT(request: NextRequest) {
  const supabase = createAdminClient();
  const { key, value, is_secret } = await request.json();

  const { data, error } = await supabase
    .from("settings")
    .upsert(
      { key, value, is_secret: is_secret ?? false, updated_at: new Date().toISOString() },
      { onConflict: "key" }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}
