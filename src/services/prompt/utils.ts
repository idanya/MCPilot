import { readdir, stat } from "fs/promises";
import * as path from "path";

const FILTERED_DIRECTORIES = ["node_modules", "dist", "build", "coverage"];

export async function listDirectoryContents(
  directory: string,
): Promise<string[]> {
  async function getFiles(dir: string): Promise<string[]> {
    const files: string[] = [];
    const entries = await readdir(dir);

    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      const stats = await stat(fullPath);

      if (stats.isDirectory()) {
        if (entry.startsWith(".") || FILTERED_DIRECTORIES.includes(entry)) {
          continue;
        }

        const subFiles = await getFiles(fullPath);
        files.push(...subFiles);
      } else {
        files.push(path.relative(process.cwd(), fullPath));
      }
    }

    return files;
  }

  return getFiles(directory);
}
