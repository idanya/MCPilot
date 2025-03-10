/**
 * Type declarations for MCPilot
 */

import { ProviderConfig, ProviderOptions, ProviderType } from './interfaces/llm/provider';
import { MCPilotConfig } from './interfaces/config/types';
import { MCPilotError, ErrorSeverity } from './interfaces/error/types';
import { BaseLLMProvider } from './providers/base-provider';
import { ProviderFactory } from './providers/provider-factory';
import { Context } from './interfaces/base/context';
import { Response } from './interfaces/base/response';

// Core exports
export { MCPilotCLI } from './cli';
export { createSession, resumeSession, createProviderFactory } from './index';

// Session Management
export {
    SessionFacade,
    SessionManager,
    ContextManager,
    StateTracker,
    MessageQueue,
    LogManager,
    Session,
    Context,
    Message,
    Response,
    LogLevel,
    SessionState
} from './services/session';

// Provider System
export {
    ProviderFactory,
    BaseLLMProvider,
    OpenAIProvider,
    AnthropicProvider,
    LocalProvider,
    ProviderType,
    ProviderConfig,
    ProviderOptions
} from './providers';

// Configuration
export {
    MCPilotConfig,
    ConfigLoaderOptions
} from './interfaces/config/types';

// Error Handling
export {
    MCPilotError,
    ErrorSeverity
} from './interfaces/error/types';

// MCP Types
export {
    McpConnection,
    McpConfig,
    McpTool,
    McpResource,
    McpServer,
    ConnectionStatus,
    McpToolCallResponse,
    McpResourceResponse
} from './entities/mcp';

// Type Utilities
export type DeepPartial<T> = {
    [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

// Module Augmentations
declare module '@modelcontextprotocol/sdk' {
    interface McpTool {
        metadata?: Record<string, any>;
    }
}

// Global Types
declare global {
    namespace MCPilot {
        export type Config = MCPilotConfig;
        export type Provider = BaseLLMProvider;
        export type Factory = ProviderFactory;
        
        export interface CustomProviderConfig extends ProviderConfig {
            type: string;
            capabilities: string[];
            [key: string]: any;
        }

        export abstract class CustomProvider extends BaseLLMProvider {
            readonly type: string;
            readonly capabilities: string[];
            
            constructor(config: CustomProviderConfig);
            
            protected abstract initializeProvider(): Promise<void>;
            protected abstract shutdownProvider(): Promise<void>;
            protected abstract sendRequest(context: Context): Promise<any>;
            protected abstract parseResponse(response: any): Promise<Response>;
        }
    }
}

// Environment Variables
declare global {
    namespace NodeJS {
        interface ProcessEnv {
            OPENAI_API_KEY?: string;
            OPENAI_MODEL?: string;
            ANTHROPIC_API_KEY?: string;
            ANTHROPIC_MODEL?: string;
            MCPILOT_CONFIG_PATH?: string;
            MCPILOT_LOG_LEVEL?: string;
            MCPILOT_LOG_DIR?: string;
            MCPILOT_CONTEXT_SIZE?: string;
        }
    }
}

// Extend Express Request for potential HTTP server integration
declare module 'express-serve-static-core' {
    interface Request {
        mcpilot?: {
            sessionId?: string;
            userId?: string;
            config?: MCPilotConfig;
        };
    }
}

// Default Export
export default MCPilot;