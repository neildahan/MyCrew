"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { CheckCircle, XCircle, Clock, AlertTriangle } from "lucide-react";
import type { Task } from "@/types/database";

const AGENT_INFO: Record<string, { emoji: string; name: string }> = {
  yarden: { emoji: "\ud83d\udccb", name: "Yarden" },
  dana: { emoji: "\ud83d\udcf1", name: "Dana" },
  james: { emoji: "\ud83d\udcbc", name: "Yoav" },
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-gray-100 text-gray-700",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-orange-100 text-orange-700",
  urgent: "bg-red-100 text-red-700",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  in_progress: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-gray-100 text-gray-500",
  failed: "bg-red-100 text-red-700",
};

function formatDate(dateStr: string | null) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-IL", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Jerusalem",
  });
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [agentFilter, setAgentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const { addToast } = useToast();

  async function loadTasks() {
    setLoading(true);
    const params = new URLSearchParams();
    if (agentFilter !== "all") params.set("agent", agentFilter);
    if (statusFilter !== "all") params.set("status", statusFilter);

    const res = await fetch(`/api/tasks?${params.toString()}`);
    if (res.ok) {
      setTasks(await res.json());
    }
    setLoading(false);
  }

  useEffect(() => {
    loadTasks();
  }, [agentFilter, statusFilter]);

  async function updateTaskStatus(taskId: string, status: string) {
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });

    if (res.ok) {
      addToast({ title: `Task ${status === "completed" ? "completed" : "cancelled"}!`, variant: "success" });
      loadTasks();
    } else {
      addToast({ title: "Failed to update task", variant: "destructive" });
    }
  }

  return (
    <div>
      <PageHeader
        title="Tasks"
        description="All tasks assigned to your crew"
      />

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <select
          value={agentFilter}
          onChange={(e) => setAgentFilter(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="all">All Agents</option>
          <option value="yarden">{"\ud83d\udccb"} Yarden</option>
          <option value="dana">{"\ud83d\udcf1"} Dana</option>
          <option value="james">{"\ud83d\udcbc"} Yoav</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="all">All Status</option>
          <option value="pending">Pending</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {/* Task List */}
      {loading ? (
        <p className="text-gray-500">Loading tasks...</p>
      ) : tasks.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Clock className="mx-auto h-12 w-12 text-gray-300 mb-3" />
            <p className="text-gray-500 text-lg">No tasks yet</p>
            <p className="text-gray-400 text-sm mt-1">
              Tasks will appear here when you assign work to your crew via WhatsApp
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => {
            const agent = AGENT_INFO[task.agent_slug] || {
              emoji: "\u2753",
              name: task.agent_slug,
            };
            return (
              <Card key={task.id}>
                <CardContent className="py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      {/* Agent + Title */}
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg">{agent.emoji}</span>
                        <span className="text-xs font-medium text-gray-500 uppercase">
                          {agent.name}
                        </span>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[task.status] || ""}`}
                        >
                          {task.status.replace("_", " ")}
                        </span>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${PRIORITY_COLORS[task.priority] || ""}`}
                        >
                          {task.priority}
                        </span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700">
                          {task.task_type}
                        </span>
                      </div>

                      <h3 className="font-semibold text-gray-900">
                        {task.title}
                      </h3>

                      {task.description && (
                        <p className="text-sm text-gray-600 mt-1">
                          {task.description}
                        </p>
                      )}

                      {/* Dates */}
                      <div className="flex gap-4 mt-2 text-xs text-gray-400">
                        {task.due_at && (
                          <span>Due: {formatDate(task.due_at)}</span>
                        )}
                        {task.remind_at && (
                          <span>
                            {"\u23f0"} Remind: {formatDate(task.remind_at)}
                          </span>
                        )}
                        <span>Created: {formatDate(task.created_at)}</span>
                        {task.completed_at && (
                          <span>
                            {"\u2705"} Completed: {formatDate(task.completed_at)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    {(task.status === "pending" ||
                      task.status === "in_progress") && (
                      <div className="flex gap-2 shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            updateTaskStatus(task.id, "completed")
                          }
                          className="text-green-600 hover:text-green-700"
                        >
                          <CheckCircle className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            updateTaskStatus(task.id, "cancelled")
                          }
                          className="text-gray-400 hover:text-red-500"
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
