/**
 * Core session management interfaces defining how the system manages conversation context,
 * message flow and logging across a single interaction session.
 */

import type { Context } from "./context.js";
import type { Message } from "./message.js";
import type { Response } from "./response.js";
import type { SessionState } from "./state.js";

export type ISessionManager = {
  createSession(): Promise<Session>;
  resumeSession(logPath: string): Promise<Session>;
  executeMessage(message: string): Promise<Response>;
  saveContext(): void;
  endSession(): Promise<void>;
  getSessionState(): SessionState;
  getContext(): Context;
  getMessageHistory(): Message[];
  getSessionLogs(sessionId: string): Promise<ReadableStream>;
  setLogLevel(level: LogLevel): void;
  updateContext(context: Partial<Context>): void;
  getQueueSize(): number;
};

export type Session = {
  id: string;
  context: Context;
  state: SessionState;
};

export type IContextManager = {
  updateContext(data: ContextData): void;
  getContext(): Context;
  clearContext(): void;
  mergeContext(newContext: Partial<Context>): void;
};

export type ILogManager = {
  log(level: LogLevel, message: string, metadata?: object): void;
  getLogStream(sessionId: string): ReadableStream;
  setLogLevel(level: LogLevel): void;
  rotate(): Promise<void>;
  getDirectory(): string;
};

export enum LogLevel {
  DEBUG = "debug",
  INFO = "info",
  WARN = "warn",
  ERROR = "error",
}

export type ContextData = {
  [key: string]: any;
};

export interface IMessageQueue {
  enqueue(message: Message): void;
  dequeue(): Message | null;
  peek(): Message | null;
  size(): number;
  clear(): void;
  getMessages(): Message[];
}
