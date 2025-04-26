/**
 * Message management implementation
 */

import { v4 as uuidv4 } from "uuid";
import { Message, MessageType } from "../../interfaces/base/message.ts";
import { ResponseContent } from "../../interfaces/base/response.ts";
import { Session } from "../../interfaces/base/session.ts";

export interface MessageManagerOptions {
  updateSession: (sessionId: string, sessionData: Partial<Session>) => void;
}

export class MessageManager {
  private updateSession: (sessionId: string, sessionData: Partial<Session>) => void;
  private responseListener?: (
    sessionId: string,
    responseContent: ResponseContent,
  ) => Promise<void>;

  constructor(options: MessageManagerOptions) {
    this.updateSession = options.updateSession;
  }

  /**
   * Create a message object from user input
   */
  public createMessageObject(message: string | Message): Message {
    if (typeof message !== "string") {
      return message;
    }

    return {
      id: this.generateMessageId(),
      type: MessageType.USER,
      content: message,
      timestamp: new Date(),
    };
  }

  /**
   * Add a message to the session
   */
  public addMessageToSession(sessionId: string, message: Message, messages: Message[]): void {
    this.updateSession(sessionId, {
      messages: [...messages, message],
    });
  }

  /**
   * Add the assistant's response to the session
   */
  public async addAssistantResponseToSession(
    sessionId: string,
    responseContent: ResponseContent,
    messages: Message[],
  ): Promise<void> {
    this.addMessageToSession(sessionId, {
      id: this.generateMessageId(),
      type: MessageType.ASSISTANT,
      content: responseContent.text || "",
      timestamp: new Date(),
      metadata: {},
    }, messages);

    // Call the thinking scope listener if it exists and thinkingScope is provided
    if (this.responseListener) {
      await this.responseListener(sessionId, responseContent);
    }
  }

  /**
   * Set a listener for response content
   */
  public setResponseContentListener(
    listener: (
      sessionId: string,
      responseContent: ResponseContent,
    ) => Promise<void>,
  ): void {
    this.responseListener = listener;
  }

  /**
   * Generate a unique message ID
   */
  public generateMessageId(): string {
    return `msg_${uuidv4()}`;
  }
}