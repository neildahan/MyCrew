import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTextMessage } from "@/lib/whatsapp/client";
import { runAgent } from "@/lib/ai/agent-runner";

export async function POST(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Get due tasks
  const { data: tasks, error } = await supabase
    .from("scheduled_tasks")
    .select("*, agents(slug, name)")
    .eq("is_active", true)
    .lte("next_run_at", new Date().toISOString());

  if (error || !tasks) {
    return NextResponse.json({ error: error?.message ?? "No tasks" }, { status: 500 });
  }

  const results = [];

  for (const task of tasks) {
    try {
      const agentSlug = (task as any).agents?.slug;
      if (!agentSlug) continue;

      let message = "";

      switch (task.task_type) {
        case "reminder": {
          const payload = task.payload as { reminder_text?: string };
          message = payload.reminder_text ?? "You have a reminder!";
          // Optionally run through AI to phrase it naturally
          const result = await runAgent(
            agentSlug,
            `Send this reminder to the user in a friendly way: "${message}"`,
            task.target_whatsapp_id
          );
          message = result.response;
          break;
        }
        case "morning_briefing": {
          const result = await runAgent(
            agentSlug,
            "Generate a morning briefing for the user. Summarize any pending tasks, reminders, and upcoming events for today. Be concise and organized.",
            task.target_whatsapp_id
          );
          message = result.response;
          break;
        }
        case "weekly_summary": {
          const result = await runAgent(
            agentSlug,
            "Generate a weekly marketing summary. Highlight key activities, content performance, and suggest priorities for next week.",
            task.target_whatsapp_id
          );
          message = result.response;
          break;
        }
        default:
          message = `Task: ${task.task_type}`;
      }

      await sendTextMessage(task.target_whatsapp_id, message);

      // Update task
      if (task.cron_expression) {
        // Recurring: compute next run time
        const { CronExpressionParser } = await import("cron-parser");
        const interval = CronExpressionParser.parse(task.cron_expression);
        const nextRun = interval.next().toISOString();

        await supabase
          .from("scheduled_tasks")
          .update({
            last_run_at: new Date().toISOString(),
            next_run_at: nextRun,
          })
          .eq("id", task.id);
      } else {
        // One-shot: deactivate
        await supabase
          .from("scheduled_tasks")
          .update({
            is_active: false,
            last_run_at: new Date().toISOString(),
          })
          .eq("id", task.id);
      }

      results.push({ taskId: task.id, status: "success" });
    } catch (err) {
      console.error(`Task ${task.id} failed:`, err);
      results.push({ taskId: task.id, status: "error", error: String(err) });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}
