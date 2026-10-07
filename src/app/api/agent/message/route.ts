import { NextRequest, NextResponse } from "next/server";
import { runAgent } from "@/lib/ai/agent-runner";
import { extractTask } from "@/lib/reminders/extract";
import { saveTask } from "@/lib/reminders/save";
import { isCrewMember, getCrewName } from "@/lib/crew";
import { getAgentApiSecret } from "@/lib/agent-api-secret";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Transport-agnostic entry point.
 *
 * The Meta webhook at /api/webhooks/whatsapp is shaped by Meta's payload and
 * sends its own replies. This one takes a plain sender + text and RETURNS the
 * reply, so any transport can drive it - currently the Baileys worker, which
 * is the only way to reach a real WhatsApp group.
 */
export async function POST(request: NextRequest) {
  const secret = await getAgentApiSecret();
  if (!secret) {
    console.error("AGENT_API_SECRET is not set; refusing to run.");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { from?: string; text?: string; isGroup?: boolean; extractOnly?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const from = (body.from ?? "").trim();
  const text = (body.text ?? "").trim();

  if (!from || !text) {
    return NextResponse.json({ error: "from and text are required" }, { status: 400 });
  }

  // Same gate as the Meta webhook. In a group this checks the individual
  // participant, not the group, so a stranger added to the group cannot use it.
  if (!(await isCrewMember(from))) {
    console.warn(`Rejected message from non-crew sender: ${from}`);
    return NextResponse.json({ reply: null, reason: "not_in_crew" });
  }

  // Capture anything task-shaped before answering. A failure here should not
  // cost the user their reply.
  try {
    const extracted = await extractTask(text, "yarden");
    if (extracted.isTask && extracted.title) {
      await saveTask(
        "yarden",
        from,
        extracted.title,
        extracted.description,
        extracted.taskType,
        extracted.priority,
        extracted.dueAt || undefined,
        extracted.remindAt || undefined
      );
      console.log(`Task captured for ${await getCrewName(from)}: ${extracted.title}`);
    }
  } catch (error) {
    console.error("Task extraction failed, continuing to the reply:", error);
  }

  // In a group the assistant listens to everything but only speaks when
  // spoken to, otherwise it talks over every conversation in the room.
  if (body.extractOnly) {
    return NextResponse.json({ reply: null, reason: "extract_only" });
  }

  try {
    const result = await runAgent("yarden", text, from);
    return NextResponse.json({
      reply: result.response,
      // Messages for people who are not in this chat. The worker holds the
      // WhatsApp connection, so it is the one that delivers them.
      outbox: result.outbox ?? [],
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Agent error:", message);
    // Deliberately vague to the user: the Meta path used to paste raw API
    // errors into the chat, which is both confusing and leaky.
    return NextResponse.json({
      reply: "סליחה, משהו השתבש אצלי. נסה שוב עוד רגע.",
      error: message,
    });
  }
}
