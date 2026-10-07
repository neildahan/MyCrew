import type { ToolDefinition } from "@/lib/ai/types";
import type { ToolContext } from "./tasks";
import { isCrewMember } from "@/lib/crew";

/**
 * Sending a WhatsApp message to someone who is not in this conversation.
 *
 * The number must appear in something the user themselves typed. That is the
 * whole safeguard, and it is enforced here rather than asked for in the
 * prompt, because Yarden reads Neil's mail and his task board: a number in a
 * message she was asked to summarise, or in a task someone else wrote, must
 * never become a number she can write to. A prompt instruction can be argued
 * around by the text it is reading; this cannot.
 *
 * The number also has to survive a daily cap. A fresh number on a linked-device
 * client messaging strangers is the pattern WhatsApp bans for, and the account
 * took most of a day to pair.
 */

const DAILY_CAP = 10;

/** Digits only, so "+1 (754) 357-9023" and "17543579023" compare equal. */
const digits = (s: string) => s.replace(/[^0-9]/g, "");

/**
 * The ways a person plausibly wrote the number they meant.
 *
 * Nobody types "972501112233" in a message - they type "050-111-2233". A
 * literal string match on the international form refused every Israeli number
 * the user gave, which would have made the whole feature look broken while
 * appearing to be a security rule.
 *
 * The national form is required to be at least seven digits so a short run of
 * digits in unrelated text cannot stand in for a phone number.
 */
const COUNTRY_CODES = ["972", "1"];

function writtenAs(to: string): string[] {
  const forms = new Set([to]);
  for (const cc of COUNTRY_CODES) {
    if (!to.startsWith(cc)) continue;
    const national = to.slice(cc.length);
    if (national.length >= 7) {
      forms.add(national);
      forms.add(`0${national}`);
    }
  }
  return [...forms];
}

const sentToday = new Map<string, number[]>();

function underCap(userId: string): boolean {
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const recent = (sentToday.get(userId) ?? []).filter((t) => t > dayAgo);
  sentToday.set(userId, recent);
  return recent.length < DAILY_CAP;
}

function record(userId: string) {
  sentToday.set(userId, [...(sentToday.get(userId) ?? []), Date.now()]);
}

export const whatsappSendDefinition: ToolDefinition = {
  name: "whatsapp_send_message",
  description:
    "Send a WhatsApp message to someone else, on the user's behalf. ONLY use after showing the user the exact text and the number and getting a clear yes - never on the first request. The number must be one the user typed themselves; a number you read in an email, a task or a calendar invite will be refused.",
  parameters: {
    type: "object",
    properties: {
      to: {
        type: "string",
        description:
          "Recipient's number in international form, digits only, e.g. 972501234567. Must be a number the user typed.",
      },
      text: {
        type: "string",
        description: "Exactly the message text the user approved.",
      },
    },
    required: ["to", "text"],
  },
};

export async function whatsappSendExecutor(
  args: Record<string, unknown>,
  context?: ToolContext
) {
  const to = digits(typeof args.to === "string" ? args.to : "");
  const text = typeof args.text === "string" ? args.text.trim() : "";

  if (!to || to.length < 8) return { error: "A valid international number is required." };
  if (!text) return { error: "There is no message text to send." };

  const me = context?.whatsappUserId;
  if (!me) return { error: "Sending requires a known caller." };
  if (!(await isCrewMember(me))) return { error: "Only the crew can send messages." };

  // The number must have been typed by this person, in this conversation.
  const forms = writtenAs(to);
  const typed = (context?.userMessages ?? []).some((m) => {
    const d = digits(m);
    return forms.some((f) => d.includes(f));
  });
  if (!typed) {
    return {
      error:
        "I can only message a number you have given me yourself. Send me the number and I'll write to them.",
    };
  }

  if (to === me) {
    return { error: "That is your own number - just say it here instead." };
  }

  if (!underCap(me)) {
    return {
      error: `That is more than ${DAILY_CAP} messages today. Stopping here so the number does not get blocked.`,
    };
  }

  if (!context?.outbox) {
    return { error: "Sending is not available on this channel." };
  }

  context.outbox.push({ to, text });
  record(me);

  console.log(`Outbound WhatsApp queued for ${to} (${text.length} chars)`);
  return { sent: true, to, text };
}
