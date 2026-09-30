import type { WhatsAppWebhookPayload, WhatsAppIncomingMessage, WhatsAppContact } from "./types";
import { sendTextMessage, sendAgentSelectionMenu } from "./client";
import { runAgent, runAgentOneShot } from "@/lib/ai/agent-runner";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractTask } from "@/lib/reminders/extract";
import { saveTask } from "@/lib/reminders/save";
import { getProvider } from "@/lib/ai/provider-registry";
import { isCrewMember } from "@/lib/crew";

const AGENT_COMMANDS: Record<string, string> = {
  "/yarden": "yarden",
  "/dana": "dana",
  "/yoav": "james",
};

const AGENT_SELECTION_MAP: Record<string, string> = {
  agent_yarden: "yarden",
  agent_dana: "dana",
  agent_james: "james",
};

const AGENT_EMOJIS: Record<string, string> = {
  yarden: "\ud83d\udccb",
  dana: "\ud83d\udcf1",
  james: "\ud83d\udcbc",
};

const AGENT_NAMES: Record<string, string> = {
  yarden: "Yarden (Secretary)",
  dana: "Dana (Marketing)",
  james: "Yoav (Business Advisor)",
};

async function getActiveAgent(whatsappUserId: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", `active_agent_${whatsappUserId}`)
    .single();

  return data?.value || null;
}

async function setActiveAgent(whatsappUserId: string, agentSlug: string) {
  const supabase = createAdminClient();
  const key = `active_agent_${whatsappUserId}`;

  const { data: existing } = await supabase
    .from("settings")
    .select("id")
    .eq("key", key)
    .single();

  if (existing) {
    await supabase.from("settings").update({ value: agentSlug }).eq("key", key);
  } else {
    await supabase.from("settings").insert({ key, value: agentSlug });
  }
}

async function isCrewMode(whatsappUserId: string): Promise<boolean> {
  const agent = await getActiveAgent(whatsappUserId);
  return agent === "crew";
}

// Get the best available provider for crew mode (prefers Anthropic, falls back to Gemini)
function getCrewProvider() {
  if (process.env.ANTHROPIC_API_KEY) {
    return getProvider("anthropic", "claude-sonnet-4-6");
  }
  return getProvider("gemini", "gemini-2.5-flash");
}

const CREW_SYSTEM_PROMPT = `You are simulating a team meeting. You MUST respond with exactly 3 sections, one per team member. Each section is 2-3 sentences.

Team members:
- YARDEN: Personal Secretary, warm & organized
- DANA: Marketing Specialist, creative & bold
- JAMES: Business Advisor, strategic & direct

You MUST use this EXACT format with these EXACT markers (no variations, no markdown, no extra text before/after):

---YARDEN---
[Yarden's response here]
---DANA---
[Dana's response here]
---JAMES---
[James's response here]

CRITICAL: Start your response with ---YARDEN--- immediately. Do not add any preamble.`;

async function runCrewMode(text: string, senderId: string) {
  const provider = getCrewProvider();

  const response = await provider.generateResponse({
    systemPrompt: CREW_SYSTEM_PROMPT,
    messages: [{ role: "user", content: text }],
    config: { temperature: 0.8, maxTokens: 512 },
  });

  const fullText = response.content || "";
  console.log("Crew mode raw response:", fullText.substring(0, 500));

  // Parse the responses by splitting on markers
  const parts = fullText.split(/---(?:YARDEN|DANA|JAMES)---/).filter(p => p.trim());
  const yardenText = parts[0]?.trim() || "";
  const danaText = parts[1]?.trim() || "";
  const jamesText = parts[2]?.trim() || "";

  const responses: Array<{ slug: string; text: string }> = [
    { slug: "yarden", text: yardenText || "I'll look into this and get back to you." },
    { slug: "dana", text: danaText || "Let me think about the marketing angle here." },
    { slug: "james", text: jamesText || "I'll analyze this from a business perspective." },
  ];

  // Send each agent's response as a separate message
  for (const r of responses) {
    const emoji = AGENT_EMOJIS[r.slug];
    const name = AGENT_NAMES[r.slug];
    await sendTextMessage(senderId, `${emoji} *${name}:*\n\n${r.text}`);
  }
}

// Try to extract and save a task as a side-effect (non-blocking to the main response)
async function tryExtractAndSaveTask(text: string, agentSlug: string, senderId: string) {
  try {
    const task = await extractTask(text, agentSlug);
    if (task.isTask && task.title) {
      await saveTask(
        agentSlug,
        senderId,
        task.title,
        task.description,
        task.taskType,
        task.priority,
        task.dueAt || undefined,
        task.remindAt || undefined
      );
      console.log(`Task saved: "${task.title}" for ${agentSlug}`);

      // If it's a reminder with a time, confirm it
      if (task.taskType === "reminder" && task.remindAt) {
        const remindDate = new Date(task.remindAt);
        const timeStr = remindDate.toLocaleString("en-IL", {
          timeZone: "Asia/Jerusalem",
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });
        await sendTextMessage(
          senderId,
          `\u2705 Task saved! I'll remind you: *${task.title}*\n\n\u23f0 ${timeStr}`
        );
        return true; // Signal that we handled it with a reminder confirmation
      }
    }
  } catch (error) {
    console.error("Task extraction error:", error);
  }
  return false;
}

// Robust extraction: tries multiple patterns to find an agent's response
function extractAgentResponse(fullText: string, agentName: string, index: number): string {
  // Pattern 1: ---NAME--- markers (primary format)
  const markerRegex = new RegExp(
    `---\\s*${agentName}\\s*---\\s*([\\s\\S]*?)(?=---\\s*(?:YARDEN|DANA|JAMES)\\s*---|$)`,
    "i"
  );
  const markerMatch = fullText.match(markerRegex);
  if (markerMatch && markerMatch[1].trim()) {
    return markerMatch[1].trim();
  }

  // Pattern 2: **NAME** or NAME: style headers
  const headerRegex = new RegExp(
    `(?:\\*\\*${agentName}\\*\\*|${agentName}\\s*:)\\s*([\\s\\S]*?)(?=(?:\\*\\*(?:YARDEN|DANA|JAMES)\\*\\*|(?:YARDEN|DANA|JAMES)\\s*:)|$)`,
    "i"
  );
  const headerMatch = fullText.match(headerRegex);
  if (headerMatch && headerMatch[1].trim()) {
    return headerMatch[1].trim();
  }

  // Pattern 3: Numbered list (1. YARDEN, 2. DANA, 3. JAMES)
  const numberedRegex = new RegExp(
    `${index + 1}\\.\\s*${agentName}[^\\n]*\\n\\s*([\\s\\S]*?)(?=\\d+\\.\\s*(?:YARDEN|DANA|JAMES)|$)`,
    "i"
  );
  const numberedMatch = fullText.match(numberedRegex);
  if (numberedMatch && numberedMatch[1].trim()) {
    return numberedMatch[1].trim();
  }

  // Fallback: split by any recognizable separator and take by index
  const fallbackParts = fullText
    .split(/---\s*\w+\s*---|(?:\*\*\w+\*\*|\b(?:YARDEN|DANA|JAMES)\b\s*:)/i)
    .filter((p) => p.trim());
  if (fallbackParts[index]) {
    return fallbackParts[index].trim();
  }

  return "";
}

export async function handleWhatsAppWebhook(payload: WhatsAppWebhookPayload) {
  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      if (change.field !== "messages") continue;

      const messages = change.value.messages;
      const contacts = change.value.contacts;
      if (!messages || messages.length === 0) {
        console.log("Webhook received but no messages (likely a status update)");
        continue;
      }

      for (const message of messages) {
        const contact = contacts?.find((c) => c.wa_id === message.from);
        await processMessage(message, contact);
      }
    }
  }
}

async function processMessage(
  message: WhatsAppIncomingMessage,
  contact?: WhatsAppContact
) {

  const senderId = message.from;

  // Allowlist gate. Anyone not in the crew is dropped without a reply: a reply
  // would confirm to a stranger that this number runs a bot, and every message
  // past this point spends the Anthropic key.
  if (!isCrewMember(senderId)) {
    console.warn(`Rejected message from non-crew sender: ${senderId}`);
    return;
  }

  // Extract message text
  let text = "";
  if (message.type === "text" && message.text) {
    text = message.text.body.trim();
  } else if (message.type === "interactive" && message.interactive) {
    const reply = message.interactive.button_reply || message.interactive.list_reply;
    if (reply) {
      const agentSlug = AGENT_SELECTION_MAP[reply.id];
      if (agentSlug) {
        await setActiveAgent(senderId, agentSlug);
        await sendTextMessage(senderId, `Switched to *${AGENT_NAMES[agentSlug]}*! How can I help you?`);
        return;
      }
      text = reply.title;
    }
  }

  if (!text) return;

  const lowerText = text.toLowerCase();

  // Check for crew mode command
  if (lowerText === "/crew" || lowerText === "/all" || lowerText === "/team") {
    await setActiveAgent(senderId, "crew");
    await sendTextMessage(
      senderId,
      "\ud83e\udd1d *Crew mode activated!*\n\nAll three agents will respond to your messages.\n\n\ud83d\udccb Yarden \u00b7 \ud83d\udcf1 Dana \u00b7 \ud83d\udcbc Yoav\n\nType /yarden, /dana, or /yoav to switch back to a single agent."
    );
    return;
  }

  // Check for agent switch commands
  const commandAgent = AGENT_COMMANDS[lowerText];
  if (commandAgent) {
    await setActiveAgent(senderId, commandAgent);
    await sendTextMessage(senderId, `Switched to *${AGENT_NAMES[commandAgent]}*! How can I help you?`);
    return;
  }

  // Check for menu command
  if (lowerText === "/menu" || lowerText === "/help") {
    await sendAgentSelectionMenu(senderId);
    return;
  }

  // Check if in crew mode
  if (await isCrewMode(senderId)) {
    try {
      const provider = getCrewProvider();

      const response = await provider.generateResponse({
        systemPrompt: CREW_SYSTEM_PROMPT,
        messages: [{ role: "user", content: text }],
        config: { temperature: 0.8, maxTokens: 512 },
      });

      const fullText = response.content || "";
      console.log("Crew raw response:", fullText.substring(0, 800));

      // Robust parsing: try marker-based split first, then fallback patterns
      const yardenText = extractAgentResponse(fullText, "YARDEN", 0);
      const danaText = extractAgentResponse(fullText, "DANA", 1);
      const jamesText = extractAgentResponse(fullText, "JAMES", 2);

      const parts = [yardenText, danaText, jamesText];

      // Save crew conversation and send messages
      const supabaseForCrew = createAdminClient();

      // Get or create a crew conversation
      let { data: crewConv } = await supabaseForCrew
        .from("conversations")
        .select("id, agent_id")
        .eq("whatsapp_user_id", senderId)
        .eq("is_active", true)
        .order("last_message_at", { ascending: false })
        .limit(1)
        .single();

      if (!crewConv) {
        // Get yarden's agent_id as default for crew conversations
        const { data: yardenAgent } = await supabaseForCrew
          .from("agents").select("id").eq("slug", "yarden").single();
        if (yardenAgent) {
          const { data: newConv } = await supabaseForCrew
            .from("conversations")
            .insert({ agent_id: yardenAgent.id, whatsapp_user_id: senderId })
            .select("id, agent_id").single();
          crewConv = newConv;
        }
      }

      // Save user message
      if (crewConv) {
        await supabaseForCrew.from("messages").insert({
          conversation_id: crewConv.id,
          role: "user",
          content: text,
          message_type: "text",
        });
      }

      const agents = ["yarden", "dana", "james"];
      const allResponses: string[] = [];
      for (let i = 0; i < agents.length; i++) {
        const slug = agents[i];
        const emoji = AGENT_EMOJIS[slug];
        const name = AGENT_NAMES[slug];
        const agentText = parts[i]?.trim() || "Let me think about this.";
        allResponses.push(`${emoji} ${name}: ${agentText}`);
        await sendTextMessage(senderId, `${emoji} *${name}:*\n\n${agentText}`);
      }

      // Save crew response as one combined message
      if (crewConv) {
        await supabaseForCrew.from("messages").insert({
          conversation_id: crewConv.id,
          role: "assistant",
          content: allResponses.join("\n\n"),
          message_type: "text",
        });
        await supabaseForCrew.from("conversations")
          .update({ last_message_at: new Date().toISOString() })
          .eq("id", crewConv.id);
      }
    } catch (error: any) {
      const errMsg = error?.message || error?.toString() || "Unknown error";
      console.error("Crew error:", errMsg, error?.stack);
      await sendTextMessage(senderId, `Sorry, the crew encountered an error: ${errMsg.substring(0, 100)}`);
    }
    return;
  }

  // Get active agent or show selection menu
  const activeAgent = await getActiveAgent(senderId);
  if (!activeAgent) {
    await sendAgentSelectionMenu(senderId);
    return;
  }

  // First: extract and save task (if it's a reminder, confirm and return)
  try {
    console.log(`Extracting task for "${activeAgent}", user ${senderId}: "${text}"`);
    const wasReminder = await tryExtractAndSaveTask(text, activeAgent, senderId);
    if (wasReminder) {
      return; // Reminder confirmed, done
    }
  } catch (error: any) {
    console.error("Task extraction failed:", error?.message || error);
    // Continue to agent response even if extraction fails
  }

  // Then: run agent and respond
  try {
    console.log(`Running agent "${activeAgent}" for user ${senderId}`);
    const result = await runAgent(activeAgent, text, senderId);
    await sendTextMessage(senderId, result.response);
  } catch (error: any) {
    const errMsg = error?.message || error?.toString() || "Unknown error";
    const errStack = error?.stack || "";
    console.error("Agent error:", errMsg);
    console.error("Agent error stack:", errStack);
    await sendTextMessage(
      senderId,
      `Error: ${errMsg.substring(0, 200)}`
    );
  }
}
