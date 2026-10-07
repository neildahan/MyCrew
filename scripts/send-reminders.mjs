/**
 * Fire due reminders. Runs from GitHub Actions every 5 minutes.
 *
 * This deliberately talks to Supabase and the WhatsApp Graph API directly
 * rather than calling /api/cron/reminders. The Vercel route is the same logic
 * behind a shared secret, and keeping that secret in sync across two dashboards
 * was the thing that kept reminders from ever firing. One scheduler, one path,
 * no second place for the secret to drift.
 *
 * Mirrors getDueTasks / markTaskReminderSent / markTaskCompleted in
 * src/lib/reminders/save.ts - change both together.
 */

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  WHATSAPP_PHONE_NUMBER_ID,
  WHATSAPP_ACCESS_TOKEN,
} = process.env;

for (const [name, value] of Object.entries({
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  WHATSAPP_PHONE_NUMBER_ID,
  WHATSAPP_ACCESS_TOKEN,
})) {
  if (!value) {
    console.error(`Missing ${name}`);
    process.exit(1);
  }
}

const AGENT_EMOJIS = { yarden: "\u{1F4CB}", dana: "\u{1F4F1}", james: "\u{1F4BC}" };

const db = (path, init = {}) =>
  fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

async function sendWhatsApp(to, text) {
  const res = await fetch(
    `https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text },
      }),
    }
  );
  if (!res.ok) throw new Error(`WhatsApp ${res.status}: ${await res.text()}`);
}


/**
 * Reminders can point at a Planner task. The board is the truth, so a task
 * closed there must not still be reminded about - a reminder for something
 * already done is how people learn to ignore reminders.
 *
 * Best effort: if Graph cannot be reached the reminder is still sent, since
 * a missed reminder is worse than a redundant one.
 */
let graphToken = null;
async function microsoftToken() {
  if (graphToken !== null) return graphToken;
  graphToken = false;
  try {
    const r = await db("integrations?provider=eq.microsoft&is_active=eq.true&select=access_token,refresh_token,token_expires_at");
    const [row] = await r.json();
    if (!row) return graphToken;

    if (new Date(row.token_expires_at).getTime() - Date.now() > 5 * 60_000) {
      graphToken = row.access_token;
      return graphToken;
    }

    const cfg = await (await db("settings?key=in.(microsoft_client_id,microsoft_client_secret,microsoft_tenant)&select=key,value")).json();
    const m = Object.fromEntries(cfg.map((c) => [c.key, c.value]));
    const t = await (await fetch(`https://login.microsoftonline.com/${m.microsoft_tenant ?? "common"}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: m.microsoft_client_id,
        client_secret: m.microsoft_client_secret,
        refresh_token: row.refresh_token,
        grant_type: "refresh_token",
      }),
    })).json();
    graphToken = t.access_token ?? false;
  } catch (error) {
    console.warn(`Could not get a Graph token: ${error.message}`);
  }
  return graphToken;
}

/** "done" | "open" | "unknown" for a Planner task. */
async function plannerStatus(taskId) {
  const token = await microsoftToken();
  if (!token) return "unknown";
  try {
    const r = await fetch(`https://graph.microsoft.com/v1.0/planner/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (r.status === 404) return "done"; // deleted from the board
    if (!r.ok) return "unknown";
    const t = await r.json();
    return (t.percentComplete ?? 0) >= 100 ? "done" : "open";
  } catch {
    return "unknown";
  }
}

const now = new Date().toISOString();
const query =
  `tasks?select=id,title,agent_slug,whatsapp_user_id,task_type,metadata` +
  `&is_reminder_sent=eq.false&remind_at=not.is.null&remind_at=lte.${now}` +
  `&status=in.(pending,in_progress)&order=remind_at.asc`;

const res = await db(query);
if (!res.ok) {
  console.error(`Supabase query failed: ${res.status} ${await res.text()}`);
  process.exit(1);
}

const tasks = await res.json();
if (tasks.length === 0) {
  console.log("No due reminders.");
  process.exit(0);
}

let sent = 0;
let failed = 0;

for (const task of tasks) {
  try {
    const plannerId = task.metadata?.planner_task_id;
    if (plannerId && (await plannerStatus(plannerId)) === "done") {
      await db(`tasks?id=eq.${task.id}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          is_reminder_sent: true,
          status: "completed",
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      });
      console.log(`Skipped (already done on the board): ${task.title}`);
      continue;
    }

    const emoji = AGENT_EMOJIS[task.agent_slug] ?? "⏰";
    await sendWhatsApp(task.whatsapp_user_id, `${emoji} *תזכורת:* ${task.title}`);

    // Mark sent before anything else can throw, so a later failure can never
    // cause the same reminder to be delivered twice on the next tick.
    const patch = {
      is_reminder_sent: true,
      updated_at: new Date().toISOString(),
      ...(task.task_type === "reminder"
        ? { status: "completed", completed_at: new Date().toISOString() }
        : {}),
    };
    await db(`tasks?id=eq.${task.id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(patch),
    });

    console.log(`Sent: ${task.title}`);
    sent++;
  } catch (error) {
    console.error(`Failed for task ${task.id}: ${error.message}`);
    failed++;
  }
}

console.log(`Done. sent=${sent} failed=${failed}`);
// A silent failure here means someone misses a reminder, so surface it.
if (failed > 0) process.exit(1);
