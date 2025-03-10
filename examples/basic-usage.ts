/**
 * Basic usage example of MCPilot system
 */

import * as fs from 'fs';
import {
  createSession,
  resumeSession,
  LogLevel,
  defaultErrorHandler,
  VERSION,
  Response,
  ProviderType,
  createProviderFactory,
} from "../src/index";
import { AnthropicProvider } from "../src/providers/implementations/anthropic-provider";

async function main() {
  try {
    console.log(`MCPilot version ${VERSION}\n`);

    // Create and configure provider factory with Anthropic provider
    const providerFactory = createProviderFactory();
    providerFactory.register(
      ProviderType.ANTHROPIC,
      (config) => new AnthropicProvider(config)
    );

    // Create a new session with custom options and Anthropic provider
    const config = {
      name: ProviderType.ANTHROPIC,
      modelName: "claude-3-5-sonnet-latest",
      apiKey: process.env.ANTHROPIC_API_KEY || "your-api-key-here",
      temperature: 0.7,
      options: {
        stopSequences: ["\n\nHuman:", "\n\nAssistant:"],
      },
    };

    const provider = providerFactory.create(ProviderType.ANTHROPIC, config);
    await provider.initialize(config);

    // Ensure sessions directory exists
    if (!fs.existsSync("./sessions")) {
      fs.mkdirSync("./sessions", { recursive: true });
    }

    const session = await createSession({
      contextSize: 4096,
      maxQueueSize: 100,
      logDirectory: "./sessions",
      logLevel: LogLevel.INFO,
      provider,
    });

    console.log("Session started successfully\n");

    // Simple conversation example
    const responses: Response[] = [];

    // First message
    console.log("Sending first message...");
    const response1 = await session.executeMessage(
      "Hello! Can you help me with some programming tasks?"
    );
    responses.push(response1);
    console.log("Response:", response1.content, "\n");

    // Follow-up message
    console.log("Sending follow-up message...");
    const response2 = await session.executeMessage(
      "I need to write a function that calculates the factorial of a number"
    );
    responses.push(response2);
    console.log("Response:", response2.content, "\n");

    // Get session information
    const context = session.getContext();
    console.log(
      "Current context:",
      {
        messageCount: context.messages.length,
        sessionId: context.metadata.sessionId,
        startTime: context.metadata.timestamp,
      },
      "\n"
    );

    // Save session for later
    session.saveContext();
    console.log("Session saved\n");

    // End the session
    await session.endSession();
    console.log("Session ended\n");

    // Example of resuming a session
    console.log("Resuming previous session...");
    const sessionId = context.metadata.sessionId;
    const logPath = `./sessions/${sessionId}.log`;
    console.log("Resuming from:", logPath);
    const resumedSession = await resumeSession(
      logPath,
      { provider }
    );

    // Continue the conversation
    console.log("Sending message to resumed session...");
    const resumedResponse = await resumedSession.executeMessage(
      "Can you also show me how to implement it recursively?"
    );
    console.log("Response:", resumedResponse.content, "\n");

    // Clean up
    await resumedSession.endSession();
    console.log("Resumed session ended");
  } catch (error: unknown) {
    if (error instanceof Error) {
      defaultErrorHandler(error);
    } else {
      defaultErrorHandler(new Error("An unknown error occurred"));
    }
    process.exit(1);
  }
}

// Run the example if this script is executed directly
if (import.meta.url === new URL(import.meta.url).href) {
  main().catch((error: unknown) => {
    if (error instanceof Error) {
      defaultErrorHandler(error);
    } else {
      defaultErrorHandler(new Error("An unknown error occurred"));
    }
  });
}

export const runExample = main;
