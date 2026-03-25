import type { ToolDefinition } from "@/lib/ai/types";
import {
  listEventsDefinition,
  listEventsExecutor,
  createEventDefinition,
  createEventExecutor,
  checkAvailabilityDefinition,
  checkAvailabilityExecutor,
} from "./google-calendar";
import {
  readEmailsDefinition,
  readEmailsExecutor,
  sendEmailDefinition,
  sendEmailExecutor,
} from "./gmail";

// Map of tool name -> executor function
const toolExecutors: Record<
  string,
  (args: Record<string, unknown>) => Promise<unknown>
> = {
  google_calendar_list_events: listEventsExecutor,
  google_calendar_create_event: createEventExecutor,
  google_calendar_check_availability: checkAvailabilityExecutor,
  gmail_read_emails: readEmailsExecutor,
  gmail_send_email: sendEmailExecutor,
};

// Map of agent slug -> list of tool names they can use
const agentToolMap: Record<string, string[]> = {
  yarden: [
    "google_calendar_list_events",
    "google_calendar_create_event",
    "google_calendar_check_availability",
    "gmail_read_emails",
    "gmail_send_email",
  ],
  // dana and james get no tools for now
};

// Map of tool name -> definition
const toolDefinitions: Record<string, ToolDefinition> = {
  google_calendar_list_events: listEventsDefinition,
  google_calendar_create_event: createEventDefinition,
  google_calendar_check_availability: checkAvailabilityDefinition,
  gmail_read_emails: readEmailsDefinition,
  gmail_send_email: sendEmailDefinition,
};

/**
 * Get the tool definitions for a given agent.
 */
export function getToolsForAgent(agentSlug: string): ToolDefinition[] {
  const toolNames = agentToolMap[agentSlug];
  if (!toolNames) return [];

  return toolNames
    .map((name) => toolDefinitions[name])
    .filter(Boolean);
}

/**
 * Execute a tool call by name.
 */
export async function executeToolCall(
  toolName: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const executor = toolExecutors[toolName];
  if (!executor) {
    return { error: `Unknown tool: ${toolName}` };
  }

  try {
    return await executor(args);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Tool execution error (${toolName}):`, message);
    return { error: `Tool execution failed: ${message}` };
  }
}
