/**
 * Abstract base class for LLM providers
 */

import { Context } from "../interfaces/base/context.ts";
import { Response } from "../interfaces/base/response.ts";
import { ILLMProvider, ProviderConfig } from "../interfaces/llm/provider.ts";
import { logger } from "../services/logger/index.ts";

export abstract class BaseLLMProvider implements ILLMProvider {
  protected config: ProviderConfig;
  protected ready: boolean = false;

  constructor(config: ProviderConfig) {
    this.config = this.validateConfig(config);
  }

  public async initialize(config: ProviderConfig): Promise<void> {
    this.config = this.validateConfig(config);
    await this.initializeProvider();
    this.ready = true;
  }

  public async processMessage(context: Context): Promise<Response> {
    if (!this.ready) {
      throw new Error("Provider not initialized");
    }

    try {
      logger.debug("Processing message...");
      const formattedContext = await this.formatContext(context);
      logger.debug("Sending request...");
      const response = await this.sendRequest(formattedContext);
      logger.debug("Parsing response...");
      const parsedResponse = await this.parseResponse(response);
      logger.debug("Validating response...");
      return this.validateResponse(parsedResponse);
    } catch (error) {
      throw this.handleError(error);
    }
  }

  public async shutdown(): Promise<void> {
    try {
      await this.shutdownProvider();
      this.ready = false;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  protected abstract initializeProvider(): Promise<void>;
  protected abstract shutdownProvider(): Promise<void>;
  protected abstract sendRequest(context: Context): Promise<any>;
  protected abstract parseResponse(response: any): Promise<Response>;

  protected validateConfig(config: ProviderConfig): ProviderConfig {
    if (!config.name) {
      throw new Error("Provider name is required");
    }

    if (!config.modelName) {
      throw new Error("Model name is required");
    }

    return {
      name: config.name,
      modelName: config.modelName,
      apiKey: config.apiKey,
      apiEndpoint: config.apiEndpoint || this.getDefaultEndpoint(),
      maxTokens: config.maxTokens || this.getDefaultMaxTokens(),
      temperature: config.temperature ?? this.getDefaultTemperature(),
      options: {
        ...this.getDefaultOptions(),
        ...config.options,
      },
    };
  }

  protected validateResponse(response: Response): Response {
    if (!response.id) {
      throw new Error("Response missing required id");
    }

    if (!response.type) {
      throw new Error("Response missing required type");
    }

    if (!response.content) {
      throw new Error("Response missing required content");
    }

    return response;
  }

  protected handleError(error: any): Error {
    // Subclasses should override to provide provider-specific error handling
    return error instanceof Error ? error : new Error(String(error));
  }

  protected async formatContext(context: Context): Promise<Context> {
    // Subclasses can override to provide provider-specific context formatting
    return context;
  }

  protected getDefaultEndpoint(): string {
    return ""; // Subclasses should override with provider-specific default
  }

  protected getDefaultMaxTokens(): number {
    return 2048; // Subclasses should override with provider-specific default
  }

  protected getDefaultTemperature(): number {
    return 0.7; // Subclasses should override with provider-specific default
  }

  protected getDefaultOptions(): Record<string, any> {
    return {}; // Subclasses should override with provider-specific defaults
  }
}
