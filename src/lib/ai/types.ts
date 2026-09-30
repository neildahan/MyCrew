export interface AIMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface AIResponse {
  content: string;
  inputTokens: number;
  outputTokens: number;
  finishReason: string;
  toolData?: string; // JSON string of tool results for context in follow-ups
  /** USD for this call, computed by the provider which knows the cache split. */
  costUsd?: number;
  /** The model that actually ran, which may differ if the budget forced a downgrade. */
  modelUsed?: string;
}

export interface AIProviderConfig {
  temperature?: number;
  maxTokens?: number;
}

export interface AIProvider {
  generateResponse(params: {
    systemPrompt: string;
    messages: AIMessage[];
    config?: AIProviderConfig;
    tools?: ToolDefinition[];
    toolExecutor?: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  }): Promise<AIResponse>;
}

// Tool / function calling types
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: object;
}

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

export interface ToolResult {
  name: string;
  result: unknown;
}

export type ToolExecutor = (args: Record<string, unknown>) => Promise<unknown>;
