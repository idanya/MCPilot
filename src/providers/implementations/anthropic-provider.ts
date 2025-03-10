/**
 * Anthropic provider implementation
 */

import axios from "axios";
import { BaseLLMProvider } from "../base-provider";
import { Context } from "../../interfaces/base/context";
import { MessageType } from "../../interfaces/base/message";
import { Response, ResponseType } from "../../interfaces/base/response";
import { ProviderConfig } from "../../interfaces/llm/provider";
import { MCPilotError, ErrorSeverity } from "../../interfaces/error/types";
import {
  AnthropicMessage,
  AnthropicResponse,
  AnthropicError,
  AnthropicRequestOptions,
} from "./anthropic/types";

export class AnthropicProvider extends BaseLLMProvider {
  private apiClient: import("axios").AxiosInstance;

  constructor(config: ProviderConfig) {
    super(config);
    this.apiClient = axios.create({
      baseURL: this.config.apiEndpoint || "https://api.anthropic.com/v1",
      headers: {
        "x-api-key": this.config.apiKey || process.env.ANTHROPIC_API_KEY,
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
      },
    });
  }

  protected async initializeProvider(): Promise<void> {
    if (!this.config.apiKey) {
      throw new MCPilotError(
        "Anthropic API key is required",
        "CONFIG_ERROR",
        ErrorSeverity.HIGH
      );
    }
  }

  protected async shutdownProvider(): Promise<void> {
    // No specific cleanup needed for Anthropic
  }

  protected async sendRequest(context: Context): Promise<AnthropicResponse> {
    const options = this.createRequestOptions(context);
    try {
      const response = await this.apiClient.post("/messages", options);
      return response.data as AnthropicResponse;
    } catch (error) {
      throw this.handleAnthropicError(error);
    }
  }

  protected async parseResponse(
    response: AnthropicResponse
  ): Promise<Response> {
    return {
      id: response.id,
      type: ResponseType.TEXT,
      content: {
        text: response.content[0].text,
      },
      metadata: {
        model: response.model,
        tokens: {
          prompt: response.usage.input_tokens,
          completion: response.usage.output_tokens,
          total: response.usage.input_tokens + response.usage.output_tokens,
        },
      },
      timestamp: new Date(),
    };
  }

  protected getDefaultEndpoint(): string {
    return "https://api.anthropic.com/v1";
  }

  protected getDefaultMaxTokens(): number {
    return 4096;
  }

  protected getDefaultTemperature(): number {
    return 0.7;
  }

  protected getDefaultOptions(): Record<string, any> {
    return {
      stream: false,
    };
  }

  private formatMessages(context: Context): AnthropicMessage[] {
    return context.messages.map((message) => {
      // Map message types to Anthropic roles
      let role: "user" | "assistant" | "system";
      switch (message.type) {
        case MessageType.USER:
          role = "user";
          break;
        case MessageType.ASSISTANT:
          role = "assistant";
          break;
        case MessageType.SYSTEM:
          role = "system";
          break;
        default:
          role = "user"; // Default to user for other types
      }

      return {
        role,
        content: message.content,
      };
    });
  }

  private createRequestOptions(context: Context): AnthropicRequestOptions {
    return {
      model: this.config.modelName,
      messages: this.formatMessages(context),
      max_tokens: this.config.maxTokens || this.getDefaultMaxTokens(),
      temperature: this.config.temperature ?? this.getDefaultTemperature(),
      system: context.systemPrompt,
      stream: this.config.options?.streaming || false,
    };
  }

  private handleAnthropicError(error: any): MCPilotError {
    const anthropicError = error.response?.data as AnthropicError;
    return new MCPilotError(
      anthropicError?.error?.message || "Unknown Anthropic error",
      "ANTHROPIC_API_ERROR",
      ErrorSeverity.HIGH,
      { originalError: error }
    );
  }
}
