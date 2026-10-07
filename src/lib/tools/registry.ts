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
import {
  outlookSearchMailDefinition,
  outlookSearchMailExecutor,
  outlookReadMailDefinition,
  outlookReadMailExecutor,
} from "./outlook-mail";
import {
  plannerListDefinition,
  plannerListExecutor,
  plannerCreateDefinition,
  plannerCreateExecutor,
  plannerCompleteDefinition,
  plannerCompleteExecutor,
  plannerUpdateDefinition,
  plannerUpdateExecutor,
  plannerRemindDefinition,
  plannerRemindExecutor,
} from "./planner";
import { getComposioTools, executeComposioTool, isComposioTool } from "./composio";

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
  planner_list_tasks: plannerListExecutor,
  planner_create_task: plannerCreateExecutor,
  planner_complete_task: plannerCompleteExecutor,
  planner_update_task: plannerUpdateExecutor,
  planner_set_reminder: plannerRemindExecutor,
  outlook_search_mail: outlookSearchMailExecutor,
  outlook_read_mail: outlookReadMailExecutor,
};

// Map of agent slug -> list of tool names they can use
const agentToolMap: Record<string, string[]> = {
  yarden: [
    // Neil's real calendar and mail are Microsoft 365 (dev@highlaw.co.il).
    // The Google tools are deliberately NOT here: the only connected Google
    // account is an empty throwaway, and offering both made her pick Google
    // and then report "your calendar isn't connected".
    "web_search",
    "web_fetch",
    // The local task tools are deliberately NOT here. Planner is where Neil
    // and ענבל actually work, and an assistant keeping a second list would
    // answer "what's open?" differently from the board they look at. The
    // table stays for reminder scheduling, which Planner has no concept of.
    "outlook_list_events",
    "outlook_check_availability",
    "planner_list_tasks",
    "planner_create_task",
    "planner_complete_task",
    "planner_update_task",
    "planner_set_reminder",
    "outlook_search_mail",
    "outlook_read_mail",
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
  planner_list_tasks: plannerListDefinition,
  planner_create_task: plannerCreateDefinition,
  planner_complete_task: plannerCompleteDefinition,
  planner_update_task: plannerUpdateDefinition,
  planner_set_reminder: plannerRemindDefinition,
  outlook_search_mail: outlookSearchMailDefinition,
  outlook_read_mail: outlookReadMailDefinition,
};

/**
 * Get the tool definitions for a given agent.
 */
export async function getToolsForAgent(
  agentSlug: string,
  userId?: string
): Promise<ToolDefinition[]> {
  const toolNames = agentToolMap[agentSlug];
  const builtIn = (toolNames ?? []).map((name) => toolDefinitions[name]).filter(Boolean);

  // Composio tools are fetched per person, since each crew member connects
  // their own mailbox. Yarden is the only agent that acts on your accounts.
  if (!userId || agentSlug !== "yarden") return builtIn;
  return [...builtIn, ...(await getComposioTools(userId))];
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

  // Composio tool slugs are upper snake case and are registered dynamically,
  // so they never appear in the static map above.
  if (!executor && isComposioTool(toolName)) {
    if (!context?.whatsappUserId) {
      return { error: "Composio tools need a known caller." };
    }
    return executeComposioTool(toolName, args, context.whatsappUserId);
  }

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
