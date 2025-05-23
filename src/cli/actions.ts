import { MCPilotConfig } from "../interfaces/config/types.ts";
import { ErrorSeverity, MCPilotError } from "../interfaces/error/types.ts";
import {
  ILLMProvider,
  ProviderFactory,
  ProviderType,
} from "../providers/index.ts";
import { ConfigLoader } from "../services/config/config-loader.ts";
import { RoleManager, SessionManager } from "../services/session/index.ts";
import { MCPilotCLIOptions } from "./types.ts";
import { createLogger, logger } from "../services/logger/index.ts";

import { ToolHandler } from "../services/tools/tool-handler.ts";

export async function handleError(error: any) {
  if (error instanceof MCPilotError) {
    logger.error(`Error: ${error.message} (${error.code})`);
  } else {
    logger.error("Unexpected error:", error);
  }
  await new Promise(() => logger.end(() => process.exit(1)));
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
  providerFactory: ProviderFactory,
  instruction: string,
  options: MCPilotCLIOptions,
): Promise<void> {
  // Configure logger with CLI log level
  const newLogger = createLogger(options.logLevel);
  Object.assign(logger, newLogger);

  const config = await createConfig(options);
  const provider = await createProvider(providerFactory, config, options);

  const roleManager = new RoleManager({
    rolesConfigPath: options.rolesConfig,
    workingDirectory: options.workingDirectory || process.cwd(),
    roleFilePath: options.roleFile || undefined,
    mcpServers: config.mcp?.servers || {},
    autoApproveTools: options.autoApproveTools || false,
  });

  await roleManager.initialize();

  const toolHandler = new ToolHandler({
    mcpHub: roleManager.getMcpHub(),
  });

  // Initialize session manager with config and roles
  const sessionManager = new SessionManager({
    config,
    provider,
    workingDirectory: options.workingDirectory,
    autoApproveTools: options.autoApproveTools,
    toolHandler,
  });

  let systemPrompt = "";
  await roleManager.initialize();
  if (options.role) {
    systemPrompt = await roleManager.generateRoleSystemPrompt(
      await roleManager.getRoleConfig(options.role),
      false,
    );
  }

  const session = await sessionManager.createSession(systemPrompt);
  logger.info("Session started successfully");

  await sessionManager.executeMessage(session.id, instruction);
  process.exit(0);
}

export async function handleResume(
  logPath: string,
  instruction: string,
  providerFactory: ProviderFactory,
  options: MCPilotCLIOptions,
): Promise<void> {
  // Configure logger with CLI log level
  const newLogger = createLogger(options.logLevel);
  Object.assign(logger, newLogger);

  const config = await createConfig(options);
  const provider = await createProvider(providerFactory, config, options);

  const roleManager = new RoleManager({
    rolesConfigPath: options.rolesConfig,
    workingDirectory: options.workingDirectory || process.cwd(),
    roleFilePath: options.roleFile || undefined,
    mcpServers: config.mcp?.servers || {},
    autoApproveTools: options.autoApproveTools || false,
  });

  const toolHandler = new ToolHandler({
    mcpHub: roleManager.getMcpHub(),
  });

  const sessionManager = new SessionManager({
    config,
    provider,
    workingDirectory: options.workingDirectory,
    autoApproveTools: options.autoApproveTools,
    toolHandler,
  });

  const session = await sessionManager.resumeSession(logPath);
  logger.info("Session resumed successfully");
  await sessionManager.executeMessage(session.id, instruction);
  process.exit(0);
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
