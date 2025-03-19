/**
 * Shared utilities for config loaders
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { ErrorSeverity, MCPilotError } from "../../interfaces/error/types.ts";

const MCPILOT_DIR_NAME = ".mcpilot";

/**
 * Find the nearest .mcpilot directory from the given starting directory
 * If not found, creates one in the user's home directory
 *
 * @param startDir The directory to start searching from
 * @returns The path to the nearest .mcpilot directory, or a newly created one in the home directory
 */
export function findNearestMcpilotDirSync(startDir: string): string | null {
  let currentDir = startDir;

  while (true) {
    const mcpilotDirPath = path.join(currentDir, MCPILOT_DIR_NAME);
    if (fs.existsSync(mcpilotDirPath)) {
      return mcpilotDirPath;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      // Reached root directory, create in home directory
      const homeDir = os.homedir();
      const homeMcpilotDir = path.join(homeDir, MCPILOT_DIR_NAME);

      if (!fs.existsSync(homeMcpilotDir)) {
        fs.mkdirSync(homeMcpilotDir, { recursive: true });
      }

      return homeMcpilotDir;
    }
    currentDir = parentDir;
  }
}

/**
 * Synchronous version of findConfigFileAsync
 *
 * @param startDir The directory to start searching from
 * @param fileName The name of the file to search for
 * @param throwIfNotFound Whether to throw an error if the file is not found
 * @returns The path to the found file, or null if not found and throwIfNotFound is false
 */
export function findConfigFileSync(
  startDir: string,
  fileName: string,
  throwIfNotFound: boolean = false,
): string | null {
  let currentDir = startDir;
  const searchedPaths: string[] = [];

  while (true) {
    // Check if there's a .mcpilot directory from the current level
    const mcpilotDir = findNearestMcpilotDirSync(currentDir);
    if (mcpilotDir) {
      const mcpilotConfigPath = path.join(mcpilotDir, fileName);
      searchedPaths.push(mcpilotConfigPath);

      if (fs.existsSync(mcpilotConfigPath)) {
        return mcpilotConfigPath;
      }

      // Move beyond the directory that contains the current .mcpilot dir
      // so we can find the next one up in the hierarchy
      currentDir = path.dirname(path.dirname(mcpilotDir));
    } else {
      // No more .mcpilot directories found upwards
      break;
    }

    // Check if we've reached the root
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }

  // If we got here, the file wasn't found
  if (throwIfNotFound) {
    throw new MCPilotError(
      "Configuration file not found",
      "CONFIG_NOT_FOUND",
      ErrorSeverity.HIGH,
      { searchedPaths, fileName },
    );
  }
  return null;
}
