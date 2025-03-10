/**
 * Manages the queue of messages being processed in a session
 */

import { IMessageQueue } from '../../interfaces/base/session';
import { Message } from '../../interfaces/base/message';
import { MCPilotError, ErrorSeverity } from '../../interfaces/error/types';

export class MessageQueue implements IMessageQueue {
    private readonly queue: Message[];
    private readonly maxSize: number;

    constructor(maxSize: number = 100) {
        this.queue = [];
        this.maxSize = maxSize;
    }

    public enqueue(message: Message): void {
        if (this.queue.length >= this.maxSize) {
            throw new MCPilotError(
                'Message queue is full',
                'QUEUE_FULL',
                ErrorSeverity.HIGH,
                { maxSize: this.maxSize }
            );
        }

        try {
            this.queue.push(message);
        } catch (error) {
            throw new MCPilotError(
                'Failed to enqueue message',
                'ENQUEUE_FAILED',
                ErrorSeverity.HIGH,
                { error }
            );
        }
    }

    public dequeue(): Message | null {
        if (this.queue.length === 0) {
            return null;
        }

        try {
            return this.queue.shift() || null;
        } catch (error) {
            throw new MCPilotError(
                'Failed to dequeue message',
                'DEQUEUE_FAILED',
                ErrorSeverity.HIGH,
                { error }
            );
        }
    }

    public peek(): Message | null {
        if (this.queue.length === 0) {
            return null;
        }

        try {
            return { ...this.queue[0] };
        } catch (error) {
            throw new MCPilotError(
                'Failed to peek message',
                'PEEK_FAILED',
                ErrorSeverity.HIGH,
                { error }
            );
        }
    }

    public size(): number {
        return this.queue.length;
    }

    public clear(): void {
        try {
            this.queue.length = 0;
        } catch (error) {
            throw new MCPilotError(
                'Failed to clear message queue',
                'CLEAR_FAILED',
                ErrorSeverity.HIGH,
                { error }
            );
        }
    }

    public getMessages(): Message[] {
        try {
            return [...this.queue];
        } catch (error) {
            throw new MCPilotError(
                'Failed to get messages',
                'GET_MESSAGES_FAILED',
                ErrorSeverity.HIGH,
                { error }
            );
        }
    }
}