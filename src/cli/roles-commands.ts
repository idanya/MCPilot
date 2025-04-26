/**
 * Roles management commands for MCPilot CLI
 */

import { Command } from "commander";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as readline from "readline";
import { RoleConfigLoader } from "../services/config/role-config-loader.ts";
import { logger } from "../services/logger/index.ts";

/**
 * Lists all available roles in the configuration
 */
export function handleRolesList(configPath?: string): void {
  const roleConfigLoader = new RoleConfigLoader({
    configPath,
  });

  try {
    const rolesConfig = roleConfigLoader.load();
    const roleNames = roleConfigLoader.getAllRoles();

    if (roleNames.length === 0) {
      console.log("No roles found in the configuration.");
      return;
    }

    console.log("\nAvailable roles:");
    roleNames.forEach((name) => {
      const isDefault = name === rolesConfig.defaultRole;
      console.log(`- ${name}${isDefault ? " (default)" : ""}`);
    });

    console.log(`\nTotal: ${roleNames.length} role(s)`);

    if (configPath) {
      console.log(`\nRoles configuration file: ${configPath}`);
    }
  } catch (error) {
    logger.error("Failed to list roles:", error);
    throw error;
  }
}

/**
 * Creates a new role using an interactive wizard
 */
export async function handleRolesCreate(configPath?: string): Promise<void> {
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
    console.log("\n🧙 Create New Role Wizard 🧙\n");

    // Step 1: Role name
    const roleName = await question("Enter role name: ");
    if (!roleName.trim()) {
      console.log("Role name cannot be empty. Aborting.");
      rl.close();
      process.exit(0);
    }

    // Step 2: Role definition
    console.log("\nEnter role definition (describes what the role does):");
    console.log(
      "Example: You are an expert software engineer specializing in TypeScript.",
    );
    const definition = await question("> ");
    if (!definition.trim()) {
      console.log("Role definition cannot be empty. Aborting.");
      rl.close();
      process.exit(0);
    }

    // Step 3: Role instructions
    console.log("\nEnter role instructions (specific guidance for the role):");
    console.log(
      "Example: Focus on writing clean, maintainable code with proper error handling.",
    );
    const instructions = await question("> ");
    if (!instructions.trim()) {
      console.log("Role instructions cannot be empty. Aborting.");
      rl.close();
      process.exit(0);
    }

    // Step 4: Set as default?
    const setAsDefault = await question(
      "\nSet this role as the default? (y/n): ",
    );
    const isDefault = setAsDefault.toLowerCase() === "y";

    // Load existing config
    const roleConfigLoader = new RoleConfigLoader({
      configPath,
    });

    let rolesConfig = roleConfigLoader.load();

    // Create or update the role
    if (!rolesConfig.roles) {
      rolesConfig.roles = {};
    }

    // Check if role already exists
    if (rolesConfig.roles[roleName]) {
      const overwrite = await question(
        `Role '${roleName}' already exists. Overwrite? (y/n): `,
      );
      if (overwrite.toLowerCase() !== "y") {
        console.log("Operation cancelled.");
        rl.close();
        process.exit(0);
      }
    }

    // Add the new role
    rolesConfig.roles[roleName] = {
      definition,
      instructions,
      availableServers: [],
    };

    // Set as default if requested
    if (isDefault) {
      rolesConfig.defaultRole = roleName;
    }

    // Determine the config file path
    let finalConfigPath = configPath;
    if (!finalConfigPath) {
      // Use default path if not specified
      const homeDir = os.homedir();
      const configDir = path.join(homeDir, ".mcpilot");
      finalConfigPath = path.join(configDir, ".mcpilot.roles.json");

      // Create directory if it doesn't exist
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
    }

    // Write the updated config
    fs.writeFileSync(finalConfigPath, JSON.stringify(rolesConfig, null, 2));
    console.log(
      `\n✅ Role '${roleName}' successfully ${rolesConfig.roles[roleName] ? "updated" : "created"}.`,
    );
    console.log(`Configuration saved to: ${finalConfigPath}`);

    rl.close();
    process.exit(0);
  } catch (error) {
    rl.close();
    logger.error("Failed to create role:", error);
    throw error;
  }
}

/**
 * Removes a role from the configuration
 */
export function handleRolesRemove(name: string, configPath?: string): void {
  const roleConfigLoader = new RoleConfigLoader({
    configPath,
  });

  try {
    const rolesConfig = roleConfigLoader.load();

    if (!rolesConfig.roles || !rolesConfig.roles[name]) {
      console.log(`Role '${name}' not found in the configuration.`);
      process.exit(0);
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false, // Disable terminal raw mode to prevent double echoing
    });

    rl.question(
      `Are you sure you want to remove the role '${name}'? (y/n): `,
      (answer) => {
        if (answer.toLowerCase() !== "y") {
          console.log("Operation cancelled.");
          rl.close();
          process.exit(0);
        }

        // Remove the role
        delete rolesConfig.roles[name];

        // If this was the default role, unset the default
        if (rolesConfig.defaultRole === name) {
          delete rolesConfig.defaultRole;
        }

        // Determine the config file path
        let finalConfigPath = configPath;
        if (!finalConfigPath) {
          // Use default path if not specified
          const homeDir = os.homedir();
          const configDir = path.join(homeDir, ".mcpilot");
          finalConfigPath = path.join(configDir, ".mcpilot.roles.json");
        }

        // Write the updated config
        fs.writeFileSync(finalConfigPath, JSON.stringify(rolesConfig, null, 2));
        console.log(`\n✅ Role '${name}' successfully removed.`);
        console.log(`Configuration saved to: ${finalConfigPath}`);

        rl.close();
        process.exit(0);
      },
    );
  } catch (error) {
    logger.error("Failed to remove role:", error);
    throw error;
  }
}

/**
 * Sets up the roles command and its subcommands
 */
export function setupRolesCommands(program: Command): Command {
  // Roles command with subcommands
  const rolesCommand = program
    .command("roles")
    .description("Manage roles for MCPilot")
    .option(
      "--roles-config <path>",
      "Path to roles configuration file",
      // No default path here as we'll search for it
    );

  // List subcommand
  rolesCommand
    .command("list")
    .description("List all available roles")
    .action((options) => {
      try {
        handleRolesList(options.parent?.rolesConfig);
        // Explicitly exit the process
        process.exit(0);
      } catch (error) {
        console.error("Error listing roles:", error);
        process.exit(1);
      }
    });

  // Create subcommand
  rolesCommand
    .command("create")
    .description("Create a new role with a wizard")
    .action(async (options) => {
      try {
        await handleRolesCreate(options.parent?.rolesConfig);
        // Explicitly exit the process
        process.exit(0);
      } catch (error) {
        console.error("Error creating role:", error);
        process.exit(1);
      }
    });

  // Remove subcommand
  rolesCommand
    .command("remove")
    .description("Remove a role by name")
    .argument("<name>", "Name of the role to remove")
    .action((name, options) => {
      try {
        handleRolesRemove(name, options.parent?.rolesConfig);
        // For the remove command, the process.exit is handled in the callback
        // after user confirmation
      } catch (error) {
        console.error("Error removing role:", error);
        process.exit(1);
      }
    });

  return rolesCommand;
}
