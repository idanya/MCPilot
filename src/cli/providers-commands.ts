/**
 * Providers management commands for MCPilot CLI
 */

import { Command } from "commander";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as readline from "readline";
import { ConfigLoader } from "../services/config/config-loader.ts";
import { validateConfig } from "../services/config/config-schema.ts";
import { logger } from "../services/logger/index.ts";

// Available models for each provider
const PROVIDER_MODELS = {
  openai: ["gpt-4o", "gpt-4-turbo", "gpt-4", "gpt-3.5-turbo"],
  anthropic: [
    "claude-3-7-sonnet-latest",
    "claude-3-5-sonnet-latest",
    "claude-3-opus-latest",
    "claude-3-haiku-latest",
  ],
};

/**
 * Lists all available providers in the configuration
 */
export async function handleProvidersList(configPath?: string): Promise<void> {
  try {
    // Create a ConfigLoader instance that will automatically search for the config file
    // if no path is provided
    const configLoader = new ConfigLoader({
      configPath,
    });

    // Load the configuration (this will search for the default file if no path is provided)
    try {
      const config = await configLoader.load();
      const providers = config.providers;
      const providerNames = Object.keys(providers);

      if (providerNames.length === 0) {
        console.log("No providers found in the configuration.");
        return;
      }

      console.log("\nConfigured providers:");
      providerNames.forEach((name) => {
        const provider = providers[name];
        const isDefault = name === config.session.defaultProvider;
        console.log(`- ${name}${isDefault ? " (default)" : ""}`);
        if (provider) {
          console.log(`  Model: ${provider.model}`);
          console.log(
            `  API Key: ${provider.apiKey ? "Configured" : "Not configured"}`,
          );
        }
      });

      console.log(`\nTotal: ${providerNames.length} provider(s)`);

      if (configPath) {
        console.log(`\nConfiguration file: ${configPath}`);
      }
    } catch (error) {
      logger.error("Failed to list providers:", error);
      process.exit(1);
    }
  } catch (error) {
    logger.error("Failed to list providers:", error);
    process.exit(1);
  }
}

/**
 * Creates a new provider using an interactive wizard
 */
export async function handleProvidersAdd(configPath?: string): Promise<void> {
  // Create readline interface with raw mode disabled to prevent character echoing issues
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false, // Disable terminal raw mode to prevent double echoing
  });

  // Promisify readline question
  const question = (query: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(query, (answer) => {
        resolve(answer);
      });
    });
  };

  try {
    console.log("\n🧙 Add New Provider Wizard 🧙\n");

    // Step 1: Choose provider type
    console.log("Step 1: Choose your LLM provider");
    console.log("1. OpenAI");
    console.log("2. Anthropic");

    let providerChoice = "";
    while (!["1", "2"].includes(providerChoice)) {
      providerChoice = await question("Enter your choice (1 or 2): ");
    }

    const provider = providerChoice === "1" ? "openai" : "anthropic";
    console.log(`\nYou selected: ${provider}\n`);

    // Step 2: Choose model
    console.log(`Step 2: Choose your ${provider} model`);
    const models = PROVIDER_MODELS[provider as keyof typeof PROVIDER_MODELS];

    models.forEach((model, index) => {
      console.log(`${index + 1}. ${model}`);
    });

    let modelChoice = "";
    while (!models[parseInt(modelChoice) - 1]) {
      modelChoice = await question(`Enter your choice (1-${models.length}): `);
    }

    const model = models[parseInt(modelChoice) - 1];
    console.log(`\nYou selected: ${model}\n`);

    // Step 3: API Key
    console.log("Step 3: API Key");
    console.log(
      `You can either provide your ${provider} API key now or set it as an environment variable later.`,
    );
    console.log(
      `Environment variable name: ${provider.toUpperCase()}_API_KEY\n`,
    );

    const useEnvVar = await question(
      "Do you want to use an environment variable for the API key? (y/n): ",
    );

    let apiKey = "";
    if (useEnvVar.toLowerCase() === "y") {
      console.log(
        `\nYou'll need to set the ${provider.toUpperCase()}_API_KEY environment variable before using MCPilot.`,
      );
    } else {
      apiKey = await question(`Enter your ${provider} API key: `);
      console.log("\nAPI key will be stored in the config file.");
    }

    // Step 4: Set as default?
    const setAsDefault = await question(
      "\nSet this provider as the default? (y/n): ",
    );
    const isDefault = setAsDefault.toLowerCase() === "y";

    // Load existing config
    // Create a ConfigLoader instance that will automatically search for the config file
    // if no path is provided
    const configLoader = new ConfigLoader({
      configPath,
    });

    // Load the configuration (this will search for the default file if no path is provided)
    configLoader
      .load()
      .then((config) => {
        // Create or update the provider
        if (!config.providers) {
          config.providers = {};
        }

        // Check if provider already exists
        if (config.providers[provider]) {
          console.log(
            `Provider '${provider}' already exists. Updating configuration.`,
          );
        }

        // Add the new provider
        config.providers[provider] = {
          model,
          ...(apiKey ? { apiKey } : {}),
        };

        // Set as default if requested
        if (isDefault) {
          config.session.defaultProvider = provider;
        }

        // Determine the config file path
        let finalConfigPath = configPath;
        if (!finalConfigPath) {
          // Use default path if not specified
          const homeDir = os.homedir();
          const configDir = path.join(homeDir, ".mcpilot");
          finalConfigPath = path.join(configDir, ".mcpilot.config.json");

          // Create directory if it doesn't exist
          if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
          }
        }

        // Validate the updated config
        const validationResult = validateConfig(config);
        if (!validationResult.success) {
          console.error("Error: Invalid configuration");
          console.error(validationResult.error);
          rl.close();
          process.exit(1);
        }

        // Write the updated config
        fs.writeFileSync(finalConfigPath, JSON.stringify(config, null, 2));
        console.log(
          `\n✅ Provider '${provider}' successfully ${config.providers[provider] ? "updated" : "created"}.`,
        );
        console.log(`Configuration saved to: ${finalConfigPath}`);

        rl.close();
        process.exit(0);
      })
      .catch((error) => {
        logger.error("Failed to add provider:", error);
        rl.close();
        process.exit(1);
      });
  } catch (error) {
    rl.close();
    logger.error("Failed to add provider:", error);
    process.exit(1);
  }
}

/**
 * Removes a provider from the configuration
 */
export function handleProvidersRemove(name: string, configPath?: string): void {
  try {
    // Create a ConfigLoader instance that will automatically search for the config file
    // if no path is provided
    const configLoader = new ConfigLoader({
      configPath,
    });

    // Load the configuration (this will search for the default file if no path is provided)
    configLoader
      .load()
      .then((config) => {
        if (!config.providers || !config.providers[name]) {
          console.log(`Provider '${name}' not found in the configuration.`);
          process.exit(0);
        }

        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
          terminal: false, // Disable terminal raw mode to prevent double echoing
        });

        rl.question(
          `Are you sure you want to remove the provider '${name}'? (y/n): `,
          (answer) => {
            if (answer.toLowerCase() !== "y") {
              console.log("Operation cancelled.");
              rl.close();
              process.exit(0);
            }

            // Remove the provider
            delete config.providers[name];

            // If this was the default provider, unset the default
            if (config.session.defaultProvider === name) {
              // Set to the first available provider or empty if none left
              const remainingProviders = Object.keys(config.providers);
              if (remainingProviders.length > 0) {
                config.session.defaultProvider = remainingProviders[0];
                console.log(
                  `Default provider changed to: ${remainingProviders[0]}`,
                );
              } else {
                console.log(
                  "Warning: No default provider set. You will need to configure a new provider.",
                );
              }
            }

            // Determine the config file path
            let finalConfigPath = configPath;
            if (!finalConfigPath) {
              // Use default path if not specified
              const homeDir = os.homedir();
              const configDir = path.join(homeDir, ".mcpilot");
              finalConfigPath = path.join(configDir, ".mcpilot.config.json");
            }

            // Write the updated config
            fs.writeFileSync(finalConfigPath, JSON.stringify(config, null, 2));
            console.log(`\n✅ Provider '${name}' successfully removed.`);
            console.log(`Configuration saved to: ${finalConfigPath}`);

            rl.close();
            process.exit(0);
          },
        );
      })
      .catch((error) => {
        logger.error("Failed to remove provider:", error);
        process.exit(1);
      });
  } catch (error) {
    logger.error("Failed to remove provider:", error);
    process.exit(1);
  }
}

/**
 * Sets a provider as the default in the configuration
 */
export function handleProvidersSetDefault(
  name: string,
  configPath?: string,
): void {
  try {
    // Create a ConfigLoader instance that will automatically search for the config file
    // if no path is provided
    const configLoader = new ConfigLoader({
      configPath,
    });

    // Load the configuration (this will search for the default file if no path is provided)
    configLoader
      .load()
      .then((config) => {
        if (!config.providers || !config.providers[name]) {
          console.log(`Provider '${name}' not found in the configuration.`);
          console.log("Available providers:");
          Object.keys(config.providers || {}).forEach((providerName) => {
            console.log(`- ${providerName}`);
          });
          process.exit(1);
        }

        // Set the provider as default
        config.session.defaultProvider = name;

        // Determine the config file path
        let finalConfigPath = configPath;
        if (!finalConfigPath) {
          // Use default path if not specified
          const homeDir = os.homedir();
          const configDir = path.join(homeDir, ".mcpilot");
          finalConfigPath = path.join(configDir, ".mcpilot.config.json");
        }

        // Write the updated config
        fs.writeFileSync(finalConfigPath, JSON.stringify(config, null, 2));
        console.log(`\n✅ Provider '${name}' set as default.`);
        console.log(`Configuration saved to: ${finalConfigPath}`);

        process.exit(0);
      })
      .catch((error) => {
        logger.error("Failed to set default provider:", error);
        process.exit(1);
      });
  } catch (error) {
    logger.error("Failed to set default provider:", error);
    process.exit(1);
  }
}

/**
 * Sets up the providers command and its subcommands
 */
export function setupProvidersCommands(program: Command): Command {
  // Providers command with subcommands
  const providersCommand = program
    .command("providers")
    .description("Manage LLM providers for MCPilot")
    .option(
      "--config <path>",
      "Path to configuration file",
      // No default path here as we'll search for it
    );

  // List subcommand
  providersCommand
    .command("list")
    .description("List all configured providers")
    .action(async (options) => {
      try {
        await handleProvidersList(options.parent?.config);
        // Explicitly exit the process
        process.exit(0);
      } catch (error) {
        console.error("Error listing providers:", error);
        process.exit(1);
      }
    });

  // Add subcommand
  providersCommand
    .command("add")
    .description("Add a new provider with a wizard")
    .action(async (options) => {
      try {
        await handleProvidersAdd(options.parent?.config);
        // Explicitly exit the process
        process.exit(0);
      } catch (error) {
        console.error("Error adding provider:", error);
        process.exit(1);
      }
    });

  // Remove subcommand
  providersCommand
    .command("remove")
    .description("Remove a provider by name")
    .argument("<name>", "Name of the provider to remove")
    .action((name, options) => {
      try {
        handleProvidersRemove(name, options.parent?.config);
        // For the remove command, the process.exit is handled in the callback
        // after user confirmation
      } catch (error) {
        console.error("Error removing provider:", error);
        process.exit(1);
      }
    });

  // Set default provider subcommand
  providersCommand
    .command("set-default")
    .description("Set a provider as the default")
    .argument("<name>", "Name of the provider to set as default")
    .action((name, options) => {
      try {
        handleProvidersSetDefault(name, options.parent?.config);
        // The process.exit is handled in handleProvidersSetDefault
      } catch (error) {
        console.error("Error setting default provider:", error);
        process.exit(1);
      }
    });

  return providersCommand;
}
