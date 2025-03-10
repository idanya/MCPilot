/**
 * MCP configuration schema definition using zod
 */

import { z } from 'zod';

// Base schemas for MCP configuration
export const mcpToolSchema = z.object({
  name: z.string(),
  description: z.string(),
  inputSchema: z.object({
    type: z.literal('object'),
    properties: z.record(z.object({
      type: z.string(),
      description: z.string(),
      default: z.any().optional(),
      enum: z.array(z.any()).optional(),
      minimum: z.number().optional(),
      maximum: z.number().optional(),
      pattern: z.string().optional()
    })),
    required: z.array(z.string())
  })
});

export const mcpResourceSchema = z.object({
  uri: z.string(),
  name: z.string(),
  description: z.string().optional(),
  mimeType: z.string().optional()
});

export const mcpResourceTemplateSchema = z.object({
  uriTemplate: z.string(),
  name: z.string(),
  description: z.string().optional(),
  mimeType: z.string().optional()
});

// Server configuration schema
export const mcpServerConfigSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  disabled: z.boolean().optional().default(false),
  timeout: z.number().min(1).max(3600).optional().default(60),
  alwaysAllow: z.array(z.string()).optional().default([]),
  type: z.enum(['stdio', 'http']).optional().default('stdio')
});

// Root MCP configuration schema
export const mcpConfigSchema = z.object({
  mcpServers: z.record(mcpServerConfigSchema)
}).strict();

// Server connection state schema
export const mcpServerStateSchema = z.object({
  name: z.string(),
  config: z.union([z.string(), z.record(z.any())]),
  status: z.enum(['connected', 'connecting', 'disconnected']),
  error: z.string().optional(),
  disabled: z.boolean().optional(),
  tools: z.array(mcpToolSchema).optional(),
  resources: z.array(mcpResourceSchema).optional(),
  resourceTemplates: z.array(mcpResourceTemplateSchema).optional()
});

// Export schema types
export type McpToolSchema = z.infer<typeof mcpToolSchema>;
export type McpResourceSchema = z.infer<typeof mcpResourceSchema>;
export type McpResourceTemplateSchema = z.infer<typeof mcpResourceTemplateSchema>;
export type McpServerConfig = z.infer<typeof mcpServerConfigSchema>;
export type McpConfig = z.infer<typeof mcpConfigSchema>;
export type McpServerState = z.infer<typeof mcpServerStateSchema>;

// Validation functions
/**
 * Validation functions return zod's SafeParseReturnType
 */
export const validateMcpConfig = (config: unknown) => {
  return mcpConfigSchema.safeParse(config);
};

export const validateServerConfig = (config: unknown) => {
  return mcpServerConfigSchema.safeParse(config);
};

export const validateServerState = (state: unknown) => {
  return mcpServerStateSchema.safeParse(state);
};

// Helper function to create a default server configuration
export const createDefaultServerConfig = (command: string): McpServerConfig => {
  return {
    command,
    disabled: false,
    timeout: 60,
    alwaysAllow: [],
    type: 'stdio'
  };
};