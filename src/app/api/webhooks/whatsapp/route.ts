import { NextRequest, NextResponse } from "next/server";
import { handleWhatsAppWebhook } from "@/lib/whatsapp/webhook-handler";
import type { WhatsAppWebhookPayload } from "@/lib/whatsapp/types";

export const maxDuration = 60;

// GET — Webhook verification handshake
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

// POST — Incoming messages
export async function POST(request: NextRequest) {
  const body = await request.text();

  let payload: WhatsAppWebhookPayload;
  try {
    payload = JSON.parse(body);
  } catch (e) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Skip status-only webhooks
  const messages = payload.entry?.[0]?.changes?.[0]?.value?.messages;
  if (!messages || messages.length === 0) {
    return NextResponse.json({ status: "ok" }, { status: 200 });
  }

  // Process directly
  try {
    await handleWhatsAppWebhook(payload);
  } catch (error) {
    console.error("Webhook processing error:", error);
  }

  return NextResponse.json({ status: "ok" }, { status: 200 });
}
