import { NextRequest, NextResponse } from "next/server";
import { plannerListExecutor } from "@/lib/tools/planner";
import { sendTextMessage } from "@/lib/whatsapp/client";
import { getCrewNumbers } from "@/lib/crew";
import { DEFAULT_TIMEZONE, dayOfWeekIn } from "@/lib/time";
import { getSpendReport, formatUsd } from "@/lib/ai/budget";

export const dynamic = "force-dynamic";

const TIMEZONE = DEFAULT_TIMEZONE;

// Israeli work week is Sunday-Thursday. Friday and Saturday are the weekend,
// and a digest that fires then is the kind of thing that gets the bot muted.
const WORK_DAYS = [0, 1, 2, 3, 4];

// The cron fires once a day at 05:00 UTC, which is 08:00 in Israel during
// summer time and 07:00 in winter. An exact-hour guard here would skip the
// digest entirely for half the year, so the hour is left to the schedule.

interface PlannerRow {
  id: string;
  title: string;
  due?: string;
  overdue?: boolean;
  assigned_to: string[];
}

/**
 * The digest reads Planner, not the local table.
 *
 * It used to query tasks the assistant wrote herself. Once Planner became the
 * board she stopped writing there, so the morning message would have reported
 * "nothing open" every day while real work sat overdue on the board.
 */
async function buildDigest(whatsappUserId: string): Promise<string> {
  const mine = (await plannerListExecutor(
    { who: "me", status: "open" },
    { whatsappUserId }
  )) as { tasks?: PlannerRow[]; error?: string };

  const theirs = (await plannerListExecutor(
    { who: "other", status: "open" },
    { whatsappUserId }
  )) as { tasks?: PlannerRow[] };

  if (mine.error) {
    console.error("Digest could not read Planner:", mine.error);
    return "";
  }

  const myTasks = mine.tasks ?? [];
  const overdue = myTasks.filter((t) => t.overdue);
  const rest = myTasks.filter((t) => !t.overdue);
  const otherTasks = theirs.tasks ?? [];

  if (myTasks.length === 0 && otherTasks.length === 0) {
    return "☀️ *בוקר טוב*\n\nאין משימות פתוחות. נקי.";
  }

  const lines = ["☀️ *בוקר טוב*"];
  const day = (t: PlannerRow) => (t.due ? `${t.due.slice(8, 10)}/${t.due.slice(5, 7)} — ` : "");

  if (overdue.length > 0) {
    lines.push("", `⚠️ *בפיגור* (${overdue.length})`);
    for (const t of overdue) lines.push(`• ${day(t)}${t.title}`);
  }

  if (rest.length > 0) {
    lines.push("", `📋 *על הראש* (${rest.length})`);
    for (const t of rest) lines.push(`• ${day(t)}${t.title}`);
  }

  // The other person's open items, so "מה ענבל צריכה?" is answered before it
  // is asked. Titles only - this is a nudge, not their whole board.
  if (otherTasks.length > 0) {
    const name = otherTasks[0]?.assigned_to?.[0] ?? "אצלה";
    lines.push("", `👤 *${name}* (${otherTasks.length})`);
    for (const t of otherTasks.slice(0, 5)) lines.push(`• ${day(t)}${t.title}`);
  }

  return lines.join("\n");
}

async function buildCostFooter(): Promise<string> {
  try {
    const r = await getSpendReport(7);
    const parts = [
      "",
      "—",
      `💰 אתמול: ${formatUsd(r.yesterday.cost)} · החודש: ${formatUsd(r.monthToDate)}/${formatUsd(r.budget)}`,
    ];
    if (r.projectedMonth > r.budget && r.dailyAverage > 0) {
      parts.push(`⚠️ בקצב הזה החודש ייגמר ב-${formatUsd(r.projectedMonth)}`);
    }
    return parts.join("\n");
  } catch (error) {
    // The digest is the point; the cost line is a nice-to-have.
    console.error("Could not build the cost footer:", error);
    return "";
  }
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const secret = request.nextUrl.searchParams.get("secret");
  const cronSecret = process.env.CRON_SECRET;

  // Fail closed. An unset CRON_SECRET previously made this endpoint public,
  // which on a deployed app means anyone can trigger outbound WhatsApp sends.
  if (!cronSecret) {
    console.error("CRON_SECRET is not set; refusing to run.");
    return NextResponse.json(
      { error: "Cron is not configured" },
      { status: 503 }
    );
  }

  if (authHeader !== `Bearer ${cronSecret}` && secret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ?dry=1 renders the digest without sending, so it can be checked safely.
  const dryRun = request.nextUrl.searchParams.get("dry") === "1";
  const now = new Date();

  if (!dryRun) {
    if (!WORK_DAYS.includes(dayOfWeekIn(now, TIMEZONE))) {
      return NextResponse.json({ message: "Weekend in Israel, digest skipped", count: 0 });
    }
  }

  const crew = await getCrewNumbers();
  if (crew.length === 0) {
    return NextResponse.json(
      { error: "CREW_WHATSAPP_NUMBERS is not set" },
      { status: 500 }
    );
  }

  const costFooter = await buildCostFooter();
  const results: Array<{ to: string; tasks: number; digest?: string; error?: string }> = [];

  for (const number of crew) {
    try {
      const body = await buildDigest(number);
      if (!body) {
        results.push({ to: number, tasks: 0, error: "Could not read the board" });
        continue;
      }
      const digest = body + costFooter;

      if (dryRun) {
        results.push({ to: number, tasks: body.split("\n• ").length - 1, digest });
        continue;
      }

      await sendTextMessage(number, digest);
      results.push({ to: number, tasks: body.split("\n• ").length - 1 });
    } catch (error) {
      console.error(`Failed to send digest to ${number}:`, error);
      results.push({
        to: number,
        tasks: 0,
        error: error instanceof Error ? error.message : "unknown error",
      });
    }
  }

  return NextResponse.json({
    message: dryRun ? "Dry run, nothing sent" : `Digest sent to ${results.length}`,
    dryRun,
    results,
  });
}
