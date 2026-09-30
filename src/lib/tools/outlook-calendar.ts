import { getValidToken } from "@/lib/integrations/token-manager";
import type { ToolDefinition, ToolExecutor } from "@/lib/ai/types";
import { DEFAULT_TIMEZONE, startOfDayUtc } from "@/lib/time";

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";

const NOT_CONNECTED = {
  error:
    "Outlook is not connected. Connect the Microsoft account at /api/auth/connect/microsoft first.",
};

type GraphEvent = {
  id: string;
  subject?: string;
  isAllDay?: boolean;
  showAs?: string;
  start?: { dateTime?: string; timeZone?: string };
  end?: { dateTime?: string; timeZone?: string };
  location?: { displayName?: string };
  attendees?: Array<{ emailAddress?: { address?: string; name?: string } }>;
};

/**
 * Graph returns naive local date-times plus a timeZone label. With the Prefer
 * header below that label is always the crew timezone, so the strings are
 * parsed as wall-clock in that zone.
 */
async function fetchCalendarView(
  token: string,
  startUtc: Date,
  endUtc: Date,
  timeZone: string
): Promise<GraphEvent[] | { error: string }> {
  const params = new URLSearchParams({
    startDateTime: startUtc.toISOString(),
    endDateTime: endUtc.toISOString(),
    $orderby: "start/dateTime",
    $top: "50",
    $select: "id,subject,start,end,location,attendees,isAllDay,showAs",
  });

  const response = await fetch(`${GRAPH_BASE_URL}/me/calendarView?${params}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Prefer: `outlook.timezone="${timeZone}"`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    if (response.status === 403) {
      return {
        error:
          "Microsoft Graph refused the request (403). The granted scope may not cover calendar reads, or a tenant policy is blocking it.",
      };
    }
    return { error: `Failed to fetch Outlook events: ${body}` };
  }

  const data = await response.json();
  return (data.value ?? []) as GraphEvent[];
}

function presentEvent(event: GraphEvent) {
  return {
    id: event.id,
    subject: event.subject || "(No title)",
    start: event.start?.dateTime ?? null,
    end: event.end?.dateTime ?? null,
    all_day: event.isAllDay === true,
    location: event.location?.displayName || null,
    attendees: (event.attendees ?? [])
      .map((a) => a.emailAddress?.address)
      .filter(Boolean),
  };
}

// --- Definitions ---

export const outlookListEventsDefinition: ToolDefinition = {
  name: "outlook_list_events",
  description:
    "List Outlook / Microsoft 365 calendar events for a date or date range. Use for 'what's on my calendar today?', 'מה יש לי מחר?', or before scheduling anything. Read-only.",
  parameters: {
    type: "object",
    properties: {
      date: {
        type: "string",
        description: "Date to start from, YYYY-MM-DD. Defaults to today.",
      },
      days: {
        type: "number",
        description: "How many days to include from that date. Defaults to 1.",
      },
    },
  },
};

export const outlookCheckAvailabilityDefinition: ToolDefinition = {
  name: "outlook_check_availability",
  description:
    "Find free slots in the Outlook calendar on a given day, for scheduling. Returns gaps between existing events within working hours. Read-only.",
  parameters: {
    type: "object",
    properties: {
      date: {
        type: "string",
        description: "Date to check, YYYY-MM-DD. Defaults to today.",
      },
      duration_minutes: {
        type: "number",
        description: "Minimum length of a usable slot. Defaults to 30.",
      },
      work_start_hour: {
        type: "number",
        description: "Start of the working day, 0-23. Defaults to 9.",
      },
      work_end_hour: {
        type: "number",
        description: "End of the working day, 0-23. Defaults to 18.",
      },
    },
  },
};

// --- Executors ---

export const outlookListEventsExecutor: ToolExecutor = async (args) => {
  const token = await getValidToken("microsoft");
  if (!token) return NOT_CONNECTED;

  const timeZone = DEFAULT_TIMEZONE;
  const date =
    (args.date as string) ||
    new Date().toLocaleDateString("en-CA", { timeZone });
  const days = Math.max(1, (args.days as number) || 1);

  const start = startOfDayUtc(date, timeZone);
  const end = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);

  const events = await fetchCalendarView(token, start, end, timeZone);
  if ("error" in events) return events;

  return {
    date,
    days,
    timezone: timeZone,
    total: events.length,
    events: events.map(presentEvent),
  };
};

export const outlookCheckAvailabilityExecutor: ToolExecutor = async (args) => {
  const token = await getValidToken("microsoft");
  if (!token) return NOT_CONNECTED;

  const timeZone = DEFAULT_TIMEZONE;
  const date =
    (args.date as string) ||
    new Date().toLocaleDateString("en-CA", { timeZone });
  const durationMinutes = Math.max(5, (args.duration_minutes as number) || 30);
  const workStartHour = (args.work_start_hour as number) ?? 9;
  const workEndHour = (args.work_end_hour as number) ?? 18;

  const dayStart = startOfDayUtc(date, timeZone);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const events = await fetchCalendarView(token, dayStart, dayEnd, timeZone);
  if ("error" in events) return events;

  // Work in minutes-from-local-midnight, which sidesteps timezone entirely:
  // Graph already returned wall-clock times in the requested zone.
  const toMinutes = (dateTime?: string): number | null => {
    if (!dateTime) return null;
    const timePart = dateTime.split("T")[1];
    if (!timePart) return null;
    const [h, m] = timePart.split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    return h * 60 + m;
  };

  const busy = events
    // Free / tentative blocks are not real conflicts.
    .filter((e) => e.showAs !== "free" && e.showAs !== "unknown")
    .map((e) => {
      if (e.isAllDay) return { start: 0, end: 24 * 60 };
      const start = toMinutes(e.start?.dateTime);
      const end = toMinutes(e.end?.dateTime);
      return start === null || end === null ? null : { start, end };
    })
    .filter((b): b is { start: number; end: number } => b !== null)
    .sort((a, b) => a.start - b.start);

  // Merge overlaps so back-to-back meetings do not produce phantom gaps.
  const merged: Array<{ start: number; end: number }> = [];
  for (const block of busy) {
    const last = merged[merged.length - 1];
    if (last && block.start <= last.end) {
      last.end = Math.max(last.end, block.end);
    } else {
      merged.push({ ...block });
    }
  }

  const format = (mins: number) =>
    `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

  const slots: Array<{ start: string; end: string; minutes: number }> = [];
  let cursor = workStartHour * 60;
  const workEnd = workEndHour * 60;

  for (const block of merged) {
    if (block.start > cursor) {
      const gapEnd = Math.min(block.start, workEnd);
      if (gapEnd - cursor >= durationMinutes) {
        slots.push({
          start: format(cursor),
          end: format(gapEnd),
          minutes: gapEnd - cursor,
        });
      }
    }
    cursor = Math.max(cursor, block.end);
    if (cursor >= workEnd) break;
  }

  if (cursor < workEnd && workEnd - cursor >= durationMinutes) {
    slots.push({
      start: format(cursor),
      end: format(workEnd),
      minutes: workEnd - cursor,
    });
  }

  return {
    date,
    timezone: timeZone,
    duration_minutes: durationMinutes,
    working_hours: `${format(workStartHour * 60)}-${format(workEnd)}`,
    busy_blocks: merged.map((b) => ({ start: format(b.start), end: format(b.end) })),
    free_slots: slots,
  };
};
