import { Session } from "../interfaces/base/session.ts";
import { Response } from "../interfaces/base/response.ts";
import { ILLMProvider, ProviderConfig } from "../interfaces/llm/provider.ts";

export abstract class BaseProvider<
  ConfigType extends ProviderConfig = ProviderConfig,
> implements ILLMProvider
{
  protected config!: ConfigType;

  abstract processMessage(session: Session): Promise<Response>;

  async initialize(config: ConfigType): Promise<void> {
    this.config = config;
  }

  async shutdown(): Promise<void> {
    // Base implementation - override if needed
  }
}
