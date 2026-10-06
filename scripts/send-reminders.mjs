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

const now = new Date().toISOString();
const query =
  `tasks?select=id,title,agent_slug,whatsapp_user_id,task_type` +
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
