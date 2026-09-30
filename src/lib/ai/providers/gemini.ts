import { GoogleGenAI } from "@google/genai";
import type {
  AIProvider,
  AIMessage,
  AIResponse,
  AIProviderConfig,
  ToolDefinition,
} from "../types";

const MAX_TOOL_ITERATIONS = 3;

export class GeminiProvider implements AIProvider {
  private client: GoogleGenAI;
  private modelName: string;

  constructor(apiKey: string, modelName: string = "gemini-2.5-flash") {
    this.client = new GoogleGenAI({ apiKey });
    this.modelName = modelName;
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

    // Convert messages to Gemini format
    const contents = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? ("model" as const) : ("user" as const),
        parts: [{ text: m.content }],
      }));

    // Build Gemini tools config if tools are provided
    const geminiTools =
      tools && tools.length > 0
        ? [
            {
              functionDeclarations: tools.map((t) => ({
                name: t.name,
                description: t.description,
                parameters: t.parameters,
              })),
            },
          ]
        : undefined;

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let iterations = 0;
    const toolResults: Array<{ tool: string; data: unknown }> = [];

    // Tool-calling loop
    while (iterations <= MAX_TOOL_ITERATIONS) {
      const response = await this.client.models.generateContent({
        model: this.modelName,
        contents,
        config: {
          systemInstruction: systemPrompt,
          temperature: config?.temperature ?? 0.7,
          maxOutputTokens: config?.maxTokens ?? 2048,
          tools: geminiTools,
          ...(geminiTools ? { toolConfig: { functionCallingConfig: { mode: "AUTO" } } } : {} as any),
        },
      });

      const usage = response.usageMetadata;
      totalInputTokens += usage?.promptTokenCount ?? 0;
      totalOutputTokens += usage?.candidatesTokenCount ?? 0;

      const candidate = response.candidates?.[0];
      const parts = candidate?.content?.parts || [];

      // Check if there are function calls in the response
      const functionCallParts = (parts as any[]).filter(
        (p: any) => p.functionCall
      );

      // If no function calls or no executor, return text
      if (functionCallParts.length === 0 || !toolExecutor) {
        const text = response.text ?? "";
        return {
          content: text,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          finishReason:
            candidate?.finishReason ?? "unknown",
          toolData: toolResults.length > 0 ? JSON.stringify(toolResults) : undefined,
        };
      }

      // Execute each function call and add model response + function results to contents
      contents.push({
        role: "model" as const,
        parts: parts as Array<{ text: string }>,
      });

      const functionResponseParts: Array<{
        functionResponse: { name: string; response: unknown };
      }> = [];

      for (const part of functionCallParts) {
        const fc = (part as Record<string, Record<string, unknown>>)
          .functionCall;
        const name = fc.name as string;
        const args = (fc.args as Record<string, unknown>) || {};

        console.log(`[Gemini] Calling tool: ${name}`, JSON.stringify(args));
        let result: unknown;
        try {
          result = await toolExecutor(name, args);
        } catch (toolError: any) {
          console.error(`[Gemini] Tool ${name} failed:`, toolError?.message);
          result = { error: `Tool failed: ${toolError?.message || "unknown error"}` };
        }
        console.log(
          `[Gemini] Tool result for ${name}:`,
          JSON.stringify(result).substring(0, 500)
        );

        toolResults.push({ tool: name, data: result });
        functionResponseParts.push({
          functionResponse: { name, response: result },
        });
      }

      // Add function results as a user turn
      contents.push({
        role: "user" as const,
        parts: functionResponseParts as unknown as Array<{ text: string }>,
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
