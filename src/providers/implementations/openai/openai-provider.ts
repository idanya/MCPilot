/**
 * OpenAI provider implementation
 */

import axios, { AxiosInstance } from "axios";
import { Context } from "../../../interfaces/base/context.ts";
import { MessageType } from "../../../interfaces/base/message.ts";
import { Response, ResponseType } from "../../../interfaces/base/response.ts";
import {
  MCPilotError,
  ErrorSeverity,
} from "../../../interfaces/error/types.ts";
import { ProviderConfig } from "../../../interfaces/llm/provider.ts";
import { BaseLLMProvider } from "../../base-provider.ts";
import {
  OpenAIMessage,
  OpenAICompletion,
  OpenAIError,
  OpenAIStreamChunk,
} from "./types.ts";
import { v4 as uuidv4 } from "uuid";
import { ApiStream, ApiStreamChunk } from "../../stream.ts";
import { logger } from "../../../services/logger/index.ts";

export class OpenAIProvider extends BaseLLMProvider {
  private apiClient: AxiosInstance;

  constructor(config: ProviderConfig) {
    super(config);
    this.apiClient = axios.create({
      baseURL: this.config.apiEndpoint || this.getDefaultEndpoint(),
      headers: {
        Authorization: `Bearer ${this.config.apiKey || process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
    });
  }

  /**
   * Sends a request to OpenAI and returns the response as a stream
   * @param context The conversation context
   */
  async *sendStreamedRequest(context: Context): ApiStream {
    const messages = this.formatMessages(context);
    try {
      logger.info("Sending request to OpenAI...");

      const response = await this.apiClient.post(
        "/chat/completions",
        {
          model: this.config.modelName,
          messages,
          max_tokens: this.config.maxTokens || this.getDefaultMaxTokens(),
          temperature: this.config.temperature ?? this.getDefaultTemperature(),
          stream: true,
        },
        {
          responseType: "stream",
        },
      );

      let currentText = "";
      let inputTokens = 0;
      let outputTokens = 0;

      for await (const chunk of response.data) {
        const lines = chunk.toString().split("\n").filter(Boolean);
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(5);
            if (data === "[DONE]") {
              yield { type: "message_stop" };
              return;
            }

            try {
              const parsed = JSON.parse(data) as OpenAIStreamChunk;
              const processedChunk = this.processStreamChunk(parsed);
              if (processedChunk) {
                if (processedChunk.type === "text") {
                  currentText += processedChunk.text;
                  outputTokens += 1; // Approximate token count
                }
                yield processedChunk;
              }
            } catch (e) {
              logger.error("Error parsing stream chunk:", e);
            }
          }
        }
      }

      logger.info("Request completed");
    } catch (error) {
      throw this.handleOpenAIError(error);
    }
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
    let fullResponse: OpenAICompletion = {
      id: uuidv4(),
      object: "chat.completion",
      created: Date.now(),
      model: this.config.modelName,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: "",
          },
          finish_reason: null,
        },
      ],
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      },
    };

    const stream = this.sendStreamedRequest(context);
    const iterator = stream[Symbol.asyncIterator]();

    for await (const chunk of iterator) {
      this.updateResponseFromChunk(fullResponse, chunk);
    }

    return fullResponse;
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
    return 1;
  }

  protected getDefaultOptions(): Record<string, any> {
    return {
      stream: true,
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
        role: this.mapMessageTypeToRole(message.type),
        content: message.content,
      })),
    );
  }

  private mapMessageTypeToRole(messageType: MessageType): "user" | "assistant" {
    switch (messageType) {
      case MessageType.USER:
        return "user";
      case MessageType.ASSISTANT:
        return "assistant";
      default:
        return "user";
    }
  }

  private handleOpenAIError(error: any): MCPilotError {
    logger.error("OpenAI error:", error);
    const openAIError = error.response?.data as OpenAIError;
    return new MCPilotError(
      openAIError?.error?.message || "Unknown OpenAI error",
      "OPENAI_API_ERROR",
      ErrorSeverity.HIGH,
      { originalError: error },
    );
  }

  private processStreamChunk(
    chunk: OpenAIStreamChunk,
  ): ApiStreamChunk | undefined {
    const choice = chunk.choices[0];
    if (!choice) return undefined;

    if (choice.finish_reason === "stop") {
      return { type: "message_stop" };
    }

    if (choice.delta.content) {
      process.stdout.write(choice.delta.content);
      return { type: "text", text: choice.delta.content };
    }

    // Handle thinking/reasoning blocks by checking for specific markers in the content
    if (choice.delta.content?.startsWith("<thinking>")) {
      return { type: "reasoning", text: choice.delta.content };
    }

    return undefined;
  }

  private updateResponseFromChunk(
    response: OpenAICompletion,
    chunk: ApiStreamChunk,
  ): void {
    switch (chunk.type) {
      case "usage":
        response.usage.prompt_tokens += chunk.inputTokens;
        response.usage.completion_tokens += chunk.outputTokens;
        response.usage.total_tokens =
          response.usage.prompt_tokens + response.usage.completion_tokens;
        break;
      case "reasoning":
      case "text":
        response.choices[0].message.content =
          (response.choices[0].message.content || "") + chunk.text;
        break;
    }
  }
}
