/**
 * Defines the interface for LLM providers and their configuration
 */

import type { Session } from "../base/session.ts";
import type { Response } from "../base/response.ts";

export type ILLMProvider = {
  initialize(config: ProviderConfig): Promise<void>;
  processMessage(session: Session): Promise<Response>;
  shutdown(): Promise<void>;
};

export type ProviderConfig = {
  name: string;
  modelName: string;
  apiKey?: string;
  apiEndpoint?: string;
  maxTokens?: number;
  temperature?: number;
  options?: ProviderOptions;
};

export type ProviderOptions = {
  timeout?: number;
  retryAttempts?: number;
  contextWindow?: number;
  streaming?: boolean;
  stopSequences?: string[];
  logitBias?: Record<string, number>;
};

export type IProviderFactory = {
  create(type: ProviderType, config: ProviderConfig): ILLMProvider;
  register(type: ProviderType, factory: ProviderCreator): void;
  getAvailableTypes(): ProviderType[];
  dispose(provider: ILLMProvider): Promise<void>;
};

export type ProviderCreator = (config: ProviderConfig) => ILLMProvider;

export enum ProviderType {
  OPENAI = "openai",
  ANTHROPIC = "anthropic",
}

export type ITokenCounter = {
  countTokens(text: string): number;
  estimateTokens(session: Session): number;
  getLimit(): number;
  getUsage(): TokenUsage;
};

export type TokenUsage = {
  prompt: number;
  completion: number;
  total: number;
};

export type IContextWindowManager = {
  add(content: string): boolean;
  remove(content: string): boolean;
  getCurrentSize(): number;
  trim(targetSize: number): void;
  getMaxSize(): number;
};

export type IPluginManager = {
  loadPlugin(path: string): Promise<void>;
  unloadPlugin(name: string): Promise<void>;
  getLoadedPlugins(): ProviderPlugin[];
  validatePlugin(plugin: ProviderPlugin): boolean;
};

export type ProviderPlugin = {
  name: string;
  version: string;
  type: ProviderType;
  factory: ProviderCreator;
  configSchema: PluginConfigSchema;
};

export type PluginConfigSchema = {
  required: string[];
  properties: Record<string, PluginConfigProperty>;
};

export type PluginConfigProperty = {
  type: string;
  description: string;
  default?: any;
  enum?: any[];
  minimum?: number;
  maximum?: number;
  pattern?: string;
};
