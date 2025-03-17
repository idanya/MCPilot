/**
 * Anthropic provider specific types
 */

import Anthropic from "@anthropic-ai/sdk";
import { ContentBlock } from "@anthropic-ai/sdk/resources/index.mjs";

export type AnthropicMessageRole = "user" | "assistant";
export const EphemeralCacheControlValue = { type: "ephemeral" };
export type EphemeralCacheControl = typeof EphemeralCacheControlValue;

export interface AnthropicMessage {
  role: AnthropicMessageRole;
  cache_control: EphemeralCacheControl;
  content: string;
}

export interface AnthropicMessageWithCacheControl {
  cache_control: EphemeralCacheControl;
  type: string;
  text: string;
}

export interface AnthropicCacheMessage {
  content: AnthropicMessageWithCacheControl[];
  role: AnthropicMessageRole;
}

export interface AnthropicResponse {
  id: string;
  content: Array<ContentBlock>;
  model: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface AnthropicError {
  error: {
    type: string;
    message: string;
  };
}

export interface AnthropicRequestOptions {
  model: string;
  messages: Anthropic.Messages.MessageParam[];
  max_tokens: number;
  temperature?: number;
  system?: Anthropic.Messages.TextBlockParam[];
  stream?: boolean;
}
