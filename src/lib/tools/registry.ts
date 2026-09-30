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
import {
  webSearchDefinition,
  webSearchExecutor,
  webFetchDefinition,
  webFetchExecutor,
} from "./web";
import {
  listMyTasksDefinition,
  listMyTasksExecutor,
  listOwedTasksDefinition,
  listOwedTasksExecutor,
  assignTaskDefinition,
  assignTaskExecutor,
  completeTaskDefinition,
  completeTaskExecutor,
  type ToolContext,
} from "./tasks";
import {
  outlookListEventsDefinition,
  outlookListEventsExecutor,
  outlookCheckAvailabilityDefinition,
  outlookCheckAvailabilityExecutor,
} from "./outlook-calendar";

// Map of tool name -> executor function
const toolExecutors: Record<
  string,
  (args: Record<string, unknown>, context?: ToolContext) => Promise<unknown>
> = {
  google_calendar_list_events: listEventsExecutor,
  google_calendar_create_event: createEventExecutor,
  google_calendar_check_availability: checkAvailabilityExecutor,
  gmail_read_emails: readEmailsExecutor,
  gmail_send_email: sendEmailExecutor,
  web_search: webSearchExecutor,
  web_fetch: webFetchExecutor,
  tasks_list_mine: listMyTasksExecutor,
  tasks_list_owed: listOwedTasksExecutor,
  tasks_assign: assignTaskExecutor,
  tasks_complete: completeTaskExecutor,
  outlook_list_events: outlookListEventsExecutor,
  outlook_check_availability: outlookCheckAvailabilityExecutor,
};

// Map of agent slug -> list of tool names they can use
const agentToolMap: Record<string, string[]> = {
  yarden: [
    "google_calendar_list_events",
    "google_calendar_create_event",
    "google_calendar_check_availability",
    "gmail_read_emails",
    "gmail_send_email",
    "web_search",
    "web_fetch",
    "tasks_list_mine",
    "tasks_list_owed",
    "tasks_assign",
    "tasks_complete",
    "outlook_list_events",
    "outlook_check_availability",
  ],
  dana: [
    "web_search",
    "web_fetch",
  ],
  james: [
    "web_search",
    "web_fetch",
  ],
};

// Map of tool name -> definition
const toolDefinitions: Record<string, ToolDefinition> = {
  google_calendar_list_events: listEventsDefinition,
  google_calendar_create_event: createEventDefinition,
  google_calendar_check_availability: checkAvailabilityDefinition,
  gmail_read_emails: readEmailsDefinition,
  gmail_send_email: sendEmailDefinition,
  web_search: webSearchDefinition,
  web_fetch: webFetchDefinition,
  tasks_list_mine: listMyTasksDefinition,
  tasks_list_owed: listOwedTasksDefinition,
  tasks_assign: assignTaskDefinition,
  tasks_complete: completeTaskDefinition,
  outlook_list_events: outlookListEventsDefinition,
  outlook_check_availability: outlookCheckAvailabilityDefinition,
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
  args: Record<string, unknown>,
  context?: ToolContext
): Promise<unknown> {
  const executor = toolExecutors[toolName];
  if (!executor) {
    return { error: `Unknown tool: ${toolName}` };
  }

  try {
    return await executor(args, context);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Tool execution error (${toolName}):`, message);
    return { error: `Tool execution failed: ${message}` };
  }
}
