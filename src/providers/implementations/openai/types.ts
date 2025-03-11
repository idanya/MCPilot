/**
 * OpenAI provider specific types
 */

import { Message } from "../../../interfaces/base/message";

export interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "function";
  content: string;
  name?: string;
  function_call?: {
    name: string;
    arguments: string;
  };
}

export interface OpenAIFunction {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<
      string,
      {
        type: string;
        description: string;
        enum?: string[];
      }
    >;
    required?: string[];
  };
}

export interface OpenAICompletion {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: {
    index: number;
    message: OpenAIMessage;
    finish_reason: "stop" | "length" | "function_call" | null;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface OpenAIStreamChunk {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: {
    index: number;
    delta: Partial<OpenAIMessage>;
    finish_reason: "stop" | "length" | "function_call" | null;
  }[];
}

export interface OpenAIError {
  error: {
    message: string;
    type: string;
    param?: string;
    code?: string;
  };
}

export interface OpenAIFunctionCall {
  name: string;
  arguments: string;
  result?: any;
}

export type OpenAIRequestMessage = Omit<
  Message,
  "id" | "timestamp" | "metadata"
> & {
  role: "system" | "user" | "assistant" | "function";
  function_call?: OpenAIFunctionCall;
  name?: string;
};
