/**
 * Provider configuration types
 */

import { ProviderConfig } from "../interfaces/llm/provider.ts";

export interface OpenAIConfig extends ProviderConfig {
  apiVersion?: string;
  organizationId?: string;
  maxRetries?: number;
}

export interface AnthropicConfig extends ProviderConfig {
  apiVersion?: string;
  maxTokensToSample?: number;
  stopSequences?: string[];
}

export interface ProviderConfigMap {
  openai: OpenAIConfig;
  anthropic: AnthropicConfig;
  [key: string]: ProviderConfig;
}
