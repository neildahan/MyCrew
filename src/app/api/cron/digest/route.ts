import { NextRequest, NextResponse } from "next/server";
import { getDigestTasks } from "@/lib/reminders/save";
import { sendTextMessage } from "@/lib/whatsapp/client";
import { getCrewNumbers } from "@/lib/crew";
import { DEFAULT_TIMEZONE, dayOfWeekIn, hourIn, endOfDayUtc } from "@/lib/time";

export const dynamic = "force-dynamic";

const TIMEZONE = DEFAULT_TIMEZONE;

// Israeli work week is Sunday-Thursday. Friday and Saturday are the weekend,
// and a digest that fires then is the kind of thing that gets the bot muted.
const WORK_DAYS = [0, 1, 2, 3, 4];

// Local hour the digest should land at. Vercel cron runs in UTC, and Israel
// shifts between UTC+2 and UTC+3, so the cron fires at both candidate hours
// and this guard picks the right one. No DST drift twice a year.
const DIGEST_HOUR = Number(process.env.DIGEST_HOUR ?? 8);

function formatTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("he-IL", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
  });
}

type DigestTask = {
  title: string;
  due_at: string | null;
  priority: string;
  requested_by: string | null;
};

function buildDigest(tasks: DigestTask[], now: Date): string {
  if (tasks.length === 0) {
    return "☀️ *בוקר טוב*\n\nאין משימות פתוחות להיום. נקי.";
  }

  const nowMs = now.getTime();
  const overdue = tasks.filter((t) => t.due_at && new Date(t.due_at).getTime() < nowMs);
  const today = tasks.filter((t) => !overdue.includes(t));

  const lines = ["☀️ *בוקר טוב*"];

  if (overdue.length > 0) {
    lines.push("", `⚠️ *בפיגור* (${overdue.length})`);
    for (const t of overdue) {
      const who = t.requested_by ? ` — ביקש: ${t.requested_by}` : "";
      lines.push(`• ${t.title}${who}`);
    }
  }

  if (today.length > 0) {
    lines.push("", `📅 *להיום* (${today.length})`);
    for (const t of today) {
      const time = formatTime(t.due_at);
      const when = time ? `${time} — ` : "";
      const who = t.requested_by ? ` — ביקש: ${t.requested_by}` : "";
      lines.push(`• ${when}${t.title}${who}`);
    }
  }

  return lines.join("\n");
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
    // The cron fires at both DST candidate hours; only one is the real one.
    if (hourIn(now, TIMEZONE) !== DIGEST_HOUR) {
      return NextResponse.json({
        message: `Not the digest hour in ${TIMEZONE} (local ${hourIn(now, TIMEZONE)}:00, want ${DIGEST_HOUR}:00)`,
        count: 0,
      });
    }
  }

  const crew = getCrewNumbers();
  if (crew.length === 0) {
    return NextResponse.json(
      { error: "CREW_WHATSAPP_NUMBERS is not set" },
      { status: 500 }
    );
  }

  const cutoff = endOfDayUtc(now, TIMEZONE).toISOString();
  const results: Array<{ to: string; tasks: number; digest?: string; error?: string }> = [];

  for (const number of crew) {
    try {
      const tasks = (await getDigestTasks(number, cutoff)) as DigestTask[];
      const digest = buildDigest(tasks, now);

      if (dryRun) {
        results.push({ to: number, tasks: tasks.length, digest });
        continue;
      }

      await sendTextMessage(number, digest);
      results.push({ to: number, tasks: tasks.length });
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
