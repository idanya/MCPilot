/**
 * CLI entry point for MCPilot
 */

import { Command } from "commander";
import { readFile } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { MCPilotConfig } from "../interfaces/config/types";
import { ErrorSeverity, MCPilotError } from "../interfaces/error/types";
import {
  AnthropicConfig,
  AnthropicProvider,
  BaseProviderTypes,
  ILLMProvider,
  OpenAIConfig,
  OpenAIProvider,
  ProviderFactory,
  ProviderType,
} from "../providers/index";
import { ConfigLoader } from "../services/config/config-loader";
import { SessionManager } from "../services/session/index";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  await readFile(join(__dirname, "../../package.json"), "utf-8"),
);
const version = pkg.version;

class MCPilotCLI {
  private program: Command;
  private sessionManager: SessionManager | null;
  private providerFactory: ProviderFactory;

  constructor(autoSetup = false) {
    this.program = new Command();
    this.sessionManager = null;
    this.providerFactory = new ProviderFactory();

    // Register built-in providers
    this.providerFactory.register(
      BaseProviderTypes.OPENAI,
      (config) => new OpenAIProvider(config as OpenAIConfig),
    );
    this.providerFactory.register(
      BaseProviderTypes.ANTHROPIC,
      (config) => new AnthropicProvider(config as AnthropicConfig),
    );

    if (autoSetup) {
      this.setupCommands();
    }
  }

  private setupCommands(): void {
    this.program
      .name("mcpilot")
      .description("MCPilot CLI Interface")
      .version(version);

    this.program
      .command("start")
      .description("Start a new session")
      .argument("<instruction>", "Instruction text for the LLM")
      .option("-m, --model <name>", "Model to use")
      .option(
        "-l, --log-level <level>",
        "Log level (debug|info|warn|error)",
        "info",
      )
      .option(
        "-c, --config <path>",
        "Path to config file",
        "./mcpilot.config.json",
      )
      .option("-r, --role <name>", "Role to use for the session")
      .option(
        "--roles-config <path>",
        "Path to roles configuration file",
        ".mcpilot-roles.json",
      )
      .action(this.#handleStart.bind(this));

    this.program
      .command("resume")
      .description("Resume a session from log file")
      .argument("<logPath>", "Path to session log file")
      .argument("<instruction>", "Instruction text for the LLM")
      .action(this.handleResume.bind(this));
  }

  async #createProvider(
    config: MCPilotConfig,
    options: any,
  ): Promise<ILLMProvider> {
    // Get the provider configuration
    const providerName = config.session.defaultProvider;
    const providerConfig = config.providers[providerName];

    if (!providerConfig) {
      throw new MCPilotError(
        `Provider '${providerName}' not found in providers configuration`,
        "INVALID_PROVIDER",
        ErrorSeverity.HIGH,
      );
    }

    // Create provider using config
    const pConfig = {
      name: providerName,
      modelName: options.model || providerConfig.model,
      ...providerConfig,
    };

    const provider = this.providerFactory.create(
      providerName as ProviderType,
      pConfig,
    );

    provider.initialize(pConfig);
    return provider;
  }

  async #createConfig(options: any): Promise<MCPilotConfig> {
    // Load configuration
    const configLoader = new ConfigLoader({
      configPath: options.config,
      env: process.env,
    });

    return configLoader.load();
  }

  async #handleStart(instruction: string, options: any): Promise<void> {
    try {
      const config = await this.#createConfig(options);

      // Initialize session manager with config and roles
      this.sessionManager = new SessionManager(
        config,
        await this.#createProvider(config, options),
        options.rolesConfig,
        options.role,
      );

      await this.sessionManager.createSession();
      console.log("Session started successfully");
      await this.handleExecute(instruction);
    } catch (error) {
      this.handleError(error);
    }
  }

  private async handleResume(
    logPath: string,
    instruction: string,
    options: any,
  ): Promise<void> {
    try {
      if (!this.sessionManager) {
        const config = await this.#createConfig(options);
        this.sessionManager = new SessionManager(
          config,
          await this.#createProvider(config, options),
          options.rolesConfig,
        );
      }

      await this.sessionManager.resumeSession(logPath);

      console.log("Session resumed successfully");
      await this.handleExecute(instruction);
    } catch (error) {
      this.handleError(error);
    }
  }

  private async handleExecute(message: string): Promise<void> {
    try {
      if (!this.sessionManager) {
        throw new MCPilotError(
          "No active session",
          "NO_SESSION",
          ErrorSeverity.HIGH,
        );
      }

      await this.sessionManager.executeMessage(message);
    } catch (error) {
      this.handleError(error);
    }
  }

  private handleError(error: any): void {
    if (error instanceof MCPilotError) {
      console.error(`Error: ${error.message} (${error.code})`);
    } else {
      console.error("Unexpected error:", error);
    }
    process.exit(1);
  }

  public async run(argv: string[] = process.argv): Promise<void> {
    try {
      await this.program.parseAsync(argv);
    } catch (error) {
      this.handleError(error);
    }
  }
}

export function runCLI() {
  const cli = new MCPilotCLI(true);
  return cli.run().catch(console.error);
}

// Create and execute CLI only if this file is run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCLI();
}
