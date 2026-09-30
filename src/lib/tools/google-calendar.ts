import { getValidToken } from "@/lib/integrations/token-manager";
import type { ToolDefinition, ToolExecutor } from "@/lib/ai/types";

const CALENDAR_BASE_URL = "https://www.googleapis.com/calendar/v3";

// --- Tool definitions ---

export const listEventsDefinition: ToolDefinition = {
  name: "google_calendar_list_events",
  description:
    "List calendar events for a given date or date range. Returns event summaries, times, and attendees.",
  parameters: {
    type: "object",
    properties: {
      date: {
        type: "string",
        description:
          "The date to list events for in YYYY-MM-DD format. Defaults to today.",
      },
      days: {
        type: "number",
        description:
          "Number of days to include starting from the date. Defaults to 1.",
      },
    },
  },
};

export const createEventDefinition: ToolDefinition = {
  name: "google_calendar_create_event",
  description:
    "Create a new calendar event. Returns the created event details.",
  parameters: {
    type: "object",
    properties: {
      summary: {
        type: "string",
        description: "The title/summary of the event.",
      },
      start_time: {
        type: "string",
        description:
          "Start time in ISO 8601 format (e.g., 2025-01-15T09:00:00+02:00).",
      },
      end_time: {
        type: "string",
        description:
          "End time in ISO 8601 format (e.g., 2025-01-15T10:00:00+02:00).",
      },
      description: {
        type: "string",
        description: "Optional description for the event.",
      },
      attendees: {
        type: "array",
        items: { type: "string" },
        description: "Optional array of attendee email addresses.",
      },
    },
    required: ["summary", "start_time", "end_time"],
  },
};

export const checkAvailabilityDefinition: ToolDefinition = {
  name: "google_calendar_check_availability",
  description:
    "Check free/busy availability for a specific date and time range.",
  parameters: {
    type: "object",
    properties: {
      date: {
        type: "string",
        description: "The date to check in YYYY-MM-DD format.",
      },
      start_time: {
        type: "string",
        description: "Start time in HH:MM format (24h).",
      },
      end_time: {
        type: "string",
        description: "End time in HH:MM format (24h).",
      },
    },
    required: ["date", "start_time", "end_time"],
  },
};

// --- Tool executors ---

export const listEventsExecutor: ToolExecutor = async (args) => {
  const token = await getValidToken("google");
  if (!token) {
    return { error: "Google Calendar is not connected. Please connect your Google account first." };
  }

  const date = (args.date as string) || new Date().toISOString().split("T")[0];
  const days = (args.days as number) || 1;

  const timeMin = new Date(`${date}T00:00:00`).toISOString();
  const timeMax = new Date(
    new Date(`${date}T00:00:00`).getTime() + days * 24 * 60 * 60 * 1000
  ).toISOString();

  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "20",
  });

  const response = await fetch(
    `${CALENDAR_BASE_URL}/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!response.ok) {
    const err = await response.text();
    return { error: `Failed to fetch events: ${err}` };
  }

  const data = await response.json();
  const events = (data.items || []).map((event: Record<string, unknown>) => ({
    id: event.id,
    summary: event.summary || "(No title)",
    start: (event.start as Record<string, unknown>)?.dateTime || (event.start as Record<string, unknown>)?.date,
    end: (event.end as Record<string, unknown>)?.dateTime || (event.end as Record<string, unknown>)?.date,
    location: event.location || null,
    attendees: ((event.attendees as Array<Record<string, unknown>>) || []).map(
      (a) => a.email
    ),
  }));

  return {
    date,
    days,
    total: events.length,
    events,
  };
};

export const createEventExecutor: ToolExecutor = async (args) => {
  const token = await getValidToken("google");
  if (!token) {
    return { error: "Google Calendar is not connected. Please connect your Google account first." };
  }

  // Normalize datetime — handle various formats from AI
  const normalizeDateTime = (dt: string): string => {
    // If already full ISO with timezone, use as-is
    if (dt.includes("+") || dt.endsWith("Z")) return dt;
    // If it's a full ISO without timezone, add Israel timezone
    if (dt.includes("T")) return dt + "+03:00";
    // If it's just a date + time like "2026-03-26 20:00", convert
    if (dt.includes(" ")) return dt.replace(" ", "T") + ":00+03:00";
    // Fallback
    return dt + "+03:00";
  };

  const startDateTime = normalizeDateTime(args.start_time as string);
  const endDateTime = normalizeDateTime(args.end_time as string);

  const body: Record<string, unknown> = {
    summary: args.summary,
    start: { dateTime: startDateTime, timeZone: "Asia/Jerusalem" },
    end: { dateTime: endDateTime, timeZone: "Asia/Jerusalem" },
  };

  if (args.description) {
    body.description = args.description;
  }

  if (args.attendees && Array.isArray(args.attendees)) {
    body.attendees = (args.attendees as string[]).map((email) => ({ email }));
  }

  const response = await fetch(
    `${CALENDAR_BASE_URL}/calendars/primary/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    return { error: `Failed to create event: ${err}` };
  }

  const event = await response.json();
  return {
    success: true,
    id: event.id,
    summary: event.summary,
    start: event.start?.dateTime || event.start?.date,
    end: event.end?.dateTime || event.end?.date,
    htmlLink: event.htmlLink,
  };
};

export const checkAvailabilityExecutor: ToolExecutor = async (args) => {
  const token = await getValidToken("google");
  if (!token) {
    return { error: "Google Calendar is not connected. Please connect your Google account first." };
  }

  const date = args.date as string;
  const startTime = args.start_time as string;
  const endTime = args.end_time as string;

  // Build ISO timestamps with timezone offset (Israel timezone)
  const timeMin = `${date}T${startTime}:00+02:00`;
  const timeMax = `${date}T${endTime}:00+02:00`;

  const response = await fetch(
    `${CALENDAR_BASE_URL}/freeBusy`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        timeMin,
        timeMax,
        items: [{ id: "primary" }],
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    return { error: `Failed to check availability: ${err}` };
  }

  const data = await response.json();
  const busySlots = data.calendars?.primary?.busy || [];

  return {
    date,
    start_time: startTime,
    end_time: endTime,
    is_available: busySlots.length === 0,
    busy_slots: busySlots.map((slot: { start: string; end: string }) => ({
      start: slot.start,
      end: slot.end,
    })),
  };
};
