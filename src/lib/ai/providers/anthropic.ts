import Anthropic from "@anthropic-ai/sdk";
import type {
  AIProvider,
  AIMessage,
  AIResponse,
  AIProviderConfig,
  ToolDefinition,
} from "../types";
import { costUsd } from "../pricing";

// Each task closed, each calendar day checked, is one iteration. Five ran
// out mid-way through "close all the old tasks" - the work was done and the
// reply was lost. Bulk tool arguments keep the usual case to two or three.
const MAX_TOOL_ITERATIONS = 10;

const VALID_MODELS = [
  "claude-opus-5",
  "claude-sonnet-5",
  "claude-haiku-4-5",
  // Previous generation, kept so existing rows keep working.
  "claude-sonnet-4-6",
  "claude-opus-4-6",
];

const DEFAULT_MODEL = "claude-sonnet-5";

/**
 * Models that removed the sampling parameters. Sending `temperature` to one of
 * these is a hard 400 ("temperature is deprecated for this model"), not a
 * warning, so it has to be omitted rather than clamped.
 */
const NO_SAMPLING_PARAMS = [
  "claude-opus-5",
  "claude-sonnet-5",
  "claude-opus-4-8",
  "claude-opus-4-7",
];

export class AnthropicProvider implements AIProvider {
  private client: Anthropic;
  private modelName: string;

  constructor(apiKey: string, modelName: string = DEFAULT_MODEL) {
    this.client = new Anthropic({ apiKey });
    // Auto-correct invalid model names (e.g. if DB still has "gemini-2.5-flash")
    this.modelName = VALID_MODELS.includes(modelName) ? modelName : DEFAULT_MODEL;
    if (modelName !== this.modelName) {
      console.warn(`[Anthropic] Invalid model "${modelName}", falling back to "${this.modelName}"`);
    }
  }

  async generateResponse(params: {
    systemPrompt: string;
    messages: AIMessage[];
    config?: AIProviderConfig;
    tools?: ToolDefinition[];
    toolExecutor?: (
      name: string,
      args: Record<string, unknown>
    ) => Promise<unknown>;
  }): Promise<AIResponse> {
    const { systemPrompt, messages, config, tools, toolExecutor } = params;

    // Convert messages to Anthropic format
    // Anthropic requires alternating user/assistant messages, no system role in messages
    const anthropicMessages: Anthropic.MessageParam[] = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    // Ensure messages start with a user message (Anthropic requirement)
    if (anthropicMessages.length > 0 && anthropicMessages[0].role !== "user") {
      anthropicMessages.unshift({
        role: "user",
        content: "[Conversation start]",
      });
    }

    // Ensure alternating roles by merging consecutive same-role messages
    const mergedMessages: Anthropic.MessageParam[] = [];
    for (const msg of anthropicMessages) {
      if (
        mergedMessages.length > 0 &&
        mergedMessages[mergedMessages.length - 1].role === msg.role
      ) {
        // Merge consecutive same-role messages
        const prev = mergedMessages[mergedMessages.length - 1];
        prev.content = `${prev.content}\n\n${msg.content}`;
      } else {
        mergedMessages.push({ ...msg });
      }
    }

    // Build Anthropic tools config if tools are provided
    const anthropicTools: Anthropic.Tool[] | undefined =
      tools && tools.length > 0
        ? tools.map((t) => ({
            name: t.name,
            description: t.description,
            input_schema: t.parameters as Anthropic.Tool["input_schema"],
          }))
        : undefined;

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCacheWriteTokens = 0;
    let totalCacheReadTokens = 0;
    let iterations = 0;
    const toolResults: Array<{ tool: string; data: unknown }> = [];

    // Working copy of messages for the tool-calling loop
    const workingMessages = [...mergedMessages];

    // Second cache breakpoint, on the turn before the newest one. The first
    // breakpoint (on `system`) covers tools + system; this one lets the
    // conversation so far be reused as well, so only the new turn is billed
    // at full rate. Anthropic allows up to 4 breakpoints.
    if (workingMessages.length >= 2) {
      const prior = workingMessages[workingMessages.length - 2];
      if (typeof prior.content === "string") {
        prior.content = [
          {
            type: "text" as const,
            text: prior.content,
            cache_control: { type: "ephemeral" as const },
          },
        ] as never;
      }
    }

    // Tool-calling loop
    while (iterations <= MAX_TOOL_ITERATIONS) {
      const response = await this.client.messages.create({
        model: this.modelName,
        max_tokens: config?.maxTokens ?? 2048,
        ...(NO_SAMPLING_PARAMS.includes(this.modelName)
          ? {}
          : { temperature: config?.temperature ?? 0.7 }),
        system: [
          {
            type: "text" as const,
            text: systemPrompt,
            // Input outweighs output ~25:1 here, so caching the stable
            // prefix (tools + system) is the single biggest cost lever.
            cache_control: { type: "ephemeral" as const },
          },
        ],
        messages: workingMessages,
        ...(anthropicTools ? { tools: anthropicTools } : {}),
      });

      totalInputTokens += response.usage.input_tokens;
      totalOutputTokens += response.usage.output_tokens;
      totalCacheWriteTokens += response.usage.cache_creation_input_tokens ?? 0;
      totalCacheReadTokens += response.usage.cache_read_input_tokens ?? 0;

      // Check if there are tool use blocks in the response
      const toolUseBlocks = response.content.filter(
        (block) => block.type === "tool_use"
      );

      // If no tool calls or no executor, return text content
      if (toolUseBlocks.length === 0 || !toolExecutor) {
        const textContent = response.content
          .filter((block) => block.type === "text")
          .map((block) => (block as Anthropic.TextBlock).text)
          .join("\n");

        return {
          content: textContent || "",
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          costUsd: costUsd(
            this.modelName,
            totalInputTokens,
            totalOutputTokens,
            totalCacheWriteTokens,
            totalCacheReadTokens
          ),
          modelUsed: this.modelName,
          finishReason: response.stop_reason ?? "unknown",
          toolData:
            toolResults.length > 0
              ? JSON.stringify(toolResults)
              : undefined,
        };
      }

      // Echo the assistant turn back VERBATIM. Rebuilding it by hand broke on
      // Sonnet 5: adaptive thinking puts a `thinking` block first, and the old
      // two-case mapping turned it into a tool_use with no id ("messages.N.
      // content.0.tool_use.id: Field required"). Thinking blocks must also be
      // returned unmodified, signature included, for the next turn to be valid.
      workingMessages.push({
        role: "assistant",
        content: response.content as Anthropic.ContentBlockParam[],
      });

      // Execute each tool call and collect results
      const toolResultBlocks: Anthropic.ToolResultBlockParam[] = [];

      for (const block of toolUseBlocks) {
        const toolUse = block as Anthropic.ToolUseBlock;
        const name = toolUse.name;
        const args = (toolUse.input as Record<string, unknown>) || {};

        console.log(`[Anthropic] Calling tool: ${name}`, JSON.stringify(args));
        let result: unknown;
        try {
          result = await toolExecutor(name, args);
        } catch (toolError: any) {
          console.error(
            `[Anthropic] Tool ${name} failed:`,
            toolError?.message
          );
          result = {
            error: `Tool failed: ${toolError?.message || "unknown error"}`,
          };
        }
        console.log(
          `[Anthropic] Tool result for ${name}:`,
          JSON.stringify(result).substring(0, 500)
        );

        toolResults.push({ tool: name, data: result });
        toolResultBlocks.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: JSON.stringify(result),
        });
      }

      // Add tool results as a user message (Anthropic format)
      workingMessages.push({
        role: "user",
        content: toolResultBlocks,
      });

      iterations++;
    }

    // Out of iterations. The tool calls up to this point SUCCEEDED - what is
    // missing is only the sentence describing them. Announcing failure here
    // told the user nothing happened while five of their tasks had in fact
    // just been closed. So ask once more with no tools, which forces a text
    // answer, and let it report what it actually did.
    try {
      const summary = await this.client.messages.create({
        model: this.modelName,
        max_tokens: config?.maxTokens ?? 2048,
        ...(NO_SAMPLING_PARAMS.includes(this.modelName)
          ? {}
          : { temperature: config?.temperature ?? 0.7 }),
        system: [
          {
            type: "text" as const,
            text: systemPrompt,
            cache_control: { type: "ephemeral" as const },
          },
        ],
        messages: [
          ...workingMessages,
          {
            role: "user" as const,
            content:
              "Stop here and reply to me now, in my language, based on what you have already done. Do not ask to use any more tools.",
          },
        ],
      });

      totalInputTokens += summary.usage.input_tokens;
      totalOutputTokens += summary.usage.output_tokens;
      totalCacheWriteTokens += summary.usage.cache_creation_input_tokens ?? 0;
      totalCacheReadTokens += summary.usage.cache_read_input_tokens ?? 0;

      const text = summary.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();

      if (text) {
        return {
          content: text,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          costUsd: costUsd(
            this.modelName,
            totalInputTokens,
            totalOutputTokens,
            totalCacheWriteTokens,
            totalCacheReadTokens
          ),
          modelUsed: this.modelName,
          finishReason: "max_iterations_summarised",
        };
      }
    } catch (error) {
      console.error("Could not summarise after exhausting iterations:", error);
    }

    return {
      // Hebrew, and vague about the cause on purpose: "maximum number of
      // iterations" is an implementation detail the user cannot act on.
      content: "סליחה, לא הספקתי לסיים את זה. תנסה שוב? 🙏",
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      costUsd: costUsd(
        this.modelName,
        totalInputTokens,
        totalOutputTokens,
        totalCacheWriteTokens,
        totalCacheReadTokens
      ),
      modelUsed: this.modelName,
      finishReason: "max_iterations",
    };
  }
}
