/**
 * Core session management interfaces defining how the system manages conversation context,
 * message flow and logging across a single interaction session.
 */

import type { Message } from "./message.ts";
import type { SessionState } from "./state.ts";

export interface Session {
  // Core session properties
  id: string;
  state: SessionState;
  systemPrompt: string;
  messages: Message[];
  metadata: SessionMetadata;
}

export interface SessionMetadata {
  timestamp: Date;
  environment: {
    cwd: string;
    os: string;
    shell: string;
  };
  role?: {
    name: string;
    definition: string;
    instructions: string;
  };
  custom?: Record<string, any>;
}

export enum LogLevel {
  DEBUG = "debug",
  INFO = "info",
  WARN = "warn",
  ERROR = "error",
}
