#!/usr/bin/env node

/**
 * CLI entry point for MCPilot
 */

import { Command } from "commander";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import {
  AnthropicConfig,
  AnthropicProvider,
  OpenAIConfig,
  OpenAIProvider,
  ProviderFactory,
  ProviderType,
} from "../providers/index.ts";
import { logger } from "../services/logger/index.ts";
import { handleError, handleResume, handleStart } from "./actions.ts";
import { setupProvidersCommands } from "./providers-commands.ts";
import { setupRolesCommands } from "./roles-commands.ts";
import { MCPilotCLIOptions } from "./types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(join(__dirname, "../../package.json"), "utf-8"),
);
const version = pkg.version;

class MCPilotCLI {
  private program: Command;
  private providerFactory: ProviderFactory;

  constructor(autoSetup = false) {
    this.program = new Command();
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

  // Roles commands have been moved to src/cli/roles-commands.ts

  private setupCommands(): void {
    this.program
      .name("mcpilot")
      .description("MCPilot CLI Interface")
      .version(version);

    this.program
      .command("start")
      .description("Start a new session")
      .argument("[instruction]", "Instruction text for the LLM")
      .option("-i, --instructions-file <path>", "Path to instructions file")
      .option("-m, --model <name>", "Model to use")
      .option(
        "-l, --log-level <level>",
        "Log level (debug|info|warn|error)",
        "info",
      )
      .option(
        "-c, --config <path>",
        "Path to config file",
        // No default path here as we'll search for it
      )
      .option("-r, --role <name>", "Role to use for the session")
      .option(
        "--roles-config <path>",
        "Path to roles configuration file",
        // No default path here as we'll search for it
      )
      .option("--role-file <path>", "Path to a single role configuration file")
      .option(
        "-w, --working-directory <path>",
        "Working directory for the session",
        process.cwd(),
      )
      .option(
        "--auto-approve-tools",
        "Automatically approve MCP tool calls without prompting",
        false,
      )
      .action((instruction: string | undefined, options: MCPilotCLIOptions) => {
        // Validate instruction sources
        if (instruction && options.instructionsFile) {
          logger.error(
            "Error: Cannot use both instruction argument and --instructions-file flag",
          );
          process.exit(1);
        }

        if (!instruction && !options.instructionsFile) {
          logger.error(
            "Error: Must provide either instruction argument or --instructions-file flag",
          );
          process.exit(1);
        }

        let finalInstruction = instruction;
        if (options.instructionsFile) {
          try {
            finalInstruction = readFileSync(options.instructionsFile, "utf-8");
          } catch (error: any) {
            logger.error(
              `Error reading instructions file: ${error?.message || "Unknown error"}`,
            );
            process.exit(1);
          }
        }

        handleStart(this.providerFactory, finalInstruction!, options).catch(
          handleError,
        );
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
            logPath,
            instruction,
            this.providerFactory,
            options,
          ).catch(handleError);
        },
      );

    // Set up providers commands from the extracted module
    setupProvidersCommands(this.program);

    // Set up roles commands from the extracted module
    setupRolesCommands(this.program);
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
  return cli.run().catch((error) => {
    logger.error("Unexpected CLI error:", error);
    process.exit(1);
  });
}

runCLI();
