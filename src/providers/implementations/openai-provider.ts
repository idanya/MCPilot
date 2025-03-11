/**
 * OpenAI provider implementation
 */

import axios, { AxiosInstance } from "axios";
import { BaseLLMProvider } from "../base-provider";
import { Context } from "../../interfaces/base/context";
import { Response, ResponseType } from "../../interfaces/base/response";
import { Message, MessageType } from "../../interfaces/base/message";
import { ProviderConfig } from "../../interfaces/llm/provider";
import { MCPilotError, ErrorSeverity } from "../../interfaces/error/types";
import { OpenAIMessage, OpenAICompletion, OpenAIError } from "./openai/types";

export class OpenAIProvider extends BaseLLMProvider {
  private apiClient: AxiosInstance;

  constructor(config: ProviderConfig) {
    super(config);
    this.apiClient = axios.create({
      baseURL: this.config.apiEndpoint || "https://api.openai.com/v1",
      headers: {
        Authorization: `Bearer ${this.config.apiKey || process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
    });
  }

  protected async initializeProvider(): Promise<void> {
    if (!this.config.apiKey) {
      throw new MCPilotError(
        "OpenAI API key is required",
        "CONFIG_ERROR",
        ErrorSeverity.HIGH,
      );
    }
  }

  protected async shutdownProvider(): Promise<void> {
    // No specific cleanup needed for OpenAI
  }

  protected async sendRequest(context: Context): Promise<OpenAICompletion> {
    const messages = this.formatMessages(context);
    try {
      const response = await this.apiClient.post("/chat/completions", {
        model: this.config.modelName,
        messages,
        max_tokens: this.config.maxTokens || this.getDefaultMaxTokens(),
        temperature: this.config.temperature ?? this.getDefaultTemperature(),
        stream: this.config.options?.streaming || false,
      });
      return response.data as OpenAICompletion;
    } catch (error) {
      throw this.handleOpenAIError(error);
    }
  }

  protected async parseResponse(response: OpenAICompletion): Promise<Response> {
    const choice = response.choices[0];
    if (!choice) {
      throw new MCPilotError(
        "No completion choices returned",
        "PROVIDER_ERROR",
        ErrorSeverity.HIGH,
      );
    }

    return {
      id: response.id,
      type: ResponseType.TEXT,
      content: {
        text: choice.message.content || "",
      },
      metadata: {
        model: response.model,
        tokens: {
          prompt: response.usage.prompt_tokens,
          completion: response.usage.completion_tokens,
          total: response.usage.total_tokens,
        },
      },
      timestamp: new Date(),
    };
  }

  protected getDefaultEndpoint(): string {
    return "https://api.openai.com/v1";
  }

  protected getDefaultMaxTokens(): number {
    return 4096;
  }

  protected getDefaultTemperature(): number {
    return 0.7;
  }

  protected getDefaultOptions(): Record<string, any> {
    return {
      streaming: false,
    };
  }

  private formatMessages(context: Context): OpenAIMessage[] {
    const messages: OpenAIMessage[] = [];

    if (context.systemPrompt) {
      messages.push({
        role: "system",
        content: context.systemPrompt,
      });
    }

    return messages.concat(
      context.messages.map((message) => ({
        role: (() => {
          switch (message.type) {
            case MessageType.SYSTEM:
              return "system";
            case MessageType.USER:
              return "user";
            case MessageType.ASSISTANT:
              return "assistant";
            default:
              return "user";
          }
        })(),
        content: message.content,
      })),
    );
  }

  private handleOpenAIError(error: any): MCPilotError {
    const openAIError = error.response?.data as OpenAIError;
    return new MCPilotError(
      openAIError?.error?.message || "Unknown OpenAI error",
      "OPENAI_API_ERROR",
      ErrorSeverity.HIGH,
      { originalError: error },
    );
  }
}
