/**
 * Mock LLM provider implementation for testing
 */

import { BaseLLMProvider } from '../../providers/base-provider';
import { Context } from '../../interfaces/base/context';
import { Response } from '../../interfaces/base/response';
import { ProviderConfig } from '../../interfaces/llm/provider';
import { MCPilotError, ErrorSeverity } from '../../interfaces/error/types';
import { ResponseType } from '../../interfaces/base/response';

export interface MockProviderConfig extends ProviderConfig {
    shouldFail?: boolean;
    responseDelay?: number;
    fixedResponse?: string;
}

export class MockProvider extends BaseLLMProvider {
    protected config: MockProviderConfig;
    private requestCount: number = 0;

    constructor(config: MockProviderConfig) {
        super(config);
        this.config = config;
    }

    protected async initializeProvider(): Promise<void> {
        if (this.config.shouldFail) {
            throw new MCPilotError(
                'Mock initialization failure',
                'MOCK_INIT_FAILED',
                ErrorSeverity.HIGH
            );
        }
    }

    protected async shutdownProvider(): Promise<void> {
        // Simulate cleanup
        this.requestCount = 0;
    }

    protected async sendRequest(context: Context): Promise<any> {
        this.requestCount++;

        if (this.config.shouldFail) {
            throw new MCPilotError(
                'Mock request failure',
                'MOCK_REQUEST_FAILED',
                ErrorSeverity.HIGH
            );
        }

        if (this.config.responseDelay) {
            await new Promise(resolve => setTimeout(resolve, this.config.responseDelay));
        }

        return {
            id: `mock_${Date.now()}`,
            response: this.generateResponse(context),
            metadata: {
                requestCount: this.requestCount,
                timestamp: new Date()
            }
        };
    }

    protected async parseResponse(response: any): Promise<Response> {
        return {
            id: response.id,
            type: ResponseType.TEXT,
            content: response.response,
            timestamp: response.metadata.timestamp || new Date(),
            metadata: response.metadata
        };
    }

    private generateResponse(context: Context): string {
        if (this.config.fixedResponse) {
            return this.config.fixedResponse;
        }

        // Generate contextual mock response
        const lastMessage = context.messages[context.messages.length - 1];
        if (!lastMessage) {
            return 'No message provided.';
        }

        // Simple echo response with metadata
        return `Mock response to: "${lastMessage}" (Request #${this.requestCount})`;
    }

    protected getDefaultEndpoint(): string {
        return 'mock://localhost';
    }

    protected getDefaultMaxTokens(): number {
        return 1000;
    }

    protected getDefaultTemperature(): number {
        return 0.5;
    }

    protected getDefaultOptions(): Record<string, any> {
        return {
            mock: true,
            version: '1.0.0'
        };
    }

    // Test helper methods
    public getRequestCount(): number {
        return this.requestCount;
    }

    public resetRequestCount(): void {
        this.requestCount = 0;
    }

    public updateConfig(updates: Partial<MockProviderConfig>): void {
        this.config = {
            ...this.config,
            ...updates
        };
    }
}