/**
 * Session hierarchy management implementation
 */

import { Message, MessageType } from "../../interfaces/base/message.ts";
import { Session, SessionStatus } from "../../interfaces/base/session.ts";
import { SessionStorage } from "./session-storage.ts";

export interface SessionHierarchyManagerOptions {
  getSession: (sessionId: string) => Session;
  updateSession: (sessionId: string, sessionData: Partial<Session>) => void;
  executeMessage: (sessionId: string, message: string | Message) => Promise<any>;
  sessionStorage: SessionStorage;
  generateMessageId: () => string;
}

export class SessionHierarchyManager {
  private getSession: (sessionId: string) => Session;
  private updateSession: (sessionId: string, sessionData: Partial<Session>) => void;
  private executeMessage: (sessionId: string, message: string | Message) => Promise<any>;
  private sessionStorage: SessionStorage;
  private generateMessageId: () => string;

  constructor(options: SessionHierarchyManagerOptions) {
    this.getSession = options.getSession;
    this.updateSession = options.updateSession;
    this.executeMessage = options.executeMessage;
    this.sessionStorage = options.sessionStorage;
    this.generateMessageId = options.generateMessageId;
  }

  /**
   * Create a child session linked to a parent
   */
  public async createChildSession(
    parentId: string,
    role: string,
    initialPrompt: string,
    createSession: (role?: string) => Promise<Session>
  ): Promise<Session> {
    // Create a new session
    const childSession = await createSession(role);

    // Link child to parent
    this.updateSession(childSession.id, {
      parentId: parentId
    });

    // Add child ID to parent's child list
    const parentSession = this.getSession(parentId);
    this.updateSession(parentId, {
      childSessionIds: [
        ...(parentSession.childSessionIds || []),
        childSession.id,
      ],
    });

    // Update session metadata to reflect hierarchy
    this.updateSessionHierarchy(parentId, childSession.id);

    // Add initial prompt as first user message if provided
    if (initialPrompt) {
      await this.executeMessage(childSession.id, initialPrompt);
    }

    return childSession;
  }

  /**
   * Complete a child session and send results to parent
   */
  public async completeChildSession(
    sessionId: string,
    summary: string,
  ): Promise<void> {
    const session = this.getSession(sessionId);

    if (!session.parentId) {
      throw new Error("Cannot complete session - not a child session");
    }

    // Update session status
    this.updateSession(sessionId, {
      status: SessionStatus.COMPLETED,
    });

    // Update parent session with child completion
    this.updateChildSessionStatus(
      session.parentId,
      sessionId,
      SessionStatus.COMPLETED,
      summary,
    );

    // Create a message in the parent session with the summary
    await this.executeMessage(session.parentId, {
      id: this.generateMessageId(),
      type: MessageType.CHILD_SESSION_RESULT,
      content: summary,
      timestamp: new Date(),
      metadata: {
        childSessionId: sessionId,
      },
    });
  }

  /**
   * Update session hierarchy metadata
   */
  private updateSessionHierarchy(parentId: string, childId: string): void {
    // Update parent session metadata
    const parentSession = this.getSession(parentId);
    const childSession = this.getSession(childId);

    if (!parentSession.metadata.sessionHierarchy) {
      parentSession.metadata.sessionHierarchy = {
        childSessions: [],
      };
    }

    parentSession.metadata.sessionHierarchy.childSessions!.push({
      id: childId,
      status: SessionStatus.ACTIVE,
    });

    // Update child session metadata
    if (!childSession.metadata.sessionHierarchy) {
      childSession.metadata.sessionHierarchy = {};
    }

    childSession.metadata.sessionHierarchy.parentId = parentId;

    // Save both sessions
    this.sessionStorage.saveSessionToFile(parentSession);
    this.sessionStorage.saveSessionToFile(childSession);
  }

  /**
   * Update child session status in parent metadata
   */
  private updateChildSessionStatus(
    parentId: string,
    childId: string,
    status: SessionStatus,
    summary?: string,
  ): void {
    const parentSession = this.getSession(parentId);

    if (!parentSession?.metadata?.sessionHierarchy?.childSessions) {
      return;
    }

    const childSessions = parentSession.metadata.sessionHierarchy.childSessions;
    const childIndex = childSessions.findIndex((c) => c.id === childId);

    if (childIndex >= 0) {
      childSessions[childIndex] = {
        ...childSessions[childIndex],
        status,
        summary,
      };
    }

    this.sessionStorage.saveSessionToFile(parentSession);
  }
}