/**
 * Example of MCP tool integration
 */

import {
  createSession,
  LogLevel,
  ProviderType,
  createProviderFactory
} from "../src/index.js";
import { AnthropicProvider } from "../src/providers/implementations/anthropic-provider.js";
import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function mcpIntegrationDemo() {
  console.log("Starting MCP integration demo...\n");

  // Check for API key
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY environment variable is required");
  }

  // First, ensure we have proper MCP configuration
  const mcpConfig = {
    mcpServers: {
      "example-server": {
        command: "node",
        args: [path.join(__dirname, "example-mcp-server.js")],
        env: {},
        disabled: false,
      },
    },
  };

  // Write MCP config
  await fs.writeFile(
    path.join(process.cwd(), "mcpSettings.json"),
    JSON.stringify(mcpConfig, null, 2)
  );

  console.log("Configured MCP server settings");

  // Create example text file
  await fs.writeFile(
    path.join(__dirname, "example.txt"),
    "Hello! This is a test file for the MCP demo.\n" +
    "It demonstrates reading files through the file-reader tool.\n" +
    "The tool should successfully read this content and return it."
  );

  console.log("Created example.txt file");

  // Set up provider
  const providerFactory = createProviderFactory();
  providerFactory.register(
    ProviderType.ANTHROPIC,
    (config) => new AnthropicProvider(config)
  );

  const config = {
    name: ProviderType.ANTHROPIC,
    modelName: "claude-3-opus-20240229",
    apiKey: process.env.ANTHROPIC_API_KEY,
    temperature: 0,
    options: {
      stopSequences: ["\n\nHuman:", "\n\nAssistant:"],
    },
  };

  const provider = providerFactory.create(ProviderType.ANTHROPIC, config);
  await provider.initialize(config);

  console.log("Initialized provider");

  // Create a new session
  const session = await createSession({
    logLevel: LogLevel.DEBUG,
    provider,
  });

  // Set system prompt with MCP tool usage instructions
  session.updateContext({
    systemPrompt: `You have access to MCP tools. To use a tool, you must use proper XML-style tags like this:
<use_mcp_tool>
<server_name>example-server</server_name>
<tool_name>file-reader</tool_name>
<arguments>
{
  "path": "path/to/file"
}
</arguments>
</use_mcp_tool>

Only show the actual file contents returned by the tool. Do not add any commentary or additional text.`
  });

  console.log("Created and configured session\n");

  try {
    // Test 1: Reading an existing file
    console.log("Test 1: Reading example.txt");
    const response1 = await session.executeMessage(
      "Use the file-reader tool from example-server to read the content of examples/example.txt"
    );
    console.log("Response:", response1.content);

    // Test 2: Attempting to read a non-existent file
    console.log("\nTest 2: Attempting to read non-existent file");
    const response2 = await session.executeMessage(
      "Use the file-reader tool from example-server to read examples/nonexistent.txt"
    );
    console.log("Response:", response2.content);

    // Clean up
    await session.endSession();
    console.log("\nDemo completed successfully");
  } catch (error) {
    console.error("Error in MCP integration demo:", error);
    await session.endSession();
    throw error;
  }
}

// Run the demo if executed directly
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  mcpIntegrationDemo().catch(console.error);
}

export default mcpIntegrationDemo;
