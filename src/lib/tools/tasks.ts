import type { ToolDefinition } from "@/lib/ai/types";
import {
  saveTask,
  getOpenTasksFor,
  getTasksOwedTo,
  markTaskCompleted,
} from "@/lib/reminders/save";
import { getCrewName, getOtherMember } from "@/lib/crew";

/**
 * Caller identity comes from the webhook sender, never from model arguments.
 * If the model could name the owner, it could be talked into reassigning or
 * reading someone else's tasks by a message it was asked to summarise.
 */
export interface ToolContext {
  whatsappUserId: string;
  /**
   * What this person has actually typed, most recent first.
   *
   * Used to prove a phone number was named BY THEM. Yarden reads their mail
   * and their task board, so a number she found in a message she was asked to
   * summarise must never become a number she can write to.
   */
  userMessages?: string[];
  /**
   * Outbound WhatsApp messages this turn produced. The agent runs on Vercel
   * but the WhatsApp connection lives in the worker, so the tool records the
   * intent here and the worker is the one that sends it.
   */
  outbox?: Array<{ to: string; text: string }>;
}

type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_at: string | null;
  remind_at: string | null;
  requested_by: string | null;
  whatsapp_user_id: string;
};

async function present(task: TaskRow) {
  return {
    id: task.id,
    title: task.title,
    description: task.description ?? undefined,
    status: task.status,
    priority: task.priority,
    due_at: task.due_at ?? undefined,
    requested_by: task.requested_by ? await getCrewName(task.requested_by) : undefined,
    owner: await getCrewName(task.whatsapp_user_id),
  };
}

function requireContext(context?: ToolContext) {
  if (!context?.whatsappUserId) {
    throw new Error("Task tools require a known caller.");
  }
  return context.whatsappUserId;
}

// --- Definitions ---

export const listMyTasksDefinition: ToolDefinition = {
  name: "tasks_list_mine",
  description:
    "List the current user's own open tasks. Use for questions like 'what's open?', 'what do I have this week?', 'מה פתוח לי?'. Returns tasks owned by the person who sent the message.",
  parameters: {
    type: "object",
    properties: {
      include_completed: {
        type: "boolean",
        description: "Include completed tasks as well. Defaults to false.",
      },
    },
  },
};

export const listOwedTasksDefinition: ToolDefinition = {
  name: "tasks_list_owed",
  description:
    "List tasks between the two crew members. Use direction='i_owe' for 'what do I owe her?' / 'מה אני חייב לה?', and direction='they_owe' for 'what does she owe me?' / 'מה היא חייבת לי?'. Only works for a two-person crew.",
  parameters: {
    type: "object",
    properties: {
      direction: {
        type: "string",
        enum: ["i_owe", "they_owe"],
        description:
          "i_owe = tasks the current user owns that the other person asked for. they_owe = tasks the other person owns that the current user asked for.",
      },
    },
    required: ["direction"],
  },
};

export const assignTaskDefinition: ToolDefinition = {
  name: "tasks_assign",
  description:
    "Create a task for the OTHER crew member, attributed to the current user as the requester. Use when the user asks someone else to do something, e.g. 'tell Inbal to send the deck by Thursday' / 'תגידי לענבל לשלוח את המצגת'. To create a task for the user themselves, do not use this tool — regular messages are captured automatically.",
  parameters: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "Short, clear task title. Keep the user's own wording and language.",
      },
      description: {
        type: "string",
        description: "Any extra detail. Optional.",
      },
      due_at: {
        type: "string",
        description: "Deadline in ISO 8601 format. Optional.",
      },
      remind_at: {
        type: "string",
        description: "When to send a reminder, ISO 8601. Optional.",
      },
      priority: {
        type: "string",
        enum: ["low", "medium", "high", "urgent"],
        description: "Defaults to medium.",
      },
    },
    required: ["title"],
  },
};

export const completeTaskDefinition: ToolDefinition = {
  name: "tasks_complete",
  description:
    "Mark one or more tasks as completed, by id. Get ids from tasks_list_mine or tasks_list_owed first. Pass EVERY id you want closed in task_ids in a single call - closing them one per call wastes turns and can run out of them mid-way. Only the owner of a task may complete it.",
  parameters: {
    type: "object",
    properties: {
      task_ids: {
        type: "array",
        items: { type: "string" },
        description:
          "Ids of the tasks to complete. Pass them all at once, e.g. when asked to close everything old.",
      },
      task_id: {
        type: "string",
        description: "A single task id. Prefer task_ids when closing more than one.",
      },
    },
  },
};

// --- Executors ---

export async function listMyTasksExecutor(
  args: Record<string, unknown>,
  context?: ToolContext
) {
  const me = requireContext(context);
  const tasks = (await getOpenTasksFor(me)) as TaskRow[];

  const includeCompleted = args.include_completed === true;
  const visible = includeCompleted
    ? tasks
    : tasks.filter((t) => t.status !== "completed");

  return { count: visible.length, tasks: await Promise.all(visible.map(present)) };
}

export async function listOwedTasksExecutor(
  args: Record<string, unknown>,
  context?: ToolContext
) {
  const me = requireContext(context);
  const other = await getOtherMember(me);

  if (!other) {
    return {
      error:
        "This only works for a two-person crew. Check CREW_WHATSAPP_NUMBERS.",
    };
  }

  const direction = args.direction === "they_owe" ? "they_owe" : "i_owe";

  // i_owe: I own it, they asked.  they_owe: they own it, I asked.
  const tasks =
    direction === "i_owe"
      ? ((await getTasksOwedTo(me, other)) as TaskRow[])
      : ((await getTasksOwedTo(other, me)) as TaskRow[]);

  return {
    direction,
    other_person: await getCrewName(other),
    count: tasks.length,
    tasks: await Promise.all(tasks.map(present)),
  };
}

export async function assignTaskExecutor(
  args: Record<string, unknown>,
  context?: ToolContext
) {
  const me = requireContext(context);
  const other = await getOtherMember(me);

  if (!other) {
    return {
      error:
        "This only works for a two-person crew. Check CREW_WHATSAPP_NUMBERS.",
    };
  }

  const title = typeof args.title === "string" ? args.title.trim() : "";
  if (!title) return { error: "A task title is required." };

  const task = await saveTask(
    "yarden",
    other, // owner: the other person does it
    title,
    typeof args.description === "string" ? args.description : "",
    "action",
    typeof args.priority === "string" ? args.priority : "medium",
    typeof args.due_at === "string" ? args.due_at : undefined,
    typeof args.remind_at === "string" ? args.remind_at : undefined,
    me // requested_by: the current user asked for it
  );

  return {
    created: true,
    assigned_to: await getCrewName(other),
    task: await present(task as TaskRow),
  };
}

export async function completeTaskExecutor(
  args: Record<string, unknown>,
  context?: ToolContext
) {
  const me = requireContext(context);

  // Accept either shape. The model reaches for whichever the phrasing
  // suggests, and a rejected call costs a whole turn.
  const ids = [
    ...(Array.isArray(args.task_ids) ? args.task_ids : []),
    ...(typeof args.task_id === "string" ? [args.task_id] : []),
  ]
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  const unique = Array.from(new Set(ids));
  if (unique.length === 0) return { error: "At least one task id is required." };

  // Ownership is checked once for the whole batch rather than per id.
  const mine = (await getOpenTasksFor(me)) as TaskRow[];
  const open = new Set(mine.map((t) => t.id));

  const completed: string[] = [];
  const skipped: string[] = [];

  for (const id of unique) {
    if (!open.has(id)) {
      skipped.push(id);
      continue;
    }
    await markTaskCompleted(id);
    completed.push(id);
  }

  return {
    completed: completed.length,
    completed_ids: completed,
    // Named so the model reports "already closed" rather than an error:
    // re-closing a finished task is a no-op, not a failure.
    skipped_not_open: skipped,
  };
}
