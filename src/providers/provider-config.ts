/**
 * Provider configuration types
 */

import { ProviderConfig } from '../interfaces/llm/provider';

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

export interface LocalConfig extends ProviderConfig {
    modelPath: string;
    quantization?: 'q4_0' | 'q4_1' | 'q5_0' | 'q5_1' | 'q8_0';
    contextSize?: number;
    threads?: number;
}

export interface ProviderConfigMap {
    openai: OpenAIConfig;
    anthropic: AnthropicConfig;
    local: LocalConfig;
    [key: string]: ProviderConfig;
}