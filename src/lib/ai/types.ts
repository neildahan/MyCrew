export interface AIMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface AIResponse {
  content: string;
  inputTokens: number;
  outputTokens: number;
  finishReason: string;
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
  }): Promise<AIResponse>;
}
