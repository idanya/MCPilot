/**
 * Test setup file for MCPilot
 */

import { SessionManager } from '../services/session';
import { ProviderFactory } from '../providers';
import { LogLevel } from '../interfaces/base/session';
import { MCPilotConfig } from '../interfaces/config/types';
import { jest, beforeAll, afterAll, afterEach } from '@jest/globals';
import { ILLMProvider, ProviderConfig } from '../interfaces/llm/provider';
import { Context } from '../interfaces/base/context';
import { Response, ResponseType } from '../interfaces/base/response';

// Mock environment variables for tests
process.env.NODE_ENV = 'test';

// Global test timeout
jest.setTimeout(30000);

// Mock console methods to prevent noise during tests
const originalConsole = { ...console };
beforeAll(() => {
    console.log = jest.fn();
    console.info = jest.fn();
    console.warn = jest.fn();
    console.error = jest.fn();
});

afterAll(() => {
    console.log = originalConsole.log;
    console.info = originalConsole.info;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
});
// Create mock provider for tests
export const createMockProvider = (): ILLMProvider => ({
    initialize: jest.fn(async (config: ProviderConfig) => {}),
    processMessage: jest.fn(async (context: Context) => ({
        id: 'mock_response',
        type: ResponseType.TEXT,
        content: { text: 'Mock response' },
        metadata: {},
        timestamp: new Date()
    })),
    shutdown: jest.fn(async () => {})
});

// Create shared test instances
export const createTestSession = async () => {
    const mockProvider = createMockProvider();
    await mockProvider.initialize({ name: 'mock', modelName: 'test-model' });
    
    const testConfig: MCPilotConfig = {
        providers: {
            mock: { model: 'test-model' }
        },
        session: {
            logDirectory: './__tests__/sessions',
            contextSize: 4096,
            maxQueueSize: 100,
            defaultProvider: 'mock'
        },
        logging: {
            level: 'ERROR' as const,
            format: 'json' as const
        },
        mcp: {
            servers: {}  // Empty MCP servers for testing
        }
    };

    const session = new SessionManager(testConfig, mockProvider);
    session.setLogLevel(LogLevel.ERROR); // Minimize logging in tests
    session.createSession();
    return session;
};

export const createTestProviderFactory = () => {
    return new ProviderFactory();
};

// Export mock provider for tests that need it directly
export const getMockProvider = createMockProvider;

// Clean up test artifacts
afterEach(async () => {
    try {
        // Clean up test session files
        // Implementation would remove test log files
    } catch (error) {
        console.error('Failed to clean up test artifacts:', error);
    }
});

// Global test utilities
export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const createMockMessage = (content: string) => ({
    id: `test_${Date.now()}`,
    type: 'user' as const,
    content,
    timestamp: new Date(),
});

// Test environment checks
if (!process.env.NODE_ENV || process.env.NODE_ENV !== 'test') {
    throw new Error('Tests must be run with NODE_ENV=test');
}

// Ensure test directory exists
import * as fs from 'fs';
import * as path from 'path';

const testDir = path.join(process.cwd(), '__tests__', 'sessions');
if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
}