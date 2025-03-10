/**
 * Local provider specific types for handling local LLM implementations
 */

import { Message } from '../../../interfaces/base/message';

export interface LocalMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface LocalModelConfig {
    modelPath: string;
    contextSize: number;
    threads: number;
    batchSize?: number;
    quantization?: 'q4_0' | 'q4_1' | 'q5_0' | 'q5_1' | 'q8_0';
    gpuLayers?: number;
    seed?: number;
}

export interface LocalCompletion {
    id: string;
    generated_text: string;
    model: string;
    usage: {
        prompt_tokens: number;
        generated_tokens: number;
        total_tokens: number;
    };
    performance: {
        tokens_per_second: number;
        total_duration_ms: number;
    };
}

export interface LocalStreamChunk {
    token: string;
    logprob: number;
    is_eos: boolean;
}

export interface LocalError {
    error: {
        code: string;
        message: string;
        details?: any;
    };
}

export interface LocalGenerationParams {
    temperature?: number;
    top_p?: number;
    top_k?: number;
    repetition_penalty?: number;
    max_tokens?: number;
    stop_sequences?: string[];
    frequency_penalty?: number;
    presence_penalty?: number;
}

export type LocalRequestMessage = Omit<Message, 'id' | 'timestamp' | 'metadata'> & {
    role: 'system' | 'user' | 'assistant';
};

export interface LocalModelStats {
    model_size: number;
    vocabulary_size: number;
    context_size: number;
    threads: number;
    gpu_layers?: number;
    loaded_at: Date;
    last_used: Date;
    total_tokens_generated: number;
    total_requests: number;
    average_tokens_per_second: number;
}

export interface LocalGenerationMetrics {
    prompt_tokens: number;
    generated_tokens: number;
    total_tokens: number;
    tokens_per_second: number;
    total_duration_ms: number;
    gpu_memory_used?: number;
    cpu_memory_used: number;
}

export interface LocalModelCapabilities {
    supports_streaming: boolean;
    supports_gpu: boolean;
    supports_batching: boolean;
    max_batch_size?: number;
    supported_quantization: string[];
}

export interface LocalGenerationResult {
    text: string;
    metrics: LocalGenerationMetrics;
    raw_response: LocalCompletion;
}