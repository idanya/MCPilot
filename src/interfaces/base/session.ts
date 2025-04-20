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
  
  // New properties for session hierarchy
  parentId?: string;
  childSessionIds: string[];
  status: SessionStatus;
}

export enum SessionStatus {
  ACTIVE = "active",
  COMPLETED = "completed",
  FAILED = "failed"
}

export interface SessionMetadata {
  timestamp: Date;
  environment: {
    cwd: string;
    os: string;
    shell: string;
  };
  role?: RoleConfig;
  roleName?: string;
  custom?: Record<string, any>;
  
  // New properties for session hierarchy
  sessionHierarchy?: {
    parentId?: string;
    childSessions?: {
      id: string;
      status: SessionStatus;
      summary?: string;
    }[];
  };
}

export enum LogLevel {
  DEBUG = "debug",
  INFO = "info",
  WARN = "warn",
  ERROR = "error",
}
