import type {
  WhatsAppTextMessage,
  WhatsAppInteractiveMessage,
} from "./types";

const WHATSAPP_API_URL = "https://graph.facebook.com/v21.0";

function getConfig() {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !accessToken) {
    throw new Error("WhatsApp configuration is missing. Set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN.");
  }
  return { phoneNumberId, accessToken };
}

async function sendMessage(message: WhatsAppTextMessage | WhatsAppInteractiveMessage) {
  const { phoneNumberId, accessToken } = getConfig();

  const response = await fetch(
    `${WHATSAPP_API_URL}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`WhatsApp API error: ${response.status} - ${error}`);
  }

  return response.json();
}

export async function sendTextMessage(to: string, text: string) {
  // WhatsApp has a 4096 character limit per message
  const MAX_LENGTH = 4000;
  if (text.length <= MAX_LENGTH) {
    return sendMessage({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    });
  }

  // Split long messages
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= MAX_LENGTH) {
      chunks.push(remaining);
      break;
    }
    // Try to split at a newline or space
    let splitAt = remaining.lastIndexOf("\n", MAX_LENGTH);
    if (splitAt < MAX_LENGTH * 0.5) {
      splitAt = remaining.lastIndexOf(" ", MAX_LENGTH);
    }
    if (splitAt < MAX_LENGTH * 0.5) {
      splitAt = MAX_LENGTH;
    }
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }

  for (const chunk of chunks) {
    await sendMessage({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: chunk },
    });
  }
}

export async function sendAgentSelectionMenu(to: string) {
  return sendMessage({
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      body: {
        text: "Welcome to MyCrew! Choose which team member you'd like to talk to:",
      },
      footer: { text: "You can switch anytime with /yarden, /dana, or /yoav" },
      action: {
        button: "Choose Agent",
        sections: [
          {
            title: "Your Crew",
            rows: [
              {
                id: "agent_yarden",
                title: "Yarden",
                description: "Personal Secretary - meetings, reminders, reservations",
              },
              {
                id: "agent_dana",
                title: "Dana",
                description: "Marketing Specialist - social media, ads, content",
              },
              {
                id: "agent_james",
                title: "Yoav",
                description: "Business Advisor - strategy, planning, analysis",
              },
            ],
          },
        ],
      },
    },
  });
}

export async function sendButtonMessage(
  to: string,
  body: string,
  buttons: Array<{ id: string; title: string }>
) {
  return sendMessage({
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: body },
      action: {
        buttons: buttons.map((b) => ({
          type: "reply" as const,
          reply: { id: b.id, title: b.title },
        })),
      },
    },
  });
}
