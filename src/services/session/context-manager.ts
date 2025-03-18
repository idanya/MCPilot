/**
 * Manages conversation context and state
 */

import { Context, ContextMetadata } from "../../interfaces/base/context.ts";
import { ContextData } from "../../interfaces/base/session.ts";

import { MCPilotError, ErrorSeverity } from "../../interfaces/error/types.ts";

export class ContextManager {
  private context: Context;

  constructor(initialContext?: Partial<Context>) {
    this.context = {
      systemPrompt: "",
      messages: [],
      metadata: this.createDefaultMetadata(),
      ...initialContext,
    };
  }

  public updateContext(data: ContextData): void {
    try {
      Object.entries(data).forEach(([key, value]) => {
        if (key in this.context) {
          (this.context as any)[key] = value;
        }
      });
    } catch (error) {
      throw new MCPilotError(
        "Failed to update context",
        "CONTEXT_UPDATE_FAILED",
        ErrorSeverity.HIGH,
        { error }
      );
    }
  }

  public getContext(): Context {
    return { ...this.context };
  }

  public clearContext(): void {
    this.context = {
      systemPrompt: "",
      messages: [],
      metadata: this.createDefaultMetadata(),
    };
  }

  public mergeContext(newContext: Partial<Context>): void {
    try {
      this.context = {
        ...this.context,
        ...newContext,
        metadata: {
          ...this.context.metadata,
          ...newContext.metadata,
        },
      };
    } catch (error) {
      throw new MCPilotError(
        "Failed to merge context",
        "CONTEXT_MERGE_FAILED",
        ErrorSeverity.HIGH,
        { error }
      );
    }
  }

  private createDefaultMetadata(): ContextMetadata {
    return {
      sessionId: "",
      timestamp: new Date(),
      environment: {
        cwd: process.cwd(),
        os: process.platform,
        shell: process.env.SHELL || "",
      },
    };
  }
}
