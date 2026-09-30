import { createAdminClient } from "@/lib/supabase/admin";

export async function saveTask(
  agentSlug: string,
  whatsappUserId: string,
  title: string,
  description: string,
  taskType: string = "action",
  priority: string = "medium",
  dueAt?: string,
  remindAt?: string,
  requestedBy?: string
) {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      agent_slug: agentSlug,
      whatsapp_user_id: whatsappUserId,
      title,
      description: description || null,
      task_type: taskType,
      priority,
      due_at: dueAt || null,
      remind_at: remindAt || null,
      requested_by: requestedBy || null,
    })
    .select()
    .single();

  if (error) {
    console.error("Failed to save task:", error);
    throw new Error("Failed to save task");
  }

  return data;
}

export async function getDueTasks() {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("is_reminder_sent", false)
    .not("remind_at", "is", null)
    .lte("remind_at", new Date().toISOString())
    .in("status", ["pending", "in_progress"])
    .order("remind_at", { ascending: true });

  if (error) {
    console.error("Failed to get due tasks:", error);
    return [];
  }

  return data ?? [];
}

export async function markTaskReminderSent(id: string) {
  const supabase = createAdminClient();
  await supabase
    .from("tasks")
    .update({ is_reminder_sent: true, updated_at: new Date().toISOString() })
    .eq("id", id);
}

export async function markTaskCompleted(id: string) {
  const supabase = createAdminClient();
  await supabase
    .from("tasks")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
}

/**
 * Open tasks owned by one person that the other person asked for.
 * Answers "what do I owe Inbal?" (owner = me, requester = Inbal).
 */
export async function getTasksOwedTo(ownerId: string, requesterId: string) {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("whatsapp_user_id", ownerId)
    .eq("requested_by", requesterId)
    .in("status", ["pending", "in_progress"])
    .order("due_at", { ascending: true, nullsFirst: false });

  if (error) {
    console.error("Failed to get owed tasks:", error);
    return [];
  }

  return data ?? [];
}

/** Every open task for one person, regardless of who asked for it. */
export async function getOpenTasksFor(ownerId: string) {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("whatsapp_user_id", ownerId)
    .in("status", ["pending", "in_progress"])
    .order("due_at", { ascending: true, nullsFirst: false });

  if (error) {
    console.error("Failed to get open tasks:", error);
    return [];
  }

  return data ?? [];
}

/**
 * Tasks for the morning digest: anything overdue, plus anything due
 * before the given cutoff (normally end of today).
 */
export async function getDigestTasks(ownerId: string, cutoffIso: string) {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("whatsapp_user_id", ownerId)
    .in("status", ["pending", "in_progress"])
    .not("due_at", "is", null)
    .lte("due_at", cutoffIso)
    .order("due_at", { ascending: true });

  if (error) {
    console.error("Failed to get digest tasks:", error);
    return [];
  }

  return data ?? [];
}
