/**
 * OpenAI provider implementation
 */

import OpenAI from "openai";

import { v4 as uuidv4 } from "uuid";
import { MessageType } from "../../../interfaces/base/message.ts";
import { Response, ResponseType } from "../../../interfaces/base/response.ts";
import { Session } from "../../../interfaces/base/session.ts";
import {
  ErrorSeverity,
  MCPilotError,
} from "../../../interfaces/error/types.ts";
import { ProviderConfig } from "../../../interfaces/llm/provider.ts";
import { logger } from "../../../services/logger/index.ts";
import { BaseProvider } from "../../base-provider.ts";
import { ApiStream, ApiStreamChunk } from "../../stream.ts";
import { OpenAICompletion } from "./types.ts";

export class OpenAIProvider extends BaseProvider {
  private client: OpenAI;

  constructor(config: ProviderConfig) {
    super();
    this.client = new OpenAI({
      apiKey: config.apiKey || process.env.OPENAI_API_KEY,
    });
    this.config = config;
  }

  /**
   * Sends a request to OpenAI and returns the response as a stream
   * @param session The conversation session
   */
  async *sendStreamedRequest(session: Session): ApiStream {
    const messages = this.formatMessages(session);
    try {
      logger.info("Sending request to OpenAI...");

      const stream = await this.client.chat.completions.create({
        model: this.config.modelName,
        messages,
        max_tokens: this.config.maxTokens || this.getDefaultMaxTokens(),
        temperature: this.config.temperature ?? this.getDefaultTemperature(),
        stream: true,
      });

      for await (const chunk of stream) {
        const processedChunk = this.processStreamChunk(chunk);
        if (processedChunk) {
          yield processedChunk;
        }
      }

      yield { type: "message_stop" };
      logger.info("Request completed");
    } catch (error) {
      throw this.handleOpenAIError(error);
    }
  }

  public async processMessage(session: Session): Promise<Response> {
    const response = await this.sendRequest(session);
    return await this.parseResponse(response);
  }

  protected async sendRequest(session: Session): Promise<OpenAICompletion> {
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

    const stream = this.sendStreamedRequest(session);
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

  private formatMessages(
    session: Session,
  ): OpenAI.Chat.ChatCompletionMessageParam[] {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    if (session.systemPrompt) {
      messages.push({
        role: "system",
        content: session.systemPrompt,
      });
    }

    return messages.concat(
      session.messages.map((message) => ({
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
    if (error instanceof OpenAI.APIError) {
      return new MCPilotError(
        error.message || "Unknown OpenAI error",
        "OPENAI_API_ERROR",
        ErrorSeverity.HIGH,
        { originalError: error },
      );
    }
    return new MCPilotError(
      "Unknown OpenAI error",
      "OPENAI_API_ERROR",
      ErrorSeverity.HIGH,
      { originalError: error },
    );
  }

  private processStreamChunk(
    chunk: OpenAI.Chat.ChatCompletionChunk,
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
