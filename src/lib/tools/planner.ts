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
