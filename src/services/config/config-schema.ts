/**
 * Configuration schema definition using zod
 */

import { z } from "zod";
import { McpServerConfig, mcpServerConfigSchema } from "./mcp-schema.ts";

// Provider options schema
const providerOptionsSchema = z
  .object({
    timeout: z.number().positive().optional(),
    retryAttempts: z.number().positive().optional(),
    contextWindow: z.number().positive().optional(),
    streaming: z.boolean().optional(),
    stopSequences: z.array(z.string()).optional(),
    logitBias: z.record(z.number()).optional(),
  })
  .optional();

// Provider-specific schemas
const openAiConfigSchema = z.object({
  model: z.string().min(1),
  apiKey: z.string().min(1).optional(),
  apiEndpoint: z.string().optional(),
  maxTokens: z.number().positive().optional(),
  temperature: z.number().optional(),
  options: providerOptionsSchema,
  apiVersion: z.string().optional(),
  organizationId: z.string().optional(),
  maxRetries: z.number().positive().optional(),
});

const anthropicConfigSchema = z.object({
  model: z.string().min(1),
  apiKey: z.string().min(1).optional(),
  apiEndpoint: z.string().optional(),
  maxTokens: z.number().positive().optional(),
  temperature: z.number().optional(),
  options: providerOptionsSchema,
  apiVersion: z.string().optional(),
  maxTokensToSample: z.number().positive().optional(),
  stopSequences: z.array(z.string()).optional(),
});

const localConfigSchema = z.object({
  model: z.string().min(1),
  apiKey: z.string().min(1).optional(),
  apiEndpoint: z.string().optional(),
  maxTokens: z.number().positive().optional(),
  temperature: z.number().optional(),
  options: providerOptionsSchema,
  modelPath: z.string().min(1),
  quantization: z.enum(["q4_0", "q4_1", "q5_0", "q5_1", "q8_0"]).optional(),
  contextSize: z.number().positive().optional(),
  threads: z.number().positive().optional(),
});

// Provider schemas map
const providersSchemasMap = {
  openai: openAiConfigSchema,
  anthropic: anthropicConfigSchema,
  local: localConfigSchema,
};

// Main configuration schema
export const configSchema = z
  .object({
    providers: z
      .object({
        openai: openAiConfigSchema.optional(),
        anthropic: anthropicConfigSchema.optional(),
        local: localConfigSchema.optional(),
      })
      .and(
        z.record(
          z
            .object({
              model: z.string().min(1),
            })
            .passthrough(),
        ),
      ),

    session: z.object({
      logDirectory: z.string().optional(),
      contextSize: z.number().positive().optional(),
      maxQueueSize: z.number().positive().optional(),
      defaultProvider: z.string(),
    }),

    logging: z.object({
      level: z.enum(["DEBUG", "INFO", "WARN", "ERROR"]),
    }),

    mcp: z
      .object({
        servers: z.record(mcpServerConfigSchema).optional(),
      })
      .optional(),
  })
  .refine(
    (config) => {
      // Ensure defaultProvider exists in providers map
      const providerKeys = Object.keys(config.providers);
      return providerKeys.includes(config.session.defaultProvider);
    },
    {
      message:
        "session.defaultProvider must reference a provider defined in the providers map",
      path: ["session", "defaultProvider"],
    },
  );

// Export schema type
export type ConfigSchema = z.infer<typeof configSchema>;

// Re-export MCP configuration types
export type { McpServerConfig } from "./mcp-schema.ts";

// Helper type for MCP configuration section
export type McpConfigSection = {
  servers: Record<string, McpServerConfig>;
};

// Provider schema utilities
export const getProviderSchema = (type: string) => {
  return (
    providersSchemasMap[type as keyof typeof providersSchemasMap] ??
    z
      .object({
        model: z.string().min(1),
        apiKey: z.string().min(1).optional(),
        apiEndpoint: z.string().optional(),
        maxTokens: z.number().positive().optional(),
        temperature: z.number().optional(),
        options: providerOptionsSchema,
      })
      .passthrough()
  );
};

// Configuration validation function
export const validateConfig = (config: unknown) => {
  return configSchema.safeParse(config);
};

// Provider configuration validation function
export const validateProviderConfig = (type: string, config: unknown) => {
  const schema = getProviderSchema(type);
  return schema.safeParse(config);
};
