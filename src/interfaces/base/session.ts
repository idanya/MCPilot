/**
 * Core session management interfaces defining how the system manages conversation context,
 * message flow and logging across a single interaction session.
 */

import type { Context, DeepPartial } from "./context.ts";
import type { Message } from "./message.ts";
import type { Response } from "./response.ts";
import type { SessionState } from "./state.ts";

export type ISessionManager = {
  createSession(): Promise<Session>;
  resumeSession(logPath: string): Promise<Session>;
  executeMessage(message: string): Promise<Response>;
  getContext(): Context;
  getMessageHistory(): Message[];
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
  mergeContext(newContext: DeepPartial<Context>): void;
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
