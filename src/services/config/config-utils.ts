/**
 * Shared utilities for config loaders
 */

import * as fs from "fs";
import * as path from "path";
import { ErrorSeverity, MCPilotError } from "../../interfaces/error/types.ts";

const MCPILOT_DIR_NAME = ".mcpilot";

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
    // First try in the .mcpilot directory
    const mcpilotDirPath = path.join(currentDir, MCPILOT_DIR_NAME);
    const mcpilotConfigPath = path.join(mcpilotDirPath, fileName);
    searchedPaths.push(mcpilotConfigPath);

    if (fs.existsSync(mcpilotConfigPath)) {
      return mcpilotConfigPath;
    }

    // If not found in .mcpilot directory, try in the current directory
    const configPath = path.join(currentDir, fileName);
    searchedPaths.push(configPath);

    if (fs.existsSync(configPath)) {
      return configPath;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      // Reached root directory
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
    currentDir = parentDir;
  }
}
