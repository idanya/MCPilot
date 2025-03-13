/**
 * Anthropic provider implementation
 */
import { Anthropic } from "@anthropic-ai/sdk";
import { Context } from "../../interfaces/base/context.ts";
import { MessageType } from "../../interfaces/base/message.ts";
import { Response, ResponseType } from "../../interfaces/base/response.ts";
import { ErrorSeverity, MCPilotError } from "../../interfaces/error/types.ts";
import { ProviderConfig } from "../../interfaces/llm/provider.ts";
import { BaseLLMProvider } from "../base-provider.ts";
import {
  AnthropicError,
  AnthropicRequestOptions,
  AnthropicResponse,
  EphemeralCacheControlValue,
} from "./anthropic/types.ts";
import { Stream } from "openai/streaming.mjs";
import { ApiStream, ApiStreamChunk } from "../stream.ts";
import { TextBlock } from "@anthropic-ai/sdk/resources/index.mjs";
import { v4 as uuidv4 } from "uuid";
export class AnthropicProvider extends BaseLLMProvider {
  private client: Anthropic;
  // private apiClient: import("axios").AxiosInstance;

  constructor(config: ProviderConfig) {
    super(config);
    this.client = new Anthropic({
      apiKey: this.config.apiKey || process.env.ANTHROPIC_API_KEY,
      // baseURL: this.config.apiEndpoint || undefined,
    });

    // this.apiClient = axios.create({
    //   baseURL: this.config.apiEndpoint || "https://api.anthropic.com/v1",
    //   headers: {
    //     "x-api-key": this.config.apiKey || process.env.ANTHROPIC_API_KEY,
    //     "Content-Type": "application/json",
    //     "anthropic-version": "2023-06-01",
    //   },
    // });
  }

  protected async initializeProvider(): Promise<void> {
    if (!this.config.apiKey) {
      throw new MCPilotError(
        "Anthropic API key is required",
        "CONFIG_ERROR",
        ErrorSeverity.HIGH,
      );
    }
  }

  protected async shutdownProvider(): Promise<void> {
    // No specific cleanup needed for Anthropic
  }

  protected async sendRequest(context: Context): Promise<AnthropicResponse> {
    const textBlock: TextBlock = {
      citations: [],
      text: "",
      type: "text",
    };

    const response: AnthropicResponse = {
      content: [textBlock],
      id: "",
      model: "",
      usage: {
        input_tokens: 0,
        output_tokens: 0,
      },
    };

    const stream = this.sendStreamedRequest(context);
    for await (const chunk of stream) {
      switch (chunk.type) {
        case "usage":
          response.usage.input_tokens += chunk.inputTokens;
          response.usage.output_tokens += chunk.outputTokens;
          break;
        case "reasoning":
          textBlock.text += chunk.text;
          break;
        case "text":
          textBlock.text += chunk.text;
          break;
      }
    }

    return response;
  }

  private async *sendStreamedRequest(context: Context): ApiStream {
    const options = this.createRequestOptions(context);
    try {
      console.log("Sending request to Anthropic...");

      const streamResponse = await this.client.messages.create({
        messages: options.messages,
        model: options.model,
        max_tokens: options.max_tokens,
        stream: true,
        system: options.system as any,
        temperature: options.temperature,
      });
      for await (const chunk of streamResponse) {
        switch (chunk.type) {
          case "message_start":
            const usage = chunk.message.usage;

            yield {
              type: "usage",
              inputTokens: usage.input_tokens || 0,
              outputTokens: usage.output_tokens || 0,
              cacheWriteTokens: usage.cache_creation_input_tokens || undefined,
              cacheReadTokens: usage.cache_read_input_tokens || undefined,
            };
            break;
          case "message_stop":
            console.log("message_stop");
            break;
          case "message_delta":
            yield {
              type: "usage",
              inputTokens: 0,
              outputTokens: chunk.usage.output_tokens || 0,
            };
            break;
          case "content_block_delta":
            switch (chunk.delta.type) {
              case "thinking_delta":
                yield { type: "reasoning", text: chunk.delta.thinking };
                break;
              case "text_delta":
                process.stdout.write(chunk.delta.text);
                yield { type: "text", text: chunk.delta.text };
                break;
            }
            break;
          case "content_block_start":
            switch (chunk.content_block.type) {
              case "thinking":
                if (chunk.index > 0) {
                  yield { type: "reasoning", text: "\n" };
                }

                yield { type: "reasoning", text: chunk.content_block.thinking };
                break;
              case "text":
                if (chunk.index > 0) {
                  yield { type: "text", text: "\n" };
                }

                console.log(chunk.content_block.text);
                yield { type: "text", text: chunk.content_block.text };
                break;
            }
            break;
          case "content_block_stop":
            break;
        }
      }

      console.log("Request completed");
    } catch (error) {
      throw this.handleAnthropicError(error);
    }
  }

  protected async parseResponse(
    response: AnthropicResponse,
  ): Promise<Response> {
    let stringResponse = "";
    for (const block of response.content) {
      if (block.type === "text") {
        stringResponse += block.text;
      } else if (block.type === "thinking") {
        stringResponse += block.thinking;
      }
    }

    return {
      id: uuidv4(),
      type: ResponseType.TEXT,
      content: {
        text: stringResponse,
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

  private formatMessages(context: Context): Anthropic.Messages.MessageParam[] {
    return context.messages.map(
      (message, index): Anthropic.Messages.MessageParam => {
        // Map message types to Anthropic roles
        let role: "user" | "assistant";
        switch (message.type) {
          case MessageType.USER:
            role = "user";
            break;
          case MessageType.ASSISTANT:
            role = "assistant";
            break;
          default:
            role = "user"; // Default to user for other types
        }

        if (index === context.messages.length - 1) {
          return {
            role,
            content: [
              {
                type: "text",
                text: message.content,
                // cache_control: { type: "ephemeral" },
              },
            ],
          };
        }

        return {
          role,
          content: message.content,
        };
      },
    );
  }

  private createRequestOptions(context: Context): AnthropicRequestOptions {
    return {
      model: this.config.modelName,
      messages: this.formatMessages(context),
      max_tokens: this.config.maxTokens || this.getDefaultMaxTokens(),
      temperature: this.config.temperature ?? this.getDefaultTemperature(),
      system: [
        {
          type: "text",
          text: context.systemPrompt,
          cache_control: EphemeralCacheControlValue,
        },
      ],
      stream: this.config.options?.streaming || false,
    };
  }

  private handleAnthropicError(error: any): MCPilotError {
    console.log("Anthropic error:", error);
    const anthropicError = error.response?.data as AnthropicError;
    return new MCPilotError(
      anthropicError?.error?.message || "Unknown Anthropic error",
      "ANTHROPIC_API_ERROR",
      ErrorSeverity.HIGH,
      { originalError: error },
    );
  }
}
