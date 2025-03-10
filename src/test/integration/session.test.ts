/**
 * Integration tests for session management
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { SessionManager } from '../../services/session';
import { SessionState } from '../../interfaces/base/state';
import { LogLevel } from '../../interfaces/base/session';
import { MCPilotError } from '../../interfaces/error/types';
import { MCPilotConfig } from '../../interfaces/config/types';
import { createTestSession, delay, createMockProvider } from '../setup';

describe('Session Integration', () => {
    let session: SessionManager;

    beforeEach(async () => {
        session = await createTestSession();
    });

    afterEach(async () => {
        if (session) {
            await session.endSession();
        }
    });

    it('should create a new session and process messages', async () => {
        // Start with simple message
        const response = await session.executeMessage('Hello');
        expect(response).toBeDefined();
        expect(response.content).toBeDefined();
        
        // Check session state
        expect(session.getSessionState()).toBe(SessionState.READY);
        expect(session.getQueueSize()).toBe(1);
    });

    it('should maintain context across multiple messages', async () => {
        // Send initial context
        await session.executeMessage('My name is Test User');
        
        // Send follow-up message
        const response = await session.executeMessage('What is my name?');
        expect(response.content).toContain('Test User');
    });

    it('should handle errors gracefully', async () => {
        // Force an error by sending invalid message
        await expect(session.executeMessage('')).rejects.toThrow(MCPilotError);
        
        // Session should recover
        expect(session.getSessionState()).toBe(SessionState.ERROR);
        
        // Should be able to continue after error
        await session.executeMessage('Recover from error');
        expect(session.getSessionState()).toBe(SessionState.READY);
    });

    it('should save and resume session state', async () => {
        // Send initial messages
        await session.executeMessage('Message 1');
        await session.executeMessage('Message 2');
        
        // Save session
        await session.saveContext();
        const context = session.getContext();
        const state = session.getSessionState();
        
        // Create new session and resume
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
                servers: {}
            }
        };
        const newSession = new SessionManager(testConfig, createMockProvider());
        await newSession.resumeSession(context.metadata.sessionId);
        
        // Verify state was restored
        expect(newSession.getSessionState()).toBe(state);
        expect(newSession.getQueueSize()).toBe(2);
        
        // Should be able to continue conversation
        const response = await newSession.executeMessage('Message 3');
        expect(response).toBeDefined();
    });

    it('should handle concurrent message processing', async () => {
        // Send multiple messages concurrently
        const messages = ['Message 1', 'Message 2', 'Message 3'];
        const promises = messages.map(msg => session.executeMessage(msg));
        
        // All messages should be processed
        const responses = await Promise.all(promises);
        expect(responses).toHaveLength(messages.length);
        expect(session.getQueueSize()).toBe(messages.length);
    });

    it('should respect log levels', async () => {
        const consoleSpy = jest.spyOn(console, 'log');
        
        // Set to ERROR level
        session.setLogLevel(LogLevel.ERROR);
        await session.executeMessage('Test message');
        
        // Should not log info messages
        expect(consoleSpy).not.toHaveBeenCalled();
        
        // Set to DEBUG level
        session.setLogLevel(LogLevel.DEBUG);
        await session.executeMessage('Test message');
        
        // Should log debug messages
        expect(consoleSpy).toHaveBeenCalled();
    });

    it('should properly clean up resources on end', async () => {
        await session.executeMessage('Test message');
        await session.endSession();
        
        // Session should be terminated
        expect(session.getSessionState()).toBe(SessionState.TERMINATED);
        
        // Should not be able to send more messages
        await expect(session.executeMessage('New message')).rejects.toThrow();
    });
});