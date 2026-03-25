import { GoogleGenAI } from "@google/genai";
import type { AIProvider, AIMessage, AIResponse, AIProviderConfig } from "../types";

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
  }): Promise<AIResponse> {
    const { systemPrompt, messages, config } = params;

    // Convert messages to Gemini format
    const contents = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? ("model" as const) : ("user" as const),
        parts: [{ text: m.content }],
      }));

    const response = await this.client.models.generateContent({
      model: this.modelName,
      contents,
      config: {
        systemInstruction: systemPrompt,
        temperature: config?.temperature ?? 0.7,
        maxOutputTokens: config?.maxTokens ?? 2048,
      },
    });

    const text = response.text ?? "";
    const usage = response.usageMetadata;

    return {
      content: text,
      inputTokens: usage?.promptTokenCount ?? 0,
      outputTokens: usage?.candidatesTokenCount ?? 0,
      finishReason: response.candidates?.[0]?.finishReason ?? "unknown",
    };
  }
}
