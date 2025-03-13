import { MCPilotConfig } from "../interfaces/config/types.ts";
import { ErrorSeverity, MCPilotError } from "../interfaces/error/types.ts";
import {
  ILLMProvider,
  ProviderFactory,
  ProviderType,
} from "../providers/index.ts";
import { ConfigLoader } from "../services/config/config-loader.ts";
import { SessionManager } from "../services/session/index.ts";
import { MCPilotCLIOptions } from "./types.ts";

export function handleError(error: any): never {
  if (error instanceof MCPilotError) {
    console.error(`Error: ${error.message} (${error.code})`);
  } else {
    console.error("Unexpected error:", error);
  }
  process.exit(1);
}

async function createConfig(
  options: MCPilotCLIOptions,
): Promise<MCPilotConfig> {
  const configLoader = new ConfigLoader({
    configPath: options.config,
    env: process.env,
  });
  return configLoader.load();
}

export async function handleStart(
  sessionManager: { current: SessionManager | null },
  providerFactory: ProviderFactory,
  instruction: string,
  options: MCPilotCLIOptions,
): Promise<void> {
  const config = await createConfig(options);
  const provider = await createProvider(providerFactory, config, options);

  // Initialize session manager with config and roles
  sessionManager.current = new SessionManager(
    config,
    provider,
    options.rolesConfig,
    options.role,
    options.workingDirectory,
    options.autoApproveTools,
  );

  await sessionManager.current.createSession();
  console.log("Session started successfully");
  await handleExecute(sessionManager.current, instruction);
}

export async function handleExecute(
  sessionManager: SessionManager | null,
  message: string,
): Promise<void> {
  if (!sessionManager) {
    throw new MCPilotError(
      "No active session",
      "NO_SESSION",
      ErrorSeverity.HIGH,
    );
  }

  await sessionManager.executeMessage(message);
}

export async function handleResume(
  sessionManager: SessionManager | null,
  logPath: string,
  instruction: string,
  providerFactory: ProviderFactory,
  options: MCPilotCLIOptions,
): Promise<void> {
  const config = await createConfig(options);
  const provider = await createProvider(providerFactory, config, options);

  if (!sessionManager) {
    sessionManager = new SessionManager(
      config,
      provider,
      options.rolesConfig,
      undefined,
      options.workingDirectory,
    );
  }

  await sessionManager.resumeSession(logPath);
  console.log("Session resumed successfully");
  await handleExecute(sessionManager, instruction);
}

async function createProvider(
  providerFactory: ProviderFactory,
  config: MCPilotConfig,
  options: MCPilotCLIOptions,
): Promise<ILLMProvider> {
  const providerName = config.session.defaultProvider;
  const providerConfig = config.providers[providerName];

  if (!providerConfig) {
    throw new MCPilotError(
      `Provider '${providerName}' not found in providers configuration`,
      "INVALID_PROVIDER",
      ErrorSeverity.HIGH,
    );
  }

  const pConfig = {
    name: providerName,
    modelName: options.model || providerConfig.model,
    ...providerConfig,
  };

  const provider = providerFactory.create(
    providerName as ProviderType,
    pConfig,
  );
  provider.initialize(pConfig);
  return provider;
}
