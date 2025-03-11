/**
 * CLI entry point for MCPilot
 */

import { Command } from "commander";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import {
  AnthropicConfig,
  AnthropicProvider,
  ProviderType,
  OpenAIConfig,
  OpenAIProvider,
  ProviderFactory,
} from "../providers/index";
import { SessionManager } from "../services/session/index";
import { handleError, handleResume, handleStart } from "./actions";
import { MCPilotCLIOptions } from "./types";
import { readFileSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(join(__dirname, "../../package.json"), "utf-8"),
);
const version = pkg.version;

class MCPilotCLI {
  private program: Command;
  private sessionManager: { current: SessionManager | null };
  private providerFactory: ProviderFactory;

  constructor(autoSetup = false) {
    this.program = new Command();
    this.sessionManager = { current: null };
    this.providerFactory = new ProviderFactory();

    // Register built-in providers
    this.providerFactory.register(
      ProviderType.OPENAI,
      (config) => new OpenAIProvider(config as OpenAIConfig),
    );
    this.providerFactory.register(
      ProviderType.ANTHROPIC,
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
      .action((instruction: string, options: MCPilotCLIOptions) => {
        handleStart(
          this.sessionManager,
          this.providerFactory,
          instruction,
          options,
        ).catch(handleError);
      });

    this.program
      .command("resume")
      .description("Resume a session from log file")
      .argument("<logPath>", "Path to session log file")
      .argument("<instruction>", "Instruction text for the LLM")
      .action(
        async (
          logPath: string,
          instruction: string,
          options: MCPilotCLIOptions,
        ) => {
          handleResume(
            this.sessionManager.current,
            logPath,
            instruction,
            this.providerFactory,
            options,
          ).catch(handleError);
        },
      );
  }

  public async run(argv: string[] = process.argv): Promise<void> {
    try {
      await this.program.parseAsync(argv);
    } catch (error) {
      handleError(error);
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
