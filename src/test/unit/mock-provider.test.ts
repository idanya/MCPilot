/**
 * Unit tests for MockProvider
 */

import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import { MockProvider, MockProviderConfig } from "../mocks/mock-provider";
import { Context } from "../../interfaces/base/context";
import { MCPilotError } from "../../interfaces/error/types";
import { ResponseType } from "../../interfaces/base/response";
import { MessageType } from "../../interfaces/base/message";

describe("MockProvider", () => {
  let provider: MockProvider;
  const defaultConfig: MockProviderConfig = {
    name: "mock",
    modelName: "test-model",
  };

  const createTestContext = (): Context => ({
    systemPrompt: "",
    messages: [
      {
        type: MessageType.USER,
        id: "",
        timestamp: new Date(),
        content: "Test message",
      },
    ],
    tools: [],
    metadata: {
      sessionId: "test",
      timestamp: new Date(),
      environment: {
        cwd: process.cwd(),
        os: process.platform,
        shell: process.env.SHELL || "",
      },
    },
  });

  beforeEach(() => {
    provider = new MockProvider(defaultConfig);
  });

  describe("initialization", () => {
    it("should initialize successfully with default config", async () => {
      await expect(provider.initialize(defaultConfig)).resolves.not.toThrow();
    });

    it("should fail initialization when configured to fail", async () => {
      const failingProvider = new MockProvider({
        ...defaultConfig,
        shouldFail: true,
      });

      await expect(failingProvider.initialize(defaultConfig)).rejects.toThrow(
        MCPilotError
      );
    });
  });

  describe("message processing", () => {
    it("should process messages and return responses", async () => {
      await provider.initialize(defaultConfig);
      const context = createTestContext();

      const response = await provider.processMessage(context);

      expect(response).toBeDefined();
      expect(response.type).toBe(ResponseType.TEXT);
      expect(response.content).toContain("Test message");
      expect(response.timestamp).toBeInstanceOf(Date);
    });

    it("should use fixed response when configured", async () => {
      const fixedResponse = "This is a fixed response";
      provider = new MockProvider({
        ...defaultConfig,
        fixedResponse,
      });

      await provider.initialize(defaultConfig);
      const context = createTestContext();

      const response = await provider.processMessage(context);
      expect(response.content).toBe(fixedResponse);
    });

    it("should respect response delay when configured", async () => {
      const delay = 100;
      provider = new MockProvider({
        ...defaultConfig,
        responseDelay: delay,
      });

      await provider.initialize(defaultConfig);
      const context = createTestContext();

      const startTime = Date.now();
      await provider.processMessage(context);
      const duration = Date.now() - startTime;

      expect(duration).toBeGreaterThanOrEqual(delay);
    });

    it("should fail message processing when configured to fail", async () => {
      provider = new MockProvider({
        ...defaultConfig,
        shouldFail: true,
      });

      await expect(
        provider.processMessage(createTestContext())
      ).rejects.toThrow(MCPilotError);
    });
  });

  describe("request tracking", () => {
    it("should track request count", async () => {
      await provider.initialize(defaultConfig);
      const context = createTestContext();

      expect(provider.getRequestCount()).toBe(0);

      await provider.processMessage(context);
      expect(provider.getRequestCount()).toBe(1);

      await provider.processMessage(context);
      expect(provider.getRequestCount()).toBe(2);
    });

    it("should reset request count on shutdown", async () => {
      await provider.initialize(defaultConfig);
      await provider.processMessage(createTestContext());

      expect(provider.getRequestCount()).toBe(1);

      await provider.shutdown();
      expect(provider.getRequestCount()).toBe(0);
    });
  });

  describe("configuration updates", () => {
    it("should allow runtime config updates", async () => {
      await provider.initialize(defaultConfig);

      const response1 = await provider.processMessage(createTestContext());
      expect(response1.content).toContain("Test message");

      provider.updateConfig({
        fixedResponse: "New response",
      });

      const response2 = await provider.processMessage(createTestContext());
      expect(response2.content).toBe("New response");
    });
  });

  describe("error handling", () => {
    it("should include error details in thrown errors", async () => {
      provider = new MockProvider({
        ...defaultConfig,
        shouldFail: true,
      });

      try {
        await provider.processMessage(createTestContext());
        expect("Error should have been thrown").toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(MCPilotError);
        if (error instanceof MCPilotError) {
          expect(error.code).toBe("MOCK_REQUEST_FAILED");
          expect(error.severity).toBeDefined();
        }
      }
    });
  });
});
