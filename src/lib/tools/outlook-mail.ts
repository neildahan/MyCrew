import type { ToolDefinition, ToolExecutor } from "@/lib/ai/types";
import { graph } from "@/lib/integrations/planner";

/**
 * Outlook mail, read only.
 *
 * Deliberately two steps. The list returns headers and a short preview; the
 * full body needs a second, explicit call. This is a law firm's mailbox, and
 * the difference matters: "did they reply?" should not drag the entire text of
 * a privileged thread into the model's context as a side effect. When the body
 * is genuinely needed it is fetched on purpose, for one message.
 *
 * Mail.Read only - no drafting, no sending, no moving. See the connect route.
 */

const PREVIEW_CHARS = 200;

interface GraphMessage {
  id: string;
  subject?: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  toRecipients?: Array<{ emailAddress?: { address?: string } }>;
  receivedDateTime?: string;
  bodyPreview?: string;
  isRead?: boolean;
  hasAttachments?: boolean;
  body?: { content?: string; contentType?: string };
}

function presentHeader(m: GraphMessage) {
  return {
    id: m.id,
    subject: m.subject || "(no subject)",
    from: m.from?.emailAddress?.address ?? "unknown",
    from_name: m.from?.emailAddress?.name ?? undefined,
    received: m.receivedDateTime ?? undefined,
    unread: m.isRead === false,
    has_attachments: m.hasAttachments === true,
    preview: (m.bodyPreview ?? "").slice(0, PREVIEW_CHARS),
  };
}

export const outlookSearchMailDefinition: ToolDefinition = {
  name: "outlook_search_mail",
  description:
    "Search or list recent Outlook email. Use for 'did X reply?', 'יש משהו חדש במייל?', 'מה קיבלתי מ...', 'any mail about the contract?'. Returns senders, subjects and a short preview - NOT full message text. Read-only.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "Free-text search over subject, body and sender. Omit to list the most recent mail.",
      },
      from: {
        type: "string",
        description: "Only mail from this email address. Optional.",
      },
      unread_only: {
        type: "boolean",
        description: "Only unread messages. Defaults to false.",
      },
      limit: {
        type: "number",
        description: "How many messages to return, 1-25. Defaults to 10.",
      },
    },
  },
};

export const outlookReadMailDefinition: ToolDefinition = {
  name: "outlook_read_mail",
  description:
    "Read the full text of ONE email, by id. Get the id from outlook_search_mail first. Use only when the preview is genuinely not enough to answer - this returns the complete message body.",
  parameters: {
    type: "object",
    properties: {
      message_id: { type: "string", description: "The id from outlook_search_mail." },
    },
    required: ["message_id"],
  },
};

export const outlookSearchMailExecutor: ToolExecutor = async (args) => {
  const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 25);
  const select = "id,subject,from,receivedDateTime,bodyPreview,isRead,hasAttachments";

  const params = new URLSearchParams({ $select: select, $top: String(limit) });

  const query = typeof args.query === "string" ? args.query.trim() : "";
  const from = typeof args.from === "string" ? args.from.trim() : "";
  const unreadOnly = args.unread_only === true;

  if (query) {
    // $search cannot be combined with $filter or $orderby in Graph, so the
    // other narrowing is applied below instead of being pushed into the query.
    params.set("$search", `"${query.replace(/"/g, "")}"`);
  } else {
    const filters: string[] = [];
    if (from) filters.push(`from/emailAddress/address eq '${from.replace(/'/g, "''")}'`);
    if (unreadOnly) filters.push("isRead eq false");
    if (filters.length) params.set("$filter", filters.join(" and "));
    params.set("$orderby", "receivedDateTime desc");
  }

  const res = await graph<{ value: GraphMessage[] }>(`/me/messages?${params}`);
  if (!res.ok) {
    if (res.status === 403) {
      return {
        error:
          "Microsoft refused the mail request (403). The Mail.Read scope may not have been granted - reconnect Microsoft.",
      };
    }
    return { error: res.error ?? "Could not read the mailbox." };
  }

  let messages = res.data?.value ?? [];

  // Applied here when $search was used, since Graph would reject them together.
  if (query) {
    if (from) {
      messages = messages.filter(
        (m) => m.from?.emailAddress?.address?.toLowerCase() === from.toLowerCase()
      );
    }
    if (unreadOnly) messages = messages.filter((m) => m.isRead === false);
  }

  return { count: messages.length, messages: messages.map(presentHeader) };
};

export const outlookReadMailExecutor: ToolExecutor = async (args) => {
  const id = typeof args.message_id === "string" ? args.message_id.trim() : "";
  if (!id) return { error: "A message_id is required." };

  const res = await graph<GraphMessage>(
    `/${`me/messages/${encodeURIComponent(id)}`}?$select=id,subject,from,toRecipients,receivedDateTime,body,hasAttachments`
  );
  if (!res.ok) return { error: res.error ?? "Could not read that message." };

  const m = res.data;
  if (!m) return { error: "That message was not found." };

  // Graph returns HTML for most mail; tags would be noise and tokens.
  const raw = m.body?.content ?? "";
  const text =
    m.body?.contentType === "html"
      ? raw
          .replace(/<style[\s\S]*?<\/style>/gi, "")
          .replace(/<script[\s\S]*?<\/script>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/&nbsp;/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/\s+/g, " ")
          .trim()
      : raw.trim();

  return {
    id: m.id,
    subject: m.subject || "(no subject)",
    from: m.from?.emailAddress?.address ?? "unknown",
    to: (m.toRecipients ?? []).map((r) => r.emailAddress?.address).filter(Boolean),
    received: m.receivedDateTime,
    has_attachments: m.hasAttachments === true,
    body: text.slice(0, 6000),
  };
};
