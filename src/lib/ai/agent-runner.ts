import { createAdminClient } from "@/lib/supabase/admin";
import { getProvider } from "./provider-registry";
import { buildSystemPrompt } from "@/lib/agents/prompt-builder";
import type { AIMessage } from "./types";

const CONTEXT_MESSAGE_LIMIT = 20;

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
  messages.push({ role: "user", content: userMessage });

  // 6. Build system prompt
  const systemPrompt = buildSystemPrompt(agent, skills ?? []);

  // 7. Call AI provider
  const provider = getProvider(agent.model_provider, agent.model_name);
  const aiResponse = await provider.generateResponse({
    systemPrompt,
    messages,
    config: {
      temperature: agent.temperature,
      maxTokens: agent.max_tokens,
    },
  });

  // 8. Save user message
  await supabase.from("messages").insert({
    conversation_id: conversation.id,
    role: "user",
    content: userMessage,
    message_type: "text",
  });

  // 9. Save assistant message
  await supabase.from("messages").insert({
    conversation_id: conversation.id,
    role: "assistant",
    content: aiResponse.content,
    message_type: "text",
    tokens_used: aiResponse.inputTokens + aiResponse.outputTokens,
  });

  // 10. Update conversation timestamp
  await supabase
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversation.id);

  // 11. Log usage
  await supabase.from("usage_logs").insert({
    agent_id: agent.id,
    model_provider: agent.model_provider,
    model_name: agent.model_name,
    input_tokens: aiResponse.inputTokens,
    output_tokens: aiResponse.outputTokens,
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
