/**
 * Anthropic provider implementation
 */
import { Anthropic } from "@anthropic-ai/sdk";
import { Context } from "../../../interfaces/base/context.ts";
import { MessageType } from "../../../interfaces/base/message.ts";
import { Response, ResponseType } from "../../../interfaces/base/response.ts";
import {
  ErrorSeverity,
  MCPilotError,
} from "../../../interfaces/error/types.ts";
import { ProviderConfig } from "../../../interfaces/llm/provider.ts";
import { BaseLLMProvider } from "../../base-provider.ts";
import {
  AnthropicError,
  AnthropicRequestOptions,
  AnthropicResponse,
} from "./types.ts";
import { TextBlock } from "@anthropic-ai/sdk/resources/index.mjs";
import { v4 as uuidv4 } from "uuid";
import { ApiStream, ApiStreamChunk } from "../../stream.ts";
import { ApiStreamMessageStop } from "../../stream.ts";
export class AnthropicProvider extends BaseLLMProvider {
  private client: Anthropic;

  constructor(config: ProviderConfig) {
    super(config);
    this.client = new Anthropic({
      apiKey: this.config.apiKey || process.env.ANTHROPIC_API_KEY,
    });
  }

  /**
   * Sends a request to Anthropic and returns the response as a stream
   * @param context The conversation context
   */
  async *sendStreamedRequest(context: Context): ApiStream {
    const options = this.createRequestOptions(context);
    try {
      console.log("Sending request to Anthropic...");

      const streamResponse = await this.client.messages.create({
        messages: options.messages,
        model: options.model,
        max_tokens: options.max_tokens,
        thinking: { type: "enabled", budget_tokens: 1024 },
        stream: true,
        system: options.system,
        temperature: options.temperature || 1,
      });

      for await (const chunk of streamResponse) {
        const processedChunk = this.processStreamChunk(chunk);
        if (processedChunk === undefined) {
          continue;
        }
        if (processedChunk?.type === "message_stop") {
          return;
        }
        yield processedChunk;
      }

      console.log("Request completed");
    } catch (error) {
      throw this.handleAnthropicError(error);
    }
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
    const iterator = stream[Symbol.asyncIterator]();
    for await (const chunk of iterator) {
      this.updateResponseFromChunk(response, textBlock, chunk);
    }

    return response;
  }

  protected async parseResponse(
    response: AnthropicResponse,
  ): Promise<Response> {
    const stringResponse = this.extractTextFromResponse(response);

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
    return 1;
  }

  protected getDefaultOptions(): Record<string, any> {
    return {
      stream: true,
    };
  }

  private formatMessages(context: Context): Anthropic.Messages.MessageParam[] {
    return context.messages.map(
      (message, index): Anthropic.Messages.MessageParam => {
        const role = this.mapMessageTypeToRole(message.type);

        if (index === context.messages.length - 1) {
          return {
            role,
            content: [
              {
                type: "text",
                text: message.content,
                cache_control: { type: "ephemeral" },
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

  private mapMessageTypeToRole(messageType: MessageType): "user" | "assistant" {
    switch (messageType) {
      case MessageType.USER:
        return "user";
      case MessageType.ASSISTANT:
        return "assistant";
      default:
        return "user"; // Default to user for other types
    }
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
          cache_control: { type: "ephemeral" },
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

  private processStreamChunk(chunk: any): ApiStreamChunk | undefined {
    switch (chunk.type) {
      case "message_start":
        return this.processMessageStart(chunk);
      case "message_stop":
        return { type: "message_stop" };
      case "message_delta":
        return this.processMessageDelta(chunk);
      case "content_block_delta":
        return this.processContentBlockDelta(chunk);
      case "content_block_start":
        return this.processContentBlockStart(chunk);
      case "content_block_stop":
        return { type: "content_block_stop" };
    }
    return undefined;
  }

  private processMessageStart(chunk: any): ApiStreamChunk {
    const usage = chunk.message.usage;

    return {
      type: "usage",
      inputTokens: usage.input_tokens || 0,
      outputTokens: usage.output_tokens || 0,
      cacheWriteTokens: usage.cache_creation_input_tokens || undefined,
      cacheReadTokens: usage.cache_read_input_tokens || undefined,
    };
  }

  private processMessageDelta(chunk: any): ApiStreamChunk {
    return {
      type: "usage",
      inputTokens: 0,
      outputTokens: chunk.usage.output_tokens || 0,
    };
  }

  private processContentBlockDelta(chunk: any): ApiStreamChunk {
    switch (chunk.delta.type) {
      case "thinking_delta":
        return { type: "reasoning", text: chunk.delta.thinking };
      case "text_delta":
        process.stdout.write(chunk.delta.text);
        return { type: "text", text: chunk.delta.text };
      case "signature_delta":
        return { type: "text", text: "" };
      default:
        throw new Error(
          `Unknown content block delta type: ${chunk.delta.type}`,
        );
    }
  }

  private processContentBlockStart(chunk: any): ApiStreamChunk | undefined {
    if (chunk.index > 0) {
      const type =
        chunk.content_block.type === "thinking" ? "reasoning" : "text";
      return { type, text: "\n" };
    }

    switch (chunk.content_block.type) {
      case "thinking":
        return {
          type: "reasoning",
          text: chunk.content_block.thinking,
        };

      case "text":
        console.log(chunk.content_block.text);
        return {
          type: "text",
          text: chunk.content_block.text,
        };
    }
    return undefined;
  }

  private updateResponseFromChunk(
    response: AnthropicResponse,
    textBlock: TextBlock,
    chunk: ApiStreamChunk,
  ): void {
    switch (chunk.type) {
      case "usage":
        response.usage.input_tokens += chunk.inputTokens;
        response.usage.output_tokens += chunk.outputTokens;
        break;
      case "reasoning":
      case "text":
        textBlock.text += chunk.text;
        break;
    }
  }

  private extractTextFromResponse(response: AnthropicResponse): string {
    let stringResponse = "";
    for (const block of response.content) {
      if (block.type === "text") {
        stringResponse += block.text;
      } else if (block.type === "thinking") {
        stringResponse += block.thinking;
      }
    }
    return stringResponse;
  }
}
