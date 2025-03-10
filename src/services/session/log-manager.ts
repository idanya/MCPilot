/**
 * Manages session logging and log file operations
 */

import { ILogManager, LogLevel } from '../../interfaces/base/session';
import { MCPilotError, ErrorSeverity } from '../../interfaces/error/types';
import * as fs from 'fs';
import * as path from 'path';

export class LogManager implements ILogManager {
    private logLevel: LogLevel;
    private readonly logDir: string;
    private readonly maxLogSize: number;

    constructor(logDir: string, level: LogLevel = LogLevel.INFO, maxLogSize: number = 10 * 1024 * 1024) {
        this.logDir = logDir;
        this.logLevel = level;
        this.maxLogSize = maxLogSize;
        this.ensureLogDirectory();
    }

    public log(level: LogLevel, message: string, metadata?: { sessionId?: string; [key: string]: any }): void {
        if (this.shouldLog(level)) {
            try {
                const logEntry = {
                    timestamp: new Date().toISOString(),
                    level,
                    message,
                    metadata
                };

                const logPath = this.getLogPath(metadata?.sessionId as string);
                fs.appendFileSync(
                    logPath,
                    JSON.stringify(logEntry) + '\n',
                    'utf8'
                );

                if (this.shouldRotate(logPath)) {
                    this.rotate().catch(console.error);
                }
            } catch (error) {
                console.error('Failed to write log:', error);
                throw new MCPilotError(
                    'Failed to write log',
                    'LOG_WRITE_FAILED',
                    ErrorSeverity.HIGH,
                    { error }
                );
            }
        }
    }

    public getLogStream(sessionId: string): ReadableStream {
        try {
            const logPath = this.getLogPath(sessionId);
            const fileStream = fs.createReadStream(logPath, { encoding: 'utf8' });
            
            return new ReadableStream({
                start(controller) {
                    fileStream.on('data', (chunk) => controller.enqueue(chunk));
                    fileStream.on('end', () => controller.close());
                    fileStream.on('error', (error) => controller.error(error));
                }
            });
        } catch (error) {
            throw new MCPilotError(
                'Failed to create log stream',
                'LOG_STREAM_FAILED',
                ErrorSeverity.HIGH,
                { sessionId, error }
            );
        }
    }

    public setLogLevel(level: LogLevel): void {
        this.logLevel = level;
    }

    public async rotate(): Promise<void> {
        try {
            const files = await fs.promises.readdir(this.logDir);
            for (const file of files) {
                if (file.endsWith('.log')) {
                    const logPath = path.join(this.logDir, file);
                    const stats = await fs.promises.stat(logPath);
                    
                    if (stats.size > this.maxLogSize) {
                        const timestamp = new Date().getTime();
                        const rotatedPath = `${logPath}.${timestamp}`;
                        await fs.promises.rename(logPath, rotatedPath);
                    }
                }
            }
        } catch (error) {
            throw new MCPilotError(
                'Failed to rotate logs',
                'LOG_ROTATION_FAILED',
                ErrorSeverity.HIGH,
                { error }
            );
        }
    }

    private shouldLog(level: LogLevel): boolean {
        const levels = Object.values(LogLevel);
        return levels.indexOf(level) >= levels.indexOf(this.logLevel);
    }

    private shouldRotate(logPath: string): boolean {
        try {
            const stats = fs.statSync(logPath);
            return stats.size > this.maxLogSize;
        } catch {
            return false;
        }
    }

    private getLogPath(sessionId?: string): string {
        const filename = sessionId ? `${sessionId}.log` : 'system.log';
        return path.join(this.logDir, filename);
    }

    public getDirectory(): string {
        return this.logDir;
    }

    private ensureLogDirectory(): void {
        try {
            if (!fs.existsSync(this.logDir)) {
                fs.mkdirSync(this.logDir, { recursive: true });
            }
        } catch (error) {
            throw new MCPilotError(
                'Failed to create log directory',
                'LOG_DIR_CREATION_FAILED',
                ErrorSeverity.HIGH,
                { dir: this.logDir, error }
            );
        }
    }
}