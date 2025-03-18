/**
 * Configuration wizard for first-time setup
 * Creates a minimal config file in the user's home directory
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as readline from "readline";
import { MCPilotConfig } from "../interfaces/config/types.ts";
import { validateConfig } from "../services/config/config-schema.ts";

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false, // Disable terminal raw mode to prevent double echoing
});

// Promisify readline question
function question(query: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      resolve(answer);
    });
  });
}

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

async function runWizard(): Promise<void> {
  console.log("\n🧙 MCPilot Configuration Wizard 🧙\n");
  console.log(
    "This wizard will help you create a basic configuration file for MCPilot.",
  );
  console.log(
    "The config file will be saved to ~/.mcpilot/.mcpilot.config.json\n",
  );

  // Step 1: Choose provider
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
  console.log(`Environment variable name: ${provider.toUpperCase()}_API_KEY\n`);

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

  // Create config object with required fields for validation
  // We need to use 'as any' to bypass TypeScript's type checking
  // because there's a discrepancy between the TypeScript interface and the Zod schema
  const config: MCPilotConfig = {
    providers: {
      [provider]: {
        model,
        ...(apiKey ? { apiKey } : {}),
      },
    },
    session: {
      logDirectory: "./logs",
      contextSize: 4096,
      maxQueueSize: 100,
      defaultProvider: provider,
    },
    logging: {
      level: "INFO",
    },
  };

  // Validate config
  const validationResult = validateConfig(config);
  if (!validationResult.success) {
    console.error("Error: Invalid configuration");
    console.error(validationResult.error);
    rl.close();
    return;
  }

  // Create directory if it doesn't exist
  const homeDir = os.homedir();
  const configDir = path.join(homeDir, ".mcpilot");
  const configPath = path.join(configDir, ".mcpilot.config.json");

  try {
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
      console.log(`Created directory: ${configDir}`);
    }

    // Write config file
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log(`\n✅ Configuration saved to: ${configPath}`);
    console.log("\nYou can now use MCPilot with this configuration.");

    if (useEnvVar.toLowerCase() === "y") {
      console.log(
        `\nRemember to set the ${provider.toUpperCase()}_API_KEY environment variable before using MCPilot.`,
      );
    }
  } catch (error) {
    console.error("Error saving configuration file:", error);
  }

  rl.close();
}

// Note: In ES modules, we can't use require.main === module
// This will be handled by the CLI command

export { runWizard };
