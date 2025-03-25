/**
 * Core session management interfaces defining how the system manages conversation context,
 * message flow and logging across a single interaction session.
 */

import { RoleConfig } from "../config/types.ts";
import type { Message } from "./message.ts";

export interface Session {
  // Core session properties
  id: string;
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
  role?: RoleConfig;
  custom?: Record<string, any>;
}

export enum LogLevel {
  DEBUG = "debug",
  INFO = "info",
  WARN = "warn",
  ERROR = "error",
}
