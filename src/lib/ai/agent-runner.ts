import { createAdminClient } from "@/lib/supabase/admin";
import { getProvider } from "./provider-registry";
import { buildSystemPrompt } from "@/lib/agents/prompt-builder";
import { getToolsForAgent, executeToolCall } from "@/lib/tools/registry";
import { getBudgetStatus, budgetExceededMessage } from "./budget";
import { FALLBACK_MODEL } from "./pricing";
import { isIntegrationConnected } from "@/lib/integrations/token-manager";
import type { AIMessage } from "./types";

// 20 messages of history was ~3,300 tokens resent on every single call - more
// than half the bill - to answer questions that rarely need it. Tasks and
// reminders live in the database, which is the real memory; this window only
// has to cover the current back-and-forth.
const CONTEXT_MESSAGE_LIMIT = 8;

interface RunAgentResult {
  response: string;
  inputTokens: number;
  outputTokens: number;
}

export async function runAgent(
  agentSlug: string,
  userMessage: string,
  whatsappUserId: string
): Promise<RunAgentResult> {
  const supabase = createAdminClient();

  // 1. Load agent
  const { data: agent, error: agentError } = await supabase
    .from("agents")
    .select("*")
    .eq("slug", agentSlug)
    .eq("is_active", true)
    .single();

  if (agentError || !agent) {
    throw new Error(`Agent "${agentSlug}" not found or inactive`);
  }

  // 2. Load active skills
  const { data: skills } = await supabase
    .from("skills")
    .select("*")
    .eq("agent_id", agent.id)
    .eq("is_active", true);

  // 3. Load or create conversation
  let { data: conversation } = await supabase
    .from("conversations")
    .select("*")
    .eq("agent_id", agent.id)
    .eq("whatsapp_user_id", whatsappUserId)
    .eq("is_active", true)
    .single();

  if (!conversation) {
    const { data: newConv, error: convError } = await supabase
      .from("conversations")
      .insert({
        agent_id: agent.id,
        whatsapp_user_id: whatsappUserId,
      })
      .select()
      .single();

    if (convError || !newConv) {
      throw new Error("Failed to create conversation");
    }
    conversation = newConv;
  }

  // 4. Load conversation history (previous messages for context)
  const { data: history } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: true })
    .limit(CONTEXT_MESSAGE_LIMIT);

  // 5. Build messages array with history + new message
  const messages: AIMessage[] = (history ?? []).map((m) => ({
    role: m.role as AIMessage["role"],
    content: m.content,
  }));
  // The clock time rides along with the user's turn, which is after the cache
  // breakpoint, so it costs nothing to change. Only the array sent to the model
  // is annotated - the stored message stays clean.
  const clockTime = new Date().toLocaleTimeString("en-IL", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit",
    minute: "2-digit",
  });
  messages.push({ role: "user", content: `[${clockTime}] ${userMessage}` });

  // 6. Build system prompt
  const systemPrompt = buildSystemPrompt(agent, skills ?? []);

  // 7. Load tools for the agent
  let tools = getToolsForAgent(agentSlug);
  let toolExecutor: ((name: string, args: Record<string, unknown>) => Promise<unknown>) | undefined;

  if (tools.length > 0) {
    const googleConnected = await isIntegrationConnected("google");
    if (!googleConnected) {
      // Remove Google-specific tools if not connected, keep web tools
      tools = tools.filter(t => !t.name.startsWith("google_") && !t.name.startsWith("gmail_"));
    }

    const microsoftConnected = await isIntegrationConnected("microsoft");
    if (!microsoftConnected) {
      // Offering a calendar tool that always errors just wastes turns.
      tools = tools.filter(t => !t.name.startsWith("outlook_"));
    }
    if (tools.length > 0) {
      // Bind the sender's identity here so task tools cannot be told
      // who they are acting as by the model or the message content.
      toolExecutor = (name, args) =>
        executeToolCall(name, args, { whatsappUserId });
    }
  }

  // 8. Budget gate, then call the AI provider.
  // Checked before the request rather than after, since afterwards the money
  // is already spent. Near the cap we downgrade instead of cutting the user
  // off; at the cap we stop.
  const budget = await getBudgetStatus();

  if (budget.state === "stop") {
    console.warn(
      `Monthly budget reached ($${budget.spend.toFixed(2)}/$${budget.budget.toFixed(2)}), refusing the request.`
    );
    return {
      response: budgetExceededMessage(budget),
      inputTokens: 0,
      outputTokens: 0,
    };
  }

  const modelName =
    budget.state === "degrade" && agent.model_provider === "anthropic"
      ? FALLBACK_MODEL
      : agent.model_name;

  if (modelName !== agent.model_name) {
    console.warn(
      `Budget at ${(budget.fraction * 100).toFixed(0)}%, using ${modelName} instead of ${agent.model_name}.`
    );
  }

  const provider = getProvider(agent.model_provider, modelName);
  const aiResponse = await provider.generateResponse({
    systemPrompt,
    messages,
    config: {
      temperature: agent.temperature,
      maxTokens: agent.max_tokens,
    },
    tools: tools.length > 0 ? tools : undefined,
    toolExecutor,
  });

  // 9. Save user message
  await supabase.from("messages").insert({
    conversation_id: conversation.id,
    role: "user",
    content: userMessage,
    message_type: "text",
  });

  // 10. Save assistant message (include tool data for follow-up context)
  const assistantContent = aiResponse.toolData
    ? `${aiResponse.content}\n\n[Tool data: ${aiResponse.toolData}]`
    : aiResponse.content;
  await supabase.from("messages").insert({
    conversation_id: conversation.id,
    role: "assistant",
    content: assistantContent,
    message_type: "text",
    tokens_used: aiResponse.inputTokens + aiResponse.outputTokens,
  });

  // 11. Update conversation timestamp
  await supabase
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversation.id);

  // 12. Log usage
  await supabase.from("usage_logs").insert({
    agent_id: agent.id,
    model_provider: agent.model_provider,
    // Record what actually ran, not what the agent is configured with.
    model_name: aiResponse.modelUsed ?? modelName,
    input_tokens: aiResponse.inputTokens,
    output_tokens: aiResponse.outputTokens,
    // Without this the budget check above has nothing to read, and the
    // dashboard reports $0.00 forever.
    cost_usd: aiResponse.costUsd ?? 0,
    conversation_id: conversation.id,
  });

  return {
    response: aiResponse.content,
    inputTokens: aiResponse.inputTokens,
    outputTokens: aiResponse.outputTokens,
  };
}

// Crew mode — run a single agent with a custom prompt (no conversation history)
export async function runAgentOneShot(
  agentSlug: string,
  prompt: string
): Promise<RunAgentResult> {
  const supabase = createAdminClient();

  const { data: agent, error: agentError } = await supabase
    .from("agents")
    .select("*")
    .eq("slug", agentSlug)
    .eq("is_active", true)
    .single();

  if (agentError || !agent) {
    throw new Error(`Agent "${agentSlug}" not found or inactive`);
  }

  const { data: skills } = await supabase
    .from("skills")
    .select("*")
    .eq("agent_id", agent.id)
    .eq("is_active", true);

  const systemPrompt = buildSystemPrompt(agent, skills ?? []);
  const messages: AIMessage[] = [{ role: "user", content: prompt }];

  const provider = getProvider(agent.model_provider, agent.model_name);
  const aiResponse = await provider.generateResponse({
    systemPrompt,
    messages,
    config: {
      temperature: agent.temperature,
      maxTokens: agent.max_tokens,
    },
  });

  // Log usage
  await supabase.from("usage_logs").insert({
    agent_id: agent.id,
    model_provider: agent.model_provider,
    model_name: agent.model_name,
    input_tokens: aiResponse.inputTokens,
    output_tokens: aiResponse.outputTokens,
  });

  return {
    response: aiResponse.content,
    inputTokens: aiResponse.inputTokens,
    outputTokens: aiResponse.outputTokens,
  };
}
