import Anthropic from "@anthropic-ai/sdk";
import type {
  AIProvider,
  AIMessage,
  AIResponse,
  AIProviderConfig,
  ToolDefinition,
} from "../types";

const MAX_TOOL_ITERATIONS = 5;

const VALID_MODELS = [
  "claude-sonnet-4-6",
  "claude-opus-4-6",
  "claude-haiku-4-5",
];

const DEFAULT_MODEL = "claude-sonnet-4-6";

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
    let iterations = 0;
    const toolResults: Array<{ tool: string; data: unknown }> = [];

    // Working copy of messages for the tool-calling loop
    const workingMessages = [...mergedMessages];

    // Tool-calling loop
    while (iterations <= MAX_TOOL_ITERATIONS) {
      const response = await this.client.messages.create({
        model: this.modelName,
        max_tokens: config?.maxTokens ?? 2048,
        temperature: config?.temperature ?? 0.7,
        system: systemPrompt,
        messages: workingMessages,
        ...(anthropicTools ? { tools: anthropicTools } : {}),
      });

      totalInputTokens += response.usage.input_tokens;
      totalOutputTokens += response.usage.output_tokens;

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
          finishReason: response.stop_reason ?? "unknown",
          toolData:
            toolResults.length > 0
              ? JSON.stringify(toolResults)
              : undefined,
        };
      }

      // Add assistant response (with tool_use blocks) to messages
      workingMessages.push({
        role: "assistant",
        content: response.content.map((block) => {
          if (block.type === "text") {
            return { type: "text" as const, text: block.text };
          }
          // tool_use block
          const tu = block as Anthropic.ToolUseBlock;
          return {
            type: "tool_use" as const,
            id: tu.id,
            name: tu.name,
            input: tu.input,
          };
        }),
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

    // If we exhausted iterations, return whatever we have
    return {
      content:
        "I tried to use tools but exceeded the maximum number of iterations. Please try again with a simpler request.",
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      finishReason: "max_iterations",
    };
  }
}
