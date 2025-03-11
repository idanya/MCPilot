/**
 * Defines the structure and management of conversation context
 */

import { Message } from "./message";

/**
 * Makes all properties of T optional recursively
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

// Export the type for TypeScript
export type Context = {
  systemPrompt: string;
  messages: Message[];
  tools: ToolContext[];
  metadata: ContextMetadata;
};

export interface ToolContext {
  name: string;
  description: string;
  parameters: ToolParameter[];
  examples: ToolExample[];
}

export interface ToolParameter {
  name: string;
  description: string;
  type: string;
  required: boolean;
  defaultValue?: any;
}

export interface ToolExample {
  description: string;
  usage: string;
}

export interface RoleContext {
  name: string;
  definition: string;
  instructions: string;
  constraints?: {
    allowedCommands?: string[];
    disallowedPaths?: string[];
    maxContextSize?: number;
  };
}

export interface ContextMetadata {
  sessionId: string;
  timestamp: Date;
  environment: {
    cwd: string;
    os: string;
    shell: string;
  };
  role?: RoleContext;
  custom?: Record<string, any>;
}
