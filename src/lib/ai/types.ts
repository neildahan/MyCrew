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
