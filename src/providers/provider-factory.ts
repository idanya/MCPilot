/**
 * Factory for creating and managing LLM providers
 */

import {
  IProviderFactory,
  ILLMProvider,
  ProviderType,
  ProviderConfig,
  ProviderCreator,
} from "../interfaces/llm/provider";
import { MCPilotError, ErrorSeverity } from "../interfaces/error/types";

export class ProviderFactory implements IProviderFactory {
  private providers: Map<ProviderType, ProviderCreator>;
  private instances: Map<string, ILLMProvider>;

  constructor() {
    this.providers = new Map();
    this.instances = new Map();
  }

  public create(type: ProviderType, config: ProviderConfig): ILLMProvider {
    try {
      const creator = this.providers.get(type);
      if (!creator) {
        throw new MCPilotError(
          `No provider registered for type: ${type}`,
          "PROVIDER_NOT_FOUND",
          ErrorSeverity.HIGH,
        );
      }

      const instanceKey = this.getInstanceKey(type, config);
      const existingInstance = this.instances.get(instanceKey);
      if (existingInstance) {
        return existingInstance;
      }

      const newInstance = creator(config);
      this.instances.set(instanceKey, newInstance);
      return newInstance;
    } catch (error) {
      throw new MCPilotError(
        "Failed to create provider instance",
        "PROVIDER_CREATION_FAILED",
        ErrorSeverity.HIGH,
        { type, config, error },
      );
    }
  }

  public register(type: ProviderType, factory: ProviderCreator): void {
    try {
      if (this.providers.has(type)) {
        throw new MCPilotError(
          `Provider type already registered: ${type}`,
          "PROVIDER_ALREADY_REGISTERED",
          ErrorSeverity.HIGH,
        );
      }

      this.providers.set(type, factory);
    } catch (error) {
      throw new MCPilotError(
        "Failed to register provider",
        "PROVIDER_REGISTRATION_FAILED",
        ErrorSeverity.HIGH,
        { type, error },
      );
    }
  }

  public getAvailableTypes(): ProviderType[] {
    return Array.from(this.providers.keys());
  }

  public async dispose(provider: ILLMProvider): Promise<void> {
    try {
      await provider.shutdown();

      for (const [key, instance] of this.instances.entries()) {
        if (instance === provider) {
          this.instances.delete(key);
          break;
        }
      }
    } catch (error) {
      throw new MCPilotError(
        "Failed to dispose provider",
        "PROVIDER_DISPOSAL_FAILED",
        ErrorSeverity.HIGH,
        { error },
      );
    }
  }

  public async disposeAll(): Promise<void> {
    const errors: Error[] = [];

    for (const [key, provider] of this.instances.entries()) {
      try {
        await provider.shutdown();
        this.instances.delete(key);
      } catch (error) {
        errors.push(error as Error);
      }
    }

    if (errors.length > 0) {
      throw new MCPilotError(
        "Failed to dispose all providers",
        "PROVIDER_DISPOSAL_FAILED",
        ErrorSeverity.HIGH,
        { errors },
      );
    }
  }

  private getInstanceKey(type: ProviderType, config: ProviderConfig): string {
    return `${type}:${config.name}:${config.modelName}`;
  }

  public hasProvider(type: ProviderType): boolean {
    return this.providers.has(type);
  }

  public getInstanceCount(): number {
    return this.instances.size;
  }

  public getProviderCount(): number {
    return this.providers.size;
  }

  public isProviderActive(type: ProviderType, config: ProviderConfig): boolean {
    const key = this.getInstanceKey(type, config);
    return this.instances.has(key);
  }
}
