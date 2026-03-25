import { getValidToken } from "@/lib/integrations/token-manager";
import type { ToolDefinition, ToolExecutor } from "@/lib/ai/types";

const GMAIL_BASE_URL = "https://gmail.googleapis.com/gmail/v1";

// --- Tool definitions ---

export const readEmailsDefinition: ToolDefinition = {
  name: "gmail_read_emails",
  description:
    "Read recent emails from Gmail. Can optionally filter by search query (same syntax as Gmail search).",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "Optional Gmail search query (e.g., 'from:someone@example.com', 'subject:invoice', 'is:unread').",
      },
      max_results: {
        type: "number",
        description: "Maximum number of emails to return. Defaults to 5.",
      },
    },
  },
};

export const sendEmailDefinition: ToolDefinition = {
  name: "gmail_send_email",
  description: "Send an email via Gmail.",
  parameters: {
    type: "object",
    properties: {
      to: {
        type: "string",
        description: "Recipient email address.",
      },
      subject: {
        type: "string",
        description: "Email subject line.",
      },
      body: {
        type: "string",
        description: "Email body text.",
      },
    },
    required: ["to", "subject", "body"],
  },
};

// --- Tool executors ---

export const readEmailsExecutor: ToolExecutor = async (args) => {
  const token = await getValidToken("google");
  if (!token) {
    return { error: "Gmail is not connected. Please connect your Google account first." };
  }

  const maxResults = (args.max_results as number) || 5;
  const query = (args.query as string) || "";

  const params = new URLSearchParams({
    maxResults: String(maxResults),
  });
  if (query) {
    params.set("q", query);
  }

  // List messages
  const listResponse = await fetch(
    `${GMAIL_BASE_URL}/users/me/messages?${params}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!listResponse.ok) {
    const err = await listResponse.text();
    return { error: `Failed to list emails: ${err}` };
  }

  const listData = await listResponse.json();
  const messageIds: string[] = (listData.messages || []).map(
    (m: { id: string }) => m.id
  );

  if (messageIds.length === 0) {
    return { total: 0, emails: [] };
  }

  // Fetch each message's metadata
  const emails = await Promise.all(
    messageIds.map(async (id) => {
      const msgResponse = await fetch(
        `${GMAIL_BASE_URL}/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!msgResponse.ok) return null;

      const msg = await msgResponse.json();
      const headers = msg.payload?.headers || [];
      const getHeader = (name: string) =>
        headers.find(
          (h: { name: string; value: string }) =>
            h.name.toLowerCase() === name.toLowerCase()
        )?.value || "";

      return {
        id: msg.id,
        from: getHeader("From"),
        to: getHeader("To"),
        subject: getHeader("Subject"),
        date: getHeader("Date"),
        snippet: msg.snippet || "",
      };
    })
  );

  return {
    total: emails.filter(Boolean).length,
    emails: emails.filter(Boolean),
  };
};

export const sendEmailExecutor: ToolExecutor = async (args) => {
  const token = await getValidToken("google");
  if (!token) {
    return { error: "Gmail is not connected. Please connect your Google account first." };
  }

  const to = args.to as string;
  const subject = args.subject as string;
  const body = args.body as string;

  // Build the raw RFC 2822 email
  const emailLines = [
    `To: ${to}`,
    `Subject: ${subject}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    body,
  ];

  const rawEmail = emailLines.join("\r\n");

  // Base64url encode the email
  const encodedEmail = Buffer.from(rawEmail)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const response = await fetch(
    `${GMAIL_BASE_URL}/users/me/messages/send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: encodedEmail }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    return { error: `Failed to send email: ${err}` };
  }

  const sent = await response.json();
  return {
    success: true,
    messageId: sent.id,
    to,
    subject,
  };
};
