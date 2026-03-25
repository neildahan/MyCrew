import { NextRequest, NextResponse } from "next/server";
import { handleWhatsAppWebhook } from "@/lib/whatsapp/webhook-handler";
import type { WhatsAppWebhookPayload } from "@/lib/whatsapp/types";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const { payload, secret } = await request.json() as {
    payload: WhatsAppWebhookPayload;
    secret: string;
  };

  // Verify secret
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await handleWhatsAppWebhook(payload);
  } catch (error) {
    console.error("Process error:", error);
  }

  return NextResponse.json({ status: "ok" });
}
