import { getProvider } from "@/lib/ai/provider-registry";

export interface ExtractedTask {
  isTask: boolean;
  title: string;
  description: string;
  taskType: string; // reminder, action, research, followup
  priority: string; // low, medium, high, urgent
  dueAt: string; // ISO string or empty
  remindAt: string; // ISO string or empty
}

// Use the configured provider for task extraction
// Defaults to Anthropic if available, falls back to Gemini
function getExtractionProvider() {
  if (process.env.ANTHROPIC_API_KEY) {
    return getProvider("anthropic", "claude-haiku-4-5");
  }
  return getProvider("gemini", "gemini-2.5-flash");
}

export async function extractTask(
  message: string,
  agentSlug: string,
  timezone: string = "Asia/Jerusalem"
): Promise<ExtractedTask> {
  const provider = getExtractionProvider();
  const now = new Date().toLocaleString("en-US", { timeZone: timezone });

  const systemPrompt = `You analyze messages and determine if the user is asking to DO something actionable (not just having a conversation).

Current date/time in ${timezone}: ${now}
Agent: ${agentSlug}

Respond ONLY with a JSON object (no markdown, no backticks):
{
  "isTask": true/false,
  "title": "short clear title of the task",
  "description": "more details if any",
  "taskType": "reminder|action|research|followup",
  "priority": "low|medium|high|urgent",
  "dueAt": "ISO 8601 datetime or empty string",
  "remindAt": "ISO 8601 datetime or empty string"
}

Rules:
- "remind me to X at Y" → isTask=true, taskType="reminder", remindAt=the time
- "schedule a meeting" → isTask=true, taskType="action"
- "post on instagram about X" → isTask=true, taskType="action"
- "research competitors in X" → isTask=true, taskType="research"
- "follow up with John next week" → isTask=true, taskType="followup", dueAt=next week
- "how are you?" or "what can you do?" → isTask=false (just conversation)
- "thanks" or "ok" → isTask=false
- If a specific time is mentioned for a reminder, set remindAt
- If a deadline is mentioned, set dueAt
- If the message mentions "tomorrow at 9", "in 30 minutes", "at 14:00", etc → calculate the correct ISO datetime
- If time already passed today, assume tomorrow
- Priority: default "medium", use "high" if urgent language, "low" if casual
- Title should be concise (under 60 chars)`;

  const response = await provider.generateResponse({
    systemPrompt,
    messages: [{ role: "user", content: message }],
    config: { temperature: 0.1, maxTokens: 512 },
  });

  const text = response.content?.trim() || "";

  try {
    const cleaned = text.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return {
      isTask: parsed.isTask === true,
      title: parsed.title || "",
      description: parsed.description || "",
      taskType: parsed.taskType || "action",
      priority: parsed.priority || "medium",
      dueAt: parsed.dueAt || "",
      remindAt: parsed.remindAt || "",
    };
  } catch (e) {
    console.error("Failed to parse task extraction:", text);
    return { isTask: false, title: "", description: "", taskType: "action", priority: "medium", dueAt: "", remindAt: "" };
  }
}
