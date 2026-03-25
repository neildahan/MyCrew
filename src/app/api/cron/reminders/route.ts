import { NextRequest, NextResponse } from "next/server";
import { getDueTasks, markTaskReminderSent } from "@/lib/reminders/save";
import { sendTextMessage } from "@/lib/whatsapp/client";

export const dynamic = "force-dynamic";

const AGENT_EMOJIS: Record<string, string> = {
  yarden: "\ud83d\udccb",
  dana: "\ud83d\udcf1",
  james: "\ud83d\udcbc",
};

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  const secret = request.nextUrl.searchParams.get("secret");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && secret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const tasks = await getDueTasks();

    if (tasks.length === 0) {
      return NextResponse.json({ message: "No due tasks", count: 0 });
    }

    let sent = 0;
    for (const task of tasks) {
      try {
        const emoji = AGENT_EMOJIS[task.agent_slug] || "\u23f0";
        await sendTextMessage(
          task.whatsapp_user_id,
          `${emoji} *Reminder:* ${task.title}`
        );
        await markTaskReminderSent(task.id);
        // Auto-complete reminder tasks
        if (task.task_type === "reminder") {
          const { markTaskCompleted } = await import("@/lib/reminders/save");
          await markTaskCompleted(task.id);
        }
        sent++;
      } catch (error) {
        console.error(`Failed to send task reminder ${task.id}:`, error);
      }
    }

    return NextResponse.json({ message: `Sent ${sent} reminders`, count: sent });
  } catch (error) {
    console.error("Cron reminders error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
