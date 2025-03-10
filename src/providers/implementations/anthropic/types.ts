/**
 * Anthropic provider specific types
 */

import { Message } from '../../../interfaces/base/message';

export type AnthropicMessageRole = 'user' | 'assistant' | 'system';

export interface AnthropicMessage {
    role: AnthropicMessageRole;
    content: string;
}

export interface AnthropicResponse {
    id: string;
    content: Array<{
        text: string;
    }>;
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
    messages: AnthropicMessage[];
    max_tokens: number;
    temperature?: number;
    system?: string;
    stream?: boolean;
}