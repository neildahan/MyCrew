import type { ToolDefinition } from "@/lib/ai/types";
import {
  getPlannerConfig,
  entraIdFor,
  nameForEntraId,
  graph,
} from "@/lib/integrations/planner";
import type { ToolContext } from "./tasks";

/**
 * Planner is the system of record for tasks: it is where Neil and ענבל
 * actually work, so an assistant keeping its own list would answer "what's
 * open?" differently from the board they look at, and be believed less each
 * time it did.
 *
 * Caller identity comes from the webhook sender, never from model arguments -
 * the same rule as the local task tools. Otherwise a message the assistant was
 * merely asked to summarise could talk it into reassigning someone's work.
 */

interface PlannerTask {
  id: string;
  title: string;
  percentComplete: number;
  dueDateTime: string | null;
  bucketId: string | null;
  createdDateTime?: string;
  assignments?: Record<string, unknown>;
}

interface Bucket {
  id: string;
  name: string;
}

const DONE = 100;

async function requirePlan(): Promise<string> {
  const { planId } = await getPlannerConfig();
  if (!planId) throw new Error("No Planner plan is configured.");
  return planId;
}

async function present(task: PlannerTask) {
  const assignees = Object.keys(task.assignments ?? {});
  return {
    id: task.id,
    title: task.title,
    done: task.percentComplete >= DONE,
    due: task.dueDateTime ? task.dueDateTime.slice(0, 10) : undefined,
    overdue:
      task.percentComplete < DONE &&
      !!task.dueDateTime &&
      new Date(task.dueDateTime).getTime() < Date.now(),
    assigned_to: await Promise.all(assignees.map(nameForEntraId)),
  };
}

async function allTasks(): Promise<PlannerTask[]> {
  const planId = await requirePlan();
  const res = await graph<{ value: PlannerTask[] }>(`/planner/plans/${planId}/tasks`);
  if (!res.ok) throw new Error(res.error ?? "Could not read the plan.");
  return res.data?.value ?? [];
}

// --- Definitions ---

export const plannerListDefinition: ToolDefinition = {
  name: "planner_list_tasks",
  description:
    "List tasks from the shared Microsoft Planner board - the real task list. Use for 'what's open?', 'מה פתוח?', 'what do I owe her?', 'מה ענבל צריכה לעשות?', 'what's overdue?'. Prefer this over any other task tool.",
  parameters: {
    type: "object",
    properties: {
      who: {
        type: "string",
        enum: ["me", "other", "anyone"],
        description:
          "me = assigned to the person talking. other = assigned to the other member. anyone = the whole board. Defaults to anyone.",
      },
      status: {
        type: "string",
        enum: ["open", "overdue", "done", "all"],
        description: "Defaults to open.",
      },
    },
  },
};

export const plannerCreateDefinition: ToolDefinition = {
  name: "planner_create_task",
  description:
    "Add a task to the shared Planner board. Use when asked to remember, add or assign something to do. Keep the user's own wording and language in the title.",
  parameters: {
    type: "object",
    properties: {
      title: { type: "string", description: "Short task title, in the user's language." },
      due: { type: "string", description: "Due date as YYYY-MM-DD. Optional." },
      assign_to: {
        type: "string",
        enum: ["me", "other", "nobody"],
        description:
          "Who does it. me = the person talking. other = the other member. Defaults to me.",
      },
      bucket: {
        type: "string",
        description:
          "Bucket name to file it under, e.g. 'לקוחות'. Optional; omit to use the plan's first bucket.",
      },
    },
    required: ["title"],
  },
};

export const plannerCompleteDefinition: ToolDefinition = {
  name: "planner_complete_task",
  description:
    "Mark one or more Planner tasks as done, by id. Get ids from planner_list_tasks first. Pass every id in task_ids in a single call.",
  parameters: {
    type: "object",
    properties: {
      task_ids: {
        type: "array",
        items: { type: "string" },
        description: "Ids of the tasks to complete. Pass them all at once.",
      },
    },
    required: ["task_ids"],
  },
};

// --- Executors ---

export async function plannerListExecutor(
  args: Record<string, unknown>,
  context?: ToolContext
) {
  const tasks = await allTasks();
  const me = context?.whatsappUserId
    ? await entraIdFor(context.whatsappUserId)
    : null;

  const who = (args.who as string) ?? "anyone";
  const status = (args.status as string) ?? "open";

  let visible = tasks;

  if (who !== "anyone" && me) {
    visible = visible.filter((t) => {
      const assignees = Object.keys(t.assignments ?? {});
      return who === "me" ? assignees.includes(me) : !assignees.includes(me);
    });
  }

  const now = Date.now();
  if (status === "open") visible = visible.filter((t) => t.percentComplete < DONE);
  if (status === "done") visible = visible.filter((t) => t.percentComplete >= DONE);
  if (status === "overdue") {
    visible = visible.filter(
      (t) =>
        t.percentComplete < DONE &&
        !!t.dueDateTime &&
        new Date(t.dueDateTime).getTime() < now
    );
  }

  // Soonest deadline first; undated tasks last rather than sorted as epoch 0.
  visible.sort((a, b) => {
    const at = a.dueDateTime ? new Date(a.dueDateTime).getTime() : Infinity;
    const bt = b.dueDateTime ? new Date(b.dueDateTime).getTime() : Infinity;
    return at - bt;
  });

  return {
    count: visible.length,
    who,
    status,
    tasks: await Promise.all(visible.map(present)),
  };
}

export async function plannerCreateExecutor(
  args: Record<string, unknown>,
  context?: ToolContext
) {
  const planId = await requirePlan();
  const title = typeof args.title === "string" ? args.title.trim() : "";
  if (!title) return { error: "A task title is required." };

  const { members } = await getPlannerConfig();
  const me = context?.whatsappUserId
    ? await entraIdFor(context.whatsappUserId)
    : null;

  const assignTo = (args.assign_to as string) ?? "me";
  let target: string | null = null;
  if (assignTo === "me") target = me;
  if (assignTo === "other") {
    target = members.find((m) => m.entraId !== me)?.entraId ?? null;
  }

  const assignments: Record<string, unknown> = {};
  if (target) {
    assignments[target] = {
      "@odata.type": "#microsoft.graph.plannerAssignment",
      orderHint: " !",
    };
  }

  // A bucket is optional to Graph but not to a human: a task with none sits
  // outside every column on the board and is easy to miss.
  let bucketId: string | undefined;
  const buckets = await graph<{ value: Bucket[] }>(`/planner/plans/${planId}/buckets`);
  if (buckets.ok && buckets.data?.value?.length) {
    const wanted = typeof args.bucket === "string" ? args.bucket.trim() : "";
    bucketId =
      (wanted
        ? buckets.data.value.find((b) => b.name === wanted)?.id
        : undefined) ?? buckets.data.value[0].id;
  }

  const body: Record<string, unknown> = { planId, title };
  if (bucketId) body.bucketId = bucketId;
  if (Object.keys(assignments).length) body.assignments = assignments;
  if (typeof args.due === "string" && /^\d{4}-\d{2}-\d{2}$/.test(args.due)) {
    // Planner stores an instant; end of that day avoids a task being overdue
    // the morning it is due.
    body.dueDateTime = `${args.due}T20:59:59.000Z`;
  }

  const res = await graph<PlannerTask>("/planner/tasks", {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!res.ok) return { error: res.error ?? "Could not create the task." };

  return {
    created: true,
    assigned_to: target ? await nameForEntraId(target) : "nobody",
    task: res.data ? await present(res.data) : undefined,
  };
}

export async function plannerCompleteExecutor(args: Record<string, unknown>) {
  const ids = (Array.isArray(args.task_ids) ? args.task_ids : []).filter(
    (id): id is string => typeof id === "string" && id.length > 0
  );
  if (ids.length === 0) return { error: "At least one task id is required." };

  const completed: string[] = [];
  const failed: Array<{ id: string; reason: string }> = [];

  for (const id of ids) {
    // Planner rejects an update without the current etag, and the etag changes
    // on every edit - so it has to be read immediately before writing.
    const current = await graph<PlannerTask>(`/planner/tasks/${id}`);
    if (!current.ok || !current.etag) {
      failed.push({ id, reason: current.error ?? "Could not read the task." });
      continue;
    }

    if ((current.data?.percentComplete ?? 0) >= DONE) {
      // Already done is not a failure; saying so lets the model report it
      // plainly instead of treating it as an error.
      completed.push(id);
      continue;
    }

    const res = await graph(`/planner/tasks/${id}`, {
      method: "PATCH",
      headers: { "If-Match": current.etag },
      body: JSON.stringify({ percentComplete: DONE }),
    });

    if (res.ok) completed.push(id);
    else failed.push({ id, reason: res.error ?? "Update refused." });
  }

  return { completed: completed.length, completed_ids: completed, failed };
}

// --- Updating an existing task ---

/**
 * Planner's progress is a percentage, but the board only renders three states:
 * 0 is "Not started", anything between is "In progress", 100 is "Completed".
 */
const PROGRESS: Record<string, number> = {
  not_started: 0,
  in_progress: 50,
  done: DONE,
};

interface TaskDetails {
  description?: string;
  "@odata.etag"?: string;
}

export const plannerUpdateDefinition: ToolDefinition = {
  name: "planner_update_task",
  description:
    "Update an EXISTING Planner task: add a note to it, move it to in-progress, change its due date or retitle it. Use this whenever asked to record something about a task that already exists - 'תרשמי בתוך המשימה', 'add a note', 'move it to in progress', 'תעבירי לבתהליך'. Do NOT create a second task for an update to an existing one.",
  parameters: {
    type: "object",
    properties: {
      task_id: {
        type: "string",
        description: "The task to update. Get it from planner_list_tasks.",
      },
      note: {
        type: "string",
        description:
          "Text to record in the task's Notes. Added underneath whatever is already there, with today's date, so the notes read as a running log.",
      },
      replace_notes: {
        type: "boolean",
        description:
          "Overwrite the existing notes instead of adding to them. Defaults to false - only use when explicitly asked to rewrite them.",
      },
      progress: {
        type: "string",
        enum: ["not_started", "in_progress", "done"],
        description: "Move the task to this state. Optional.",
      },
      due: { type: "string", description: "New due date, YYYY-MM-DD. Optional." },
      title: { type: "string", description: "New title. Optional." },
    },
    required: ["task_id"],
  },
};

export async function plannerUpdateExecutor(args: Record<string, unknown>) {
  const id = typeof args.task_id === "string" ? args.task_id.trim() : "";
  if (!id) return { error: "A task_id is required." };

  const changed: string[] = [];

  // The task itself and its details are separate resources with separate
  // etags, so progress/due/title and the notes are two different writes.
  const fields: Record<string, unknown> = {};
  if (typeof args.title === "string" && args.title.trim()) {
    fields.title = args.title.trim();
    changed.push("title");
  }
  if (typeof args.due === "string" && /^\d{4}-\d{2}-\d{2}$/.test(args.due)) {
    fields.dueDateTime = `${args.due}T20:59:59.000Z`;
    changed.push("due date");
  }
  if (typeof args.progress === "string" && args.progress in PROGRESS) {
    fields.percentComplete = PROGRESS[args.progress];
    changed.push(args.progress.replace("_", " "));
  }

  if (Object.keys(fields).length > 0) {
    const current = await graph<PlannerTask>(`/planner/tasks/${id}`);
    if (!current.ok || !current.etag) {
      return { error: current.error ?? "Could not read that task." };
    }
    const res = await graph(`/planner/tasks/${id}`, {
      method: "PATCH",
      headers: { "If-Match": current.etag },
      body: JSON.stringify(fields),
    });
    if (!res.ok) return { error: res.error ?? "Could not update the task." };
  }

  const note = typeof args.note === "string" ? args.note.trim() : "";
  if (note) {
    const details = await graph<TaskDetails>(`/planner/tasks/${id}/details`);
    if (!details.ok || !details.etag) {
      return { error: details.error ?? "Could not read the task's notes." };
    }

    const existing = details.data?.description ?? "";
    const stamp = new Date().toLocaleDateString("he-IL", {
      timeZone: "Asia/Jerusalem",
      day: "numeric",
      month: "numeric",
    });
    // Appending by default: a note about a task is usually one more thing that
    // happened, not a correction of what was there before.
    const description =
      args.replace_notes === true || !existing
        ? `${stamp}: ${note}`
        : `${existing}\n${stamp}: ${note}`;

    const res = await graph(`/planner/tasks/${id}/details`, {
      method: "PATCH",
      headers: { "If-Match": details.etag },
      body: JSON.stringify({ description }),
    });
    if (!res.ok) return { error: res.error ?? "Could not save the note." };
    changed.push("note");
  }

  if (changed.length === 0) return { error: "Nothing to change was given." };

  const after = await graph<PlannerTask>(`/planner/tasks/${id}`);
  return {
    updated: true,
    changed,
    task: after.ok && after.data ? await present(after.data) : undefined,
  };
}

// --- Reminders ---

/**
 * Planner has due dates but no concept of "remind me at 15:00", so the time of
 * day has to live here. The row holds a Planner id and an instant - never a
 * copy of the task text, because a second copy is how the two systems start
 * disagreeing about what the task says.
 */
export const plannerRemindDefinition: ToolDefinition = {
  name: "planner_set_reminder",
  description:
    "Send a WhatsApp reminder about a Planner task at a specific time. Use for 'תזכירי לי מחר ב-3 על...', 'remind me Sunday morning about...'. For a deadline with no particular time, set the task's due date with planner_update_task instead - the morning digest already covers those.",
  parameters: {
    type: "object",
    properties: {
      task_id: {
        type: "string",
        description: "The Planner task to remind about. Get it from planner_list_tasks.",
      },
      when: {
        type: "string",
        description:
          "When to send it, as a full ISO 8601 instant, e.g. 2026-10-09T15:00:00+03:00. Israel time. Must be in the future.",
      },
    },
    required: ["task_id", "when"],
  },
};

export async function plannerRemindExecutor(
  args: Record<string, unknown>,
  context?: ToolContext
) {
  const taskId = typeof args.task_id === "string" ? args.task_id.trim() : "";
  const when = typeof args.when === "string" ? args.when.trim() : "";
  if (!taskId || !when) return { error: "A task_id and a time are required." };

  const at = new Date(when);
  if (Number.isNaN(at.getTime())) return { error: `"${when}" is not a valid time.` };
  if (at.getTime() <= Date.now()) {
    return { error: "That time has already passed. Ask for a time in the future." };
  }

  const owner = context?.whatsappUserId;
  if (!owner) return { error: "Reminders need a known caller." };

  // Confirm the task exists before promising to remind anyone about it.
  const task = await graph<PlannerTask>(`/planner/tasks/${taskId}`);
  if (!task.ok || !task.data) {
    return { error: task.error ?? "That task was not found on the board." };
  }

  const { createAdminClient } = await import("@/lib/supabase/admin");
  const supabase = createAdminClient();

  const { error } = await supabase.from("tasks").insert({
    agent_slug: "yarden",
    whatsapp_user_id: owner,
    // The title is for the message text only; Planner stays the source of
    // truth, and the sender re-reads it before sending.
    title: task.data.title,
    task_type: "reminder",
    status: "pending",
    priority: "medium",
    remind_at: at.toISOString(),
    is_reminder_sent: false,
    metadata: { planner_task_id: taskId },
  });

  if (error) {
    console.error("Could not store the reminder:", error);
    return { error: "Could not save the reminder." };
  }

  return {
    set: true,
    task: task.data.title,
    at: at.toISOString(),
  };
}
