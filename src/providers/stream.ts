export type ApiStream = AsyncGenerator<ApiStreamChunk>;
export type ApiStreamChunk =
  | ApiStreamMessageStop
  | ApiStreamContentBlockStop
  | ApiStreamTextChunk
  | ApiStreamUsageChunk
  | ApiStreamReasoningChunk;

export interface ApiStreamTextChunk {
  type: "text";
  text: string;
}

export interface ApiStreamMessageStop {
  type: "message_stop";
}

export interface ApiStreamContentBlockStop {
  type: "content_block_stop";
}

export interface ApiStreamReasoningChunk {
  type: "reasoning";
  text: string;
}

export interface ApiStreamUsageChunk {
  type: "usage";
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens?: number;
  cacheReadTokens?: number;
  totalCost?: number; // openrouter
}
