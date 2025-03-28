/**
 * Anthropic provider implementation
 */
import { Anthropic } from "@anthropic-ai/sdk";
import { Session } from "../../../interfaces/base/session.ts";
import { MessageType } from "../../../interfaces/base/message.ts";
import { Response, ResponseType } from "../../../interfaces/base/response.ts";
import {
  ErrorSeverity,
  MCPilotError,
} from "../../../interfaces/error/types.ts";
import { ProviderConfig } from "../../../interfaces/llm/provider.ts";
import { BaseProvider } from "../../base-provider.ts";
import {
  AnthropicError,
  AnthropicRequestOptions,
  AnthropicResponse,
} from "./types.ts";
import {
  TextBlock,
  ThinkingConfigParam,
} from "@anthropic-ai/sdk/resources/index.mjs";
import { v4 as uuidv4 } from "uuid";
import { ApiStream, ApiStreamChunk } from "../../stream.ts";
import { logger } from "../../../services/logger/index.ts";
import { AnthropicConfig } from "providers/provider-config.ts";
import { arrayFromAsyncGenerator } from "../../utils.ts";

// Default retry configuration
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_INITIAL_BACKOFF_MS = 1000; // 1 second
const RETRYABLE_ERROR_TYPES = [
  "rate_limit_error",
  "server_error",
  "timeout_error",
  "connection_error",
];

export class AnthropicProvider extends BaseProvider<AnthropicConfig> {
  private client: Anthropic;
  private maxRetries: number;
  private initialBackoffMs: number;
  private isThinkingEnabled: boolean;

  constructor(config: AnthropicConfig) {
    super();
    this.client = new Anthropic({
      apiKey: config.apiKey || process.env.ANTHROPIC_API_KEY,
    });
    this.config = config;
    this.maxRetries = DEFAULT_MAX_RETRIES;
    this.initialBackoffMs = DEFAULT_INITIAL_BACKOFF_MS;
    this.isThinkingEnabled =
      config.thinking || config.modelName.indexOf("3.7") !== -1;

    logger.debug(
      `Anthropic provider initialized with model: ${config.modelName} and thinking: ${this.isThinkingEnabled}`,
    );
  }

  /**
   * Sends a request to Anthropic and returns the response as a stream
   * @param session The conversation session
   */
  async *sendStreamedRequest(session: Session): ApiStream {
    let attempt = 0;
    let lastError: any;

    const thinkingProperty: { thinking?: ThinkingConfigParam } = this
      .isThinkingEnabled
      ? { thinking: { type: "enabled", budget_tokens: 1024 } }
      : {};

    while (attempt <= this.maxRetries) {
      try {
        const options = this.createRequestOptions(session);
        logger.info(
          `Sending request to Anthropic... (attempt ${attempt + 1}/${
            this.maxRetries + 1
          })`,
        );

        const streamResponse = await this.client.messages.create({
          messages: options.messages,
          model: options.model,
          max_tokens: options.max_tokens,
          ...thinkingProperty,
          stream: true,
          system: options.system,
          temperature: options.temperature || 1,
        });

        let hasNewLine = true;
        for await (const chunk of streamResponse) {
          const processedChunk = this.processStreamChunk(chunk);
          if (processedChunk === undefined) {
            continue;
          }
          if (processedChunk?.type === "text") {
            process.stdout.write(processedChunk.text);

            // Keep track of newline when streaming the text - just for formatting
            hasNewLine = processedChunk.text.endsWith("\n");
          } else if (processedChunk?.type === "message_stop") {
            break;
          }
          yield processedChunk;
        }

        if (!hasNewLine) {
          process.stdout.write("\n");
        }

        logger.info("Request completed");
        return;
      } catch (error) {
        lastError = error;

        if (!this.isRetryableError(error) || attempt >= this.maxRetries) {
          throw this.handleAnthropicError(error);
        }

        // Calculate backoff time using exponential backoff
        const backoffTime = this.calculateBackoff(attempt);
        logger.warn(`anthropic error: ${error}`);
        logger.warn(
          `Request failed. Retrying in ${backoffTime}ms... (attempt ${
            attempt + 1
          }/${this.maxRetries})`,
        );
        await this.delay(backoffTime);
        attempt++;
      }
    }

    // This should never be reached as we either return from the loop or throw an error
    throw this.handleAnthropicError(lastError);
  }

  public async processMessage(session: Session): Promise<Response> {
    const response = await this.sendRequest(session);
    return await this.parseResponse(response);
  }

  protected async sendRequest(session: Session): Promise<AnthropicResponse> {
    try {
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

      const stream = this.sendStreamedRequest(session);
      const allChunks = await arrayFromAsyncGenerator(stream);
      let thinkingScope: string | undefined = undefined;

      for (const chunk of allChunks) {
        this.updateResponseFromChunk(response, textBlock, chunk);
        if (!thinkingScope) {
          thinkingScope = this.extractThinkingContent(textBlock.text);
        }
      }

      if (thinkingScope) {
        logger.info(`Thought:\n${thinkingScope}`);
      }

      return response;
    } catch (error) {
      throw this.handleAnthropicError(error);
    }
  }

  /**
   * Extracts content between <thinking> XML tags
   * @param text The input text to search for thinking tags
   * @returns The content between thinking tags or empty string if not found
   */
  private extractThinkingContent(text: string): string | undefined {
    const thinkingMatch = text.match(/<thinking>([\s\S]*?)<\/thinking>/);
    return thinkingMatch ? thinkingMatch[1].trim() : undefined;
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
      maxRetries: DEFAULT_MAX_RETRIES,
      initialBackoffMs: DEFAULT_INITIAL_BACKOFF_MS,
    };
  }

  private formatMessages(session: Session): Anthropic.Messages.MessageParam[] {
    return session.messages.map(
      (message, index): Anthropic.Messages.MessageParam => {
        const role = this.mapMessageTypeToRole(message.type);

        if (index === session.messages.length - 1) {
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

  private createRequestOptions(session: Session): AnthropicRequestOptions {
    const options: AnthropicRequestOptions = {
      model: this.config.modelName,
      messages: this.formatMessages(session),
      max_tokens: this.config.maxTokens || this.getDefaultMaxTokens(),
      temperature: this.config.temperature ?? this.getDefaultTemperature(),
      stream: this.config.options?.streaming || false,
    };

    if (session.systemPrompt) {
      options.system = [
        {
          type: "text",
          text: session.systemPrompt,
          cache_control: { type: "ephemeral" },
        },
      ];
    }

    return options;
  }

  private handleAnthropicError(error: any): MCPilotError {
    logger.error("Anthropic error:", error);
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

  /**
   * Determines if an error is retryable
   * @param error The error to check
   * @returns boolean indicating if the error is retryable
   */
  private isRetryableError(error: any): boolean {
    // Network errors
    if (!error.response) {
      return true;
    }

    const statusCode = error.response?.status;
    // Retry on rate limits (429) and server errors (5xx)
    if (statusCode === 429 || (statusCode >= 500 && statusCode < 600)) {
      return true;
    }

    // Check Anthropic specific error types
    const errorType = error.response?.data?.error?.type;
    return errorType && RETRYABLE_ERROR_TYPES.includes(errorType);
  }

  /**
   * Calculates backoff time using exponential backoff with jitter
   * @param attempt Current attempt number (0-based)
   * @returns Time to wait in milliseconds
   */
  private calculateBackoff(attempt: number): number {
    // Exponential backoff: initialBackoff * 2^attempt + random jitter
    const exponentialDelay = this.initialBackoffMs * Math.pow(2, attempt);
    // Add jitter to avoid thundering herd problem (±20% randomness)
    const jitter = exponentialDelay * 0.2 * (Math.random() - 0.5);
    return Math.floor(exponentialDelay + jitter);
  }

  /**
   * Helper method to create a delay
   * @param ms Milliseconds to delay
   * @returns Promise that resolves after the delay
   */
  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
        logger.debug(chunk.content_block.text);
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
